from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.models import Base


class CustomerApiKey(Base):
    __tablename__ = "customer_api_keys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(80), nullable=False)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    token_prefix = Column(String(24), nullable=False)
    request_count = Column(Integer, nullable=False, default=0)
    max_requests = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)


class ApiKeyUsageEvent(Base):
    __tablename__ = "api_key_usage_events"

    id = Column(Integer, primary_key=True, index=True)
    api_key_id = Column(Integer, ForeignKey("customer_api_keys.id", ondelete="CASCADE"), nullable=False, index=True)
    method = Column(String(12), nullable=False)
    path = Column(String(500), nullable=False)
    operation = Column(String(40), nullable=False)
    status_code = Column(Integer, nullable=True)
    outcome = Column(String(24), nullable=True)
    characters = Column(Integer, nullable=False, default=0)
    credits_used = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class IntegrationSetting(Base):
    __tablename__ = "integration_settings"

    name = Column(String(80), primary_key=True)
    value = Column(String(255), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class ProviderCallEvent(Base):
    __tablename__ = "provider_call_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    provider = Column(String(50), nullable=False, index=True)
    operation = Column(String(80), nullable=False)
    method = Column(String(12), nullable=False)
    endpoint = Column(String(300), nullable=False)
    status_code = Column(Integer, nullable=True)
    outcome = Column(String(24), nullable=False)
    duration_ms = Column(Integer, nullable=False, default=0)
    request_summary = Column(Text, nullable=True)
    response_summary = Column(Text, nullable=True)
    error_summary = Column(Text, nullable=True)
    reference_type = Column(String(40), nullable=True)
    reference_id = Column(String(80), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
