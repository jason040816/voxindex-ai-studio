from sqlalchemy import Column, DateTime, Integer, String
from app.models import Base


class EmailVerification(Base):
    __tablename__ = "email_verifications"

    id = Column(Integer, primary_key=True)
    email = Column(String(320), nullable=False, index=True)
    purpose = Column(String(32), nullable=False, default="registration", index=True)
    code_digest = Column(String(64), nullable=False)
    created_at = Column(DateTime, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    attempts = Column(Integer, nullable=False, default=0)
    consumed_at = Column(DateTime, nullable=True)
