from sqlalchemy import create_engine, Column, String, Integer, JSON, Text
from sqlalchemy.orm import declarative_base, sessionmaker, scoped_session
import re

class DotWrapper:
    """
    Wrapper for dictionary to allow case-insensitive, symbol-ignoring dot notation.
    d.general.networking.ethernet.lan -> d['General']['Networking']['Ethernet']['LAN']
    """
    def __init__(self, data):
        self._data = data

    def __getattr__(self, name):
        # 1. Exact match (fast path)
        if name in self._data:
            val = self._data[name]
            return DotWrapper(val) if isinstance(val, dict) else val
            
        # 2. Fuzzy match
        # Normalize target name: generic_name -> genericname
        target_clean = name.lower().replace('_', '').replace(' ', '')
        
        for key, val in self._data.items():
            # Normalize key: 'General' -> 'general', '# RJ-45' -> 'rj45', 'Audio Codec+DAC' -> 'audiocodecdac'
            key_clean = str(key).lower()
            key_clean = re.sub(r'[^a-z0-9]', '', key_clean)
            
            if key_clean == target_clean or (target_clean in key_clean and len(target_clean) > 3): 
                # (relaxed match if needed, but strict fuzzy preferred for now to avoid ambiguity)
                # Let's stick to strict normalized match first.
                pass
            
            if key_clean == target_clean:
                 return DotWrapper(val) if isinstance(val, dict) else val

        return DotWrapper({}) # Return empty wrapper to chain safely (null object pattern)
    
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

def get_engine(db_url='sqlite:///mobo.db'):
    return create_engine(db_url)

def get_session_factory(engine):
    return sessionmaker(bind=engine)
