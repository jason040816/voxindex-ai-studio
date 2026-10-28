from sqlalchemy import Boolean, Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.sql import func
from app.models import Base

class VoiceReference(Base):
    __tablename__ = "voice_references"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String, nullable=False)
    original_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    sample_text = Column(Text, nullable=True)
    provider_voice_id = Column(String, nullable=True, unique=True)
    provider = Column(String, nullable=False, default="local")
    clone_status = Column(String, nullable=False, default="reference")
    is_clone = Column(Boolean, nullable=False, default=False)
    is_enabled = Column(Boolean, nullable=False, default=True)
    consent_confirmed = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
