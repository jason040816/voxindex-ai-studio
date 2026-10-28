from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.models import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    referral_source = Column(String(160), nullable=True)
    hashed_password = Column(String, nullable=False)
    is_admin = Column(Boolean, default=False)
    is_banned = Column(Boolean, nullable=False, default=False)
    voice_clone_limit = Column(Integer, nullable=False, default=0)
    synthesis_limit = Column(Integer, nullable=False, default=0)
    digital_human_model_limit = Column(Integer, nullable=False, default=0)
    digital_human_video_limit = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    avatar_filename = Column(String, nullable=True)
