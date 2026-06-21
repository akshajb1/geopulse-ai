"""
database.py – GeoPulse AI
SQLAlchemy models + PostgreSQL connection setup.
"""

import os
from datetime import datetime
from sqlalchemy import (
    create_engine, Column, Integer, String, Float,
    DateTime, ForeignKey, ARRAY, Text, Boolean
)
from sqlalchemy.orm import sessionmaker, relationship, declarative_base
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost/geopulse")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# -----------------------------------------------------------------
# Models
# -----------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id          = Column(Integer, primary_key=True, index=True)
    device_id   = Column(String(255), unique=True, index=True, nullable=False)
    name        = Column(String(255), nullable=True)
    interests   = Column(ARRAY(Text), nullable=False, default=[])
    latitude    = Column(Float, nullable=True)
    longitude   = Column(Float, nullable=True)
    push_token  = Column(String(500), nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # Tracks WHERE the last nearby-places fetch happened (for cache invalidation)
    last_fetch_lat  = Column(Float, nullable=True)
    last_fetch_lng  = Column(Float, nullable=True)

    interactions = relationship("Interaction", back_populates="user", cascade="all, delete-orphan")


class Place(Base):
    __tablename__ = "places"

    id              = Column(Integer, primary_key=True, index=True)
    google_place_id = Column(String(500), unique=True, index=True, nullable=False)
    name            = Column(String(500), nullable=False)
    category        = Column(String(255), nullable=False)
    address         = Column(Text, nullable=True)
    latitude        = Column(Float, nullable=False)
    longitude       = Column(Float, nullable=False)
    rating          = Column(Float, nullable=True)
    photo_url       = Column(Text, nullable=True)
    is_open         = Column(Boolean, nullable=True)
    cached_at       = Column(DateTime, default=datetime.utcnow)

    interactions = relationship("Interaction", back_populates="place", cascade="all, delete-orphan")


class Interaction(Base):
    __tablename__ = "interactions"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    place_id    = Column(Integer, ForeignKey("places.id", ondelete="CASCADE"), nullable=False)
    action_type = Column(String(50), nullable=False)   # "click" | "visit" | "save" | "dismiss"
    timestamp   = Column(DateTime, default=datetime.utcnow)

    user  = relationship("User", back_populates="interactions")
    place = relationship("Place", back_populates="interactions")


# -----------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------

def get_db():
    """FastAPI dependency – yields a DB session and closes it after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """Create all tables in the database."""
    Base.metadata.create_all(bind=engine)
