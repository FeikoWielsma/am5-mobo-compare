from sqlalchemy import create_engine, Column, String, Integer, JSON, Text
from sqlalchemy.orm import declarative_base, sessionmaker, scoped_session

Base = declarative_base()

class Motherboard(Base):
    __tablename__ = 'motherboards'
    
    id = Column(String, primary_key=True)
    brand = Column(String, index=True)
    model = Column(String, index=True)
    chipset = Column(String, index=True)
    
    # Components matching Excel Structure
    general = Column(JSON)      # General (Brand, Chipset, Model, Form Factor)
    rear_io = Column(JSON)      # Rear I/O (USB, Legacy)
    video_outs = Column(JSON)   # Video Outs (Modern, Internal)
    expansion = Column(JSON)    # Expansion (PCIe Slots, Storage)
    memory = Column(JSON)       # Memory
    network = Column(JSON)      # Network (Ethernet, Wireless)
    audio = Column(JSON)        # Audio
    vrm = Column(JSON)          # VRM
    internal_io = Column(JSON)  # Internal I/O
    
    # Keep original flat data
    data = Column(JSON)

class Structure(Base):
    __tablename__ = 'structure'
    
    id = Column(Integer, primary_key=True)
    content = Column(JSON)

def get_engine(db_url='sqlite:///mobo.db'):
    return create_engine(db_url)

def get_session_factory(engine):
    return sessionmaker(bind=engine)
