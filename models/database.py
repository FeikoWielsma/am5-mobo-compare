from sqlalchemy import create_engine, Column, String, Integer, JSON, Text
from sqlalchemy.orm import declarative_base, sessionmaker, scoped_session

Base = declarative_base()

class Motherboard(Base):
    __tablename__ = 'motherboards'
    
    id = Column(String, primary_key=True)
    brand = Column(String, index=True)
    model = Column(String, index=True)
    chipset = Column(String, index=True)
    
    # Single Generic Specs Column containing the entire Unflattened Hierarchy
    specs = Column(JSON)
    
class Structure(Base):
    __tablename__ = 'structure'
    
    id = Column(Integer, primary_key=True)
    content = Column(JSON) # Stores the Header Tree

def get_engine(db_url='sqlite:///mobo.db'):
    return create_engine(db_url)

def get_session_factory(engine):
    return sessionmaker(bind=engine)
