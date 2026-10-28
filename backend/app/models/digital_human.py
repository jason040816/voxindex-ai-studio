from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.models import Base


class DigitalHumanVideo(Base):
    __tablename__ = "digital_human_videos"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    synthesis_job_id = Column(Integer, ForeignKey("synthesis_jobs.id"), nullable=False)
    model_id = Column(Integer, nullable=False)
    remote_video_id = Column(Integer, nullable=True, index=True)
    video_name = Column(String, nullable=True)
    audio_url = Column(Text, nullable=False)
    remote_video_url = Column(Text, nullable=True)
    local_video_filename = Column(String, nullable=True)
    cover_url = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="pending")
    fail_reason = Column(Text, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    included_seconds_used = Column(Integer, nullable=False, default=0)
    billed_seconds = Column(Integer, nullable=False, default=0)
    charged_credits = Column(Integer, nullable=False, default=0)
    billing_status = Column(String(16), nullable=False, default="legacy")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
