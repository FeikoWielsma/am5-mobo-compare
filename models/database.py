from sqlalchemy import create_engine, Column, String, Integer, JSON, Text
from sqlalchemy.orm import declarative_base, sessionmaker, scoped_session
import re

class DotWrapper:
    """
    Fuzzy dictionary wrapper for template-friendly attribute access.
    
    Enables accessing nested dictionaries with normalized keys, making Jinja2 templates cleaner:
        d.general.audio.codec       # Instead of: d['General']['Audio']['Codec']
        d.usb_20_header             # Instead of: d['USB 2.0 Header']
        d.rj45                      # Instead of: d['# RJ-45']
    
    Normalization Rules:
        1. Case-insensitive matching
        2. Removes symbols: '_', '-', '#', '+', '/', etc.
        3. Removes spaces
        4. Preserves numbers
    
    Examples:
        >>> wrapper = DotWrapper({'Audio Codec+DAC': 'ALC4080'})
        >>> wrapper.audiocodecdac
        'ALC4080'
        >>> wrapper.audio_codec_dac
        'ALC4080'
        
        >>> wrapper = DotWrapper({'# RJ-45': '2'})
        >>> wrapper.rj45
        '2'
        
        >>> wrapper = DotWrapper({'General': {'Audio': {'Codec': 'ALC4080'}}})
        >>> wrapper.general.audio.codec
        'ALC4080'
    
    Missing Keys:
        Returns an empty DotWrapper (null object pattern) to enable safe chaining:
        >>> wrapper = DotWrapper({'Brand': 'ASUS'})
        >>> wrapper.nonexistent.deeply.nested  # Doesn't crash
        <DotWrapper {}>
    """
    def __init__(self, data):
        self._data = data

    def __getattr__(self, name):
        # 1. Exact match (fast path)
        if name in self._data:
            val = self._data[name]
            return DotWrapper(val) if isinstance(val, dict) else val
            
        # 2. Fuzzy match: normalize both target and keys
        # Target: 'usb_20_header' → 'usb20header'
        target_clean = name.lower().replace('_', '').replace(' ', '')
        
        for key, val in self._data.items():
            # Key: '# RJ-45' → 'rj45', 'Audio Codec+DAC' → 'audiocodecdac'
            key_clean = str(key).lower()
            key_clean = re.sub(r'[^a-z0-9]', '', key_clean)
            
            if key_clean == target_clean:
                return DotWrapper(val) if isinstance(val, dict) else val

        # 3. Not found: return empty wrapper (null object pattern)
        return DotWrapper({})
    
    def __getitem__(self, name):
        # Support bracket access d['key']
        return self.__getattr__(str(name))

    def __bool__(self):
        # Return False if empty data, True otherwise
        return bool(self._data)
        
    def __str__(self):
        # If self._data is a collection (dict/list) or None/Empty, return "".
        # We only want to print leaf node values (strings/ints).
        if isinstance(self._data, (dict, list, tuple)) or not self._data:
            return ""
        return str(self._data)
        
    def __repr__(self):
        return f"<DotWrapper {self._data}>"

    def __call__(self):
        return self._data


Base = declarative_base()

class Motherboard(Base):
    __tablename__ = 'motherboards'
    
    id = Column(String, primary_key=True)
    brand = Column(String, index=True)
    model = Column(String, index=True)
    chipset = Column(String, index=True)
    form_factor = Column(String, index=True)
    
    # Single Generic Specs Column containing the entire Unflattened Hierarchy
    specs = Column(JSON)
    
    @property
    def dot(self):
        """Returns a DotWrapper around specs for easy template access."""
        return DotWrapper(self.specs if self.specs else {})

    
class Structure(Base):
    __tablename__ = 'structure'
    
    id = Column(Integer, primary_key=True)
    content = Column(JSON) # Stores the Header Tree

class LanController(Base):
    __tablename__ = 'lan_controllers'
    
    name = Column(String, primary_key=True)  # Normalized name (e.g. "REALTEKRTL8125")
    speed = Column(Integer)                  # Speed in Mbps (e.g. 2500)

def get_engine(db_url='sqlite:///mobo.db'):
    return create_engine(db_url)

def get_session_factory(engine):
    return sessionmaker(bind=engine)
