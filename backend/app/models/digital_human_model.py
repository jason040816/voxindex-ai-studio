from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.models import Base


class DigitalHumanModel(Base):
    __tablename__ = "digital_human_models"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    remote_model_id = Column(Integer, nullable=True, unique=True, index=True)
    name = Column(String, nullable=False)
    status = Column(Integer, nullable=False, default=0)
    cover_url = Column(Text, nullable=True)
    fail_reason = Column(Text, nullable=True)
    included_seconds_total = Column(Integer, nullable=False, default=0)
    included_seconds_remaining = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
