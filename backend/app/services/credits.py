from datetime import datetime, timedelta, timezone
from math import ceil

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.credits import CreditAllocation, CreditLot, CreditPackage, CreditRate, CreditTransaction
from app.models.user import User

OPERATIONS = {
    "voice_clone": "Voice clone",
    "audio_generation": "Audio generation",
    "digital_human_model": "Digital-human model training",
    "digital_human_video": "Digital-human video",
}

# These are defaults for newly created catalogs. Existing admin-configured
# rates are deliberately left untouched by startup seeding.
DEFAULT_RATES = {
    "voice_clone": 60,
    "audio_generation": 15,  # Per 10,000 billable characters.
    "digital_human_model": 2500,  # Includes 30 minutes of video for that model.
    "digital_human_video": 2,  # Per second after the included allowance.
}
VIDEO_INCLUDED_SECONDS = 30 * 60

DEFAULT_PACKAGES = (
    ("starter", "体验积分包", 50_000, "108.00", 1),
    ("useful", "实用积分包", 160_000, "278.00", 2),
    ("large", "大容量积分包", 400_000, "638.00", 3),
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    """Normalize SQLite's naive datetimes and timezone-aware DB values to UTC."""
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def seed_credit_catalog(db: Session) -> None:
    for operation in OPERATIONS:
        if not db.query(CreditRate).filter(CreditRate.operation == operation).first():
            db.add(CreditRate(operation=operation, points=DEFAULT_RATES[operation]))
    for code, name, points, price, order in DEFAULT_PACKAGES:
        if not db.query(CreditPackage).filter(
            CreditPackage.code == code,
            CreditPackage.currency == "CNY",
        ).first():
            db.add(CreditPackage(
                code=code,
                name=name,
                points=points,
                currency="CNY",
                price=price,
                enabled=1,
                sort_order=order,
            ))
    db.commit()


def operation_cost(db: Session, operation: str) -> int:
    rate = db.query(CreditRate).filter(CreditRate.operation == operation).first()
    return max(0, int(rate.points)) if rate else 0


def text_generation_cost(character_count: int, points_per_10k: int) -> int:
    """Round a single nonempty synthesis request up to whole credits."""
    if character_count < 0 or points_per_10k < 0:
        raise ValueError("Character count and rate cannot be negative")
    return ceil(character_count * points_per_10k / 10_000)


def video_cost_breakdown(duration_seconds: int, included_remaining: int, points_per_second: int) -> tuple[int, int, int]:
    """Return (included seconds used, billable seconds, credits to reserve)."""
    if duration_seconds <= 0 or included_remaining < 0 or points_per_second < 0:
        raise ValueError("Invalid video duration, allowance, or rate")
    included = min(duration_seconds, included_remaining)
    billable = duration_seconds - included
    return included, billable, billable * points_per_second


def current_balance(db: Session, user_id: int) -> int:
    now = utcnow()
    lots = db.query(CreditLot).filter(
        CreditLot.user_id == user_id,
        CreditLot.remaining > 0,
        (CreditLot.expires_at.is_(None)) | (CreditLot.expires_at > now),
    ).all()
    return sum(max(0, lot.remaining) for lot in lots)


def grant_credits(
    db: Session,
    *,
    user_id: int,
    amount: int,
    source_type: str,
    source_ref: str | None,
    description: str,
    expires_at: datetime | None,
) -> CreditLot:
    if amount <= 0:
        raise ValueError("Credit grant amount must be positive")
    lot = CreditLot(
        user_id=user_id,
        amount=amount,
        remaining=amount,
        source_type=source_type,
        source_ref=source_ref,
        expires_at=expires_at,
    )
    db.add(lot)
    db.flush()
    db.add(CreditTransaction(
        user_id=user_id,
        delta=amount,
        kind=source_type,
        status="completed",
        description=description,
        reference_type=source_type,
        reference_id=source_ref,
    ))
    return lot


def reserve_credits(
    db: Session,
    *,
    user: User,
    amount: int,
    operation: str,
    reference_type: str,
    reference_id: str,
) -> CreditTransaction | None:
    if amount <= 0:
        return None
    locked_user = db.query(User).filter(User.id == user.id).with_for_update().first()
    if not locked_user:
        raise HTTPException(status_code=404, detail="账号不存在")
    now = utcnow()
    lots = db.query(CreditLot).filter(
        CreditLot.user_id == user.id,
        CreditLot.remaining > 0,
        (CreditLot.expires_at.is_(None)) | (CreditLot.expires_at > now),
    ).order_by(CreditLot.expires_at.asc().nullslast(), CreditLot.id.asc()).with_for_update().all()
    balance = sum(lot.remaining for lot in lots)
    if balance < amount:
        raise HTTPException(status_code=402, detail=f"积分不足，需要 {amount} 积分，当前可用 {balance} 积分")

    transaction = CreditTransaction(
        user_id=user.id,
        delta=-amount,
        kind="usage",
        status="reserved",
        description=f"{OPERATIONS.get(operation, operation)}（待确认）",
        reference_type=reference_type,
        reference_id=str(reference_id),
    )
    db.add(transaction)
    db.flush()
    remaining = amount
    for lot in lots:
        take = min(lot.remaining, remaining)
        if take:
            lot.remaining -= take
            db.add(CreditAllocation(transaction_id=transaction.id, lot_id=lot.id, amount=take))
            remaining -= take
        if remaining == 0:
            break
    return transaction


def capture_reservation(db: Session, transaction: CreditTransaction | None) -> None:
    if transaction and transaction.status == "reserved":
        transaction.status = "completed"
        transaction.description = transaction.description.replace("（待确认）", "")


def refund_reservation(db: Session, transaction: CreditTransaction | None, reason: str) -> None:
    if not transaction or transaction.status != "reserved":
        return
    allocations = db.query(CreditAllocation).filter(
        CreditAllocation.transaction_id == transaction.id,
    ).all()
    amount = 0
    for allocation in allocations:
        lot = db.query(CreditLot).filter(CreditLot.id == allocation.lot_id).with_for_update().first()
        if lot:
            lot.remaining += allocation.amount
            amount += allocation.amount
    transaction.status = "refunded"
    transaction.description = transaction.description.replace("（待确认）", "（失败退回）")
    if amount:
        db.add(CreditTransaction(
            user_id=transaction.user_id,
            delta=amount,
            kind="refund",
            status="completed",
            description=f"生成失败退回：{reason[:180]}",
            reference_type=transaction.reference_type,
            reference_id=transaction.reference_id,
        ))


def settle_reference(db: Session, reference_type: str, reference_id: int | str, succeeded: bool, reason: str = "生成失败") -> None:
    transaction = db.query(CreditTransaction).filter(
        CreditTransaction.reference_type == reference_type,
        CreditTransaction.reference_id == str(reference_id),
        CreditTransaction.status == "reserved",
    ).with_for_update().first()
    if not transaction:
        return
    if succeeded:
        capture_reservation(db, transaction)
    else:
        refund_reservation(db, transaction, reason)


def expire_credits(db: Session, user_id: int) -> None:
    now = utcnow()
    expired = db.query(CreditLot).filter(
        CreditLot.user_id == user_id,
        CreditLot.remaining > 0,
        CreditLot.expires_at.isnot(None),
        CreditLot.expires_at <= now,
    ).with_for_update().all()
    for lot in expired:
        amount = lot.remaining
        if amount <= 0:
            continue
        lot.remaining = 0
        db.add(CreditTransaction(
            user_id=user_id,
            delta=-amount,
            kind="expiration",
            status="completed",
            description="积分到期",
            reference_type=lot.source_type,
            reference_id=lot.source_ref,
        ))


def ledger_payload(item: CreditTransaction) -> dict:
    return {
        "id": item.id,
        "delta": item.delta,
        "kind": item.kind,
        "status": item.status,
        "description": item.description,
        "created_at": item.created_at,
        "reference_type": item.reference_type,
        "reference_id": item.reference_id,
    }

