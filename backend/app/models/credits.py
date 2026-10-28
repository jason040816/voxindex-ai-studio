from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.models import Base


class CreditLot(Base):
    __tablename__ = "credit_lots"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    amount = Column(Integer, nullable=False)
    remaining = Column(Integer, nullable=False)
    source_type = Column(String(32), nullable=False)
    source_ref = Column(String(80), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    delta = Column(Integer, nullable=False)
    kind = Column(String(32), nullable=False)
    status = Column(String(24), nullable=False, default="completed")
    description = Column(String(240), nullable=False)
    reference_type = Column(String(40), nullable=True)
    reference_id = Column(String(80), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class CreditAllocation(Base):
    __tablename__ = "credit_allocations"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(Integer, ForeignKey("credit_transactions.id"), nullable=False, index=True)
    lot_id = Column(Integer, ForeignKey("credit_lots.id"), nullable=False, index=True)
    amount = Column(Integer, nullable=False)


class CreditPackage(Base):
    __tablename__ = "credit_packages"
    __table_args__ = (UniqueConstraint("code", "currency", name="uq_credit_package_code_currency"),)

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(32), nullable=False, index=True)
    name = Column(String(80), nullable=False)
    points = Column(Integer, nullable=False)
    currency = Column(String(3), nullable=False, index=True)
    price = Column(Numeric(14, 3), nullable=False)
    enabled = Column(Integer, nullable=False, default=1)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class CreditRate(Base):
    __tablename__ = "credit_rates"

    operation = Column(String(40), primary_key=True)
    points = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class PaymentOrder(Base):
    __tablename__ = "payment_orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    merchant_order_id = Column(String(50), nullable=False, unique=True, index=True)
    platform_order_id = Column(String(255), nullable=True, index=True)
    package_code = Column(String(32), nullable=False)
    points = Column(Integer, nullable=False)
    amount = Column(Numeric(14, 3), nullable=False)
    currency = Column(String(3), nullable=False)
    pay_no = Column(String(6), nullable=False)
    status = Column(String(24), nullable=False, default="pending", index=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

