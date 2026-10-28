import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import PlainTextResponse, RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import update
from sqlalchemy.orm import Session
import stripe

from app.models import get_db
from app.models.credits import CreditAllocation, CreditLot, CreditPackage, CreditRate, CreditTransaction, PaymentOrder
from app.models.user import User
from app.services.auth import get_current_user
from app.services.credits import (
    DEFAULT_PACKAGES,
    OPERATIONS,
    current_balance,
    as_utc,
    expire_credits,
    grant_credits,
    ledger_payload,
    utcnow,
)
from app.services.merchant_checkout import (
    CheckoutError,
    format_amount,
    query_payment,
    verify_signature,
)
from app.services.stripe_checkout import (
    StripeCheckoutError,
    amount_in_minor_units,
    create_session,
    expire_session,
    retrieve_session,
    stripe_ready,
    stripe_webhook_secret,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _log_signature_failure(request: Request, payload: dict, callback_type: str) -> None:
    """Log enough callback metadata to diagnose验签 without exposing secrets."""
    received_sign = str(payload.get("sign") or "").strip()
    configured_mer_id = os.getenv("UPG_MERCHANT_ID", "").strip()
    received_mer_id = str(payload.get("merId") or "").strip()
    safe_values = {
        key: str(payload[key])[:40]
        for key in ("payNo", "amount", "currency", "status", "errDesc")
        if payload.get(key) is not None
    }
    logger.warning(
        "UPG %s signature verification failed: content_type=%r fields=%r "
        "safe_values=%r sign_present=%s sign_length=%s sign_is_sha256_hex=%s "
        "signing_key_configured=%s merchant_id_matches=%s",
        callback_type,
        request.headers.get("content-type", "")[:100],
        sorted(str(key)[:60] for key in payload.keys()),
        safe_values,
        bool(received_sign),
        len(received_sign),
        bool(re.fullmatch(r"[0-9a-fA-F]{64}", received_sign)),
        bool(os.getenv("UPG_SIGNING_KEY", "").strip()),
        bool(configured_mer_id and received_mer_id == configured_mer_id),
    )


def _admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def _order_payload(order: PaymentOrder) -> dict:
    return {
        "id": order.id,
        "merchant_order_id": order.merchant_order_id,
        "platform_order_id": order.platform_order_id,
        "package_code": order.package_code,
        "points": order.points,
        "amount": format_amount(Decimal(order.amount), order.currency),
        "currency": order.currency,
        "pay_no": order.pay_no,
        "status": order.status,
        "created_at": order.created_at,
        "paid_at": order.paid_at,
    }


def _catalog(db: Session) -> dict:
    packages = db.query(CreditPackage).filter(CreditPackage.enabled == 1).order_by(
        CreditPackage.sort_order.asc(), CreditPackage.id.asc()
    ).all()
    rates = {item.operation: item.points for item in db.query(CreditRate).all()}
    currencies = sorted({item.currency for item in packages})
    return {
        "packages": [{
            "code": item.code,
            "name": item.name,
            "points": item.points,
            "currency": item.currency,
            "price": format_amount(Decimal(item.price), item.currency),
        } for item in packages],
        "currencies": currencies,
        "payment_methods": [{"code": "stripe", "name": "Stripe"}] if stripe_ready() else [],
        "operation_costs": {key: int(rates.get(key, 0)) for key in OPERATIONS},
    }


@router.get("/catalog")
def get_catalog(db: Session = Depends(get_db)):
    return _catalog(db)


@router.get("/me")
def get_credit_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    expire_credits(db, current_user.id)
    db.commit()
    lots = db.query(CreditLot).filter(
        CreditLot.user_id == current_user.id,
        CreditLot.remaining > 0,
    ).order_by(CreditLot.expires_at.asc().nullslast(), CreditLot.id.asc()).all()
    transactions = db.query(CreditTransaction).filter(
        CreditTransaction.user_id == current_user.id,
    ).order_by(CreditTransaction.created_at.desc(), CreditTransaction.id.desc()).limit(100).all()
    now = utcnow()
    valid_lots = [lot for lot in lots if lot.expires_at is None or as_utc(lot.expires_at) > now]
    return {
        "balance": sum(lot.remaining for lot in valid_lots),
        "expires_soon": sum(
            lot.remaining for lot in valid_lots
            if lot.expires_at and as_utc(lot.expires_at) <= now + timedelta(days=30)
        ),
        "transactions": [ledger_payload(item) for item in transactions],
    }


class CheckoutRequest(BaseModel):
    package_code: str = Field(min_length=1, max_length=32)
    currency: str = Field(min_length=3, max_length=3)
    pay_no: str = Field(default="stripe", min_length=1, max_length=6)


@router.post("/orders", status_code=status.HTTP_201_CREATED)
def create_payment_order(
    req: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    currency = req.currency.upper()
    if req.pay_no != "stripe":
        raise HTTPException(status_code=422, detail="当前仅支持 Stripe 收银台")
    if not stripe_ready():
        raise HTTPException(status_code=503, detail="Stripe 密钥或 Webhook 尚未配置，暂不能付款")
    package = db.query(CreditPackage).filter(
        CreditPackage.code == req.package_code,
        CreditPackage.currency == currency,
        CreditPackage.enabled == 1,
    ).first()
    if not package:
        raise HTTPException(status_code=404, detail="该币种下没有可购买的积分包")
    try:
        amount_in_minor_units(Decimal(package.price), currency)
    except StripeCheckoutError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    merchant_order_id = f"DX{int(datetime.now(timezone.utc).timestamp() * 1000)}{uuid.uuid4().hex[:10]}"
    front = os.getenv("FRONTEND_APP_URL", "").strip().rstrip("/")
    if not front.startswith("https://") and not front.startswith("http://localhost:"):
        raise HTTPException(status_code=503, detail="请将 FRONTEND_APP_URL 配置为网站的 HTTPS 域名")
    order = PaymentOrder(
        user_id=current_user.id,
        merchant_order_id=merchant_order_id,
        package_code=package.code,
        points=package.points,
        amount=package.price,
        currency=currency,
        pay_no="stripe",
        status="pending",
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    try:
        session = create_session(
            order_id=merchant_order_id,
            name=package.name,
            points=package.points,
            amount=Decimal(package.price),
            currency=currency,
            email=current_user.email,
            frontend_url=front,
        )
    except StripeCheckoutError as exc:
        order.status = "failed"
        db.commit()
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    order.platform_order_id = str(session["id"])
    db.commit()
    return {"order": _order_payload(order), "checkout_url": str(session["url"])}


def _status_from_gateway(value: object) -> str:
    return {"1": "paid", "2": "failed", "3": "pending", "6": "closed", "0": "pending"}.get(str(value), "pending")


def _apply_gateway_result(db: Session, payload: dict) -> PaymentOrder | None:
    merchant_order_id = str(payload.get("merOrderId") or "")
    order = db.query(PaymentOrder).filter(PaymentOrder.merchant_order_id == merchant_order_id).with_for_update().first()
    if not order:
        return None
    if order.pay_no == "stripe":
        raise HTTPException(status_code=400, detail="not a legacy payment order")
    if str(payload.get("merId") or "") != os.getenv("UPG_MERCHANT_ID", "").strip():
        raise HTTPException(status_code=400, detail="merchant id mismatch")
    if str(payload.get("currency") or "").upper() != order.currency:
        raise HTTPException(status_code=400, detail="currency mismatch")
    try:
        if Decimal(str(payload.get("amount"))) != Decimal(order.amount):
            raise HTTPException(status_code=400, detail="amount mismatch")
    except (InvalidOperation, TypeError):
        raise HTTPException(status_code=400, detail="invalid amount")

    next_status = _status_from_gateway(payload.get("status"))
    if order.status == "paid":
        return order
    if next_status == "paid":
        order.status = "paid"
        order.platform_order_id = str(payload.get("platformOrderId") or payload.get("origPlatformOrderId") or "") or None
        order.paid_at = utcnow()
        grant_credits(
            db,
            user_id=order.user_id,
            amount=order.points,
            source_type="purchase",
            source_ref=order.merchant_order_id,
            description=f"购买积分包 +{order.points:,}（{order.currency} {format_amount(Decimal(order.amount), order.currency)}）",
            expires_at=utcnow() + timedelta(days=365),
        )
    elif order.status == "pending" and next_status in {"failed", "closed"}:
        order.status = next_status
    db.commit()
    db.refresh(order)
    return order


def _apply_stripe_session(db: Session, session: dict, event_type: str = "") -> PaymentOrder | None:
    """Apply only verified Stripe server data, never browser query parameters."""
    reference = str(session.get("client_reference_id") or (session.get("metadata") or {}).get("merchant_order_id") or "")
    session_id = str(session.get("id") or "")
    if not reference or not session_id:
        raise HTTPException(status_code=400, detail="missing Stripe order reference")
    order = db.query(PaymentOrder).filter(PaymentOrder.merchant_order_id == reference).first()
    if order is None:
        logger.warning("Stripe session references unknown order: %s", reference)
        return None
    if order.pay_no != "stripe" or (order.platform_order_id and order.platform_order_id != session_id):
        raise HTTPException(status_code=400, detail="Stripe order mismatch")
    if session.get("mode") != "payment" or str(session.get("currency") or "").upper() != order.currency:
        raise HTTPException(status_code=400, detail="Stripe payment details mismatch")
    if session.get("amount_total") != amount_in_minor_units(Decimal(order.amount), order.currency):
        raise HTTPException(status_code=400, detail="Stripe amount mismatch")

    if order.platform_order_id is None:
        order.platform_order_id = session_id
        db.flush()
    if session.get("payment_status") == "paid":
        # The conditional update makes repeated/concurrent webhook deliveries idempotent.
        claimed = db.execute(
            update(PaymentOrder)
            .where(PaymentOrder.id == order.id, PaymentOrder.status != "paid")
            .values(status="paid", paid_at=utcnow())
        )
        if claimed.rowcount:
            grant_credits(
                db,
                user_id=order.user_id,
                amount=order.points,
                source_type="purchase",
                source_ref=order.merchant_order_id,
                description=f"购买积分包 +{order.points:,}（{order.currency} {format_amount(Decimal(order.amount), order.currency)}）",
                expires_at=utcnow() + timedelta(days=365),
            )
    elif order.status == "pending" and event_type in {"checkout.session.expired", "checkout.session.async_payment_failed"}:
        order.status = "closed" if event_type == "checkout.session.expired" else "failed"
    db.commit()
    db.refresh(order)
    return order


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    try:
        secret = stripe_webhook_secret()
    except StripeCheckoutError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    signature = request.headers.get("Stripe-Signature", "")
    try:
        event = stripe.Webhook.construct_event(await request.body(), signature, secret)
    except (ValueError, stripe.error.SignatureVerificationError) as exc:
        raise HTTPException(status_code=400, detail="invalid Stripe signature or payload") from exc
    event = event.to_dict() if hasattr(event, "to_dict") else event
    event_type = event.get("type", "")
    if event_type in {
        "checkout.session.completed", "checkout.session.async_payment_succeeded",
        "checkout.session.async_payment_failed", "checkout.session.expired",
    }:
        _apply_stripe_session(db, event["data"]["object"], event_type)
    return {"received": True}


@router.post("/notify")
async def payment_notification(request: Request, db: Session = Depends(get_db)):
    try:
        payload = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid notification payload")
    if not verify_signature(payload):
        _log_signature_failure(request, payload, "async notification")
        raise HTTPException(status_code=400, detail="invalid payment signature")
    _apply_gateway_result(db, payload)
    return PlainTextResponse("success")


@router.post("/return")
async def payment_return(request: Request, db: Session = Depends(get_db)):
    form = await request.form()
    payload = dict(form)
    front = os.getenv("FRONTEND_APP_URL", "").strip().rstrip("/")
    if not front:
        raise HTTPException(status_code=503, detail="FRONTEND_APP_URL is not configured")
    if not verify_signature(payload):
        _log_signature_failure(request, payload, "browser return")
        # The gateway can return unsigned error forms when it rejects checkout
        # before opening the cashier. Show the error in our UI, but never use
        # unverified fields to update payment status or grant credits.
        merchant_order_id = str(payload.get("merOrderId") or "")
        known_order = db.query(PaymentOrder.id).filter(
            PaymentOrder.merchant_order_id == merchant_order_id,
        ).first() if merchant_order_id else None
        params = {"checkout": "unverified"}
        if known_order:
            params["order"] = merchant_order_id
        return RedirectResponse(f"{front}/credits?{urlencode(params)}", status_code=303)
    order = _apply_gateway_result(db, payload)
    params = {"checkout": order.status if order else "unknown"}
    if order:
        params["order"] = order.merchant_order_id
    return RedirectResponse(f"{front}/credits?{urlencode(params)}", status_code=303)


@router.get("/orders")
def get_payment_orders(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    orders = db.query(PaymentOrder).filter(
        PaymentOrder.user_id == current_user.id,
        PaymentOrder.status != "archived",
    ).order_by(
        PaymentOrder.created_at.desc(), PaymentOrder.id.desc()
    ).limit(100).all()
    return [_order_payload(item) for item in orders]


def _abandon_stripe_order(db: Session, order: PaymentOrder) -> PaymentOrder:
    if order.status != "pending":
        return order
    if not order.platform_order_id:
        order.status = "closed"
        db.commit()
        db.refresh(order)
        return order
    session = retrieve_session(order.platform_order_id)
    if session.get("status") == "open" and session.get("payment_status") != "paid":
        try:
            session = expire_session(order.platform_order_id)
        except StripeCheckoutError:
            # Payment may have completed during the expiration request.
            session = retrieve_session(order.platform_order_id)
            if session.get("status") == "open":
                raise
    result = _apply_stripe_session(
        db, session,
        "checkout.session.expired" if session.get("status") == "expired" else "",
    )
    if result is None:
        raise HTTPException(status_code=409, detail="Stripe 订单与本地订单不一致")
    return result


@router.post("/orders/{order_id}/abandon")
def abandon_payment_order(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = db.query(PaymentOrder).filter(
        PaymentOrder.id == order_id,
        PaymentOrder.user_id == current_user.id,
        PaymentOrder.pay_no == "stripe",
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="找不到 Stripe 支付订单")
    try:
        order = _abandon_stripe_order(db, order)
    except StripeCheckoutError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return _order_payload(order)


@router.delete("/orders/unpaid")
def clear_unpaid_payment_orders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove confirmed-unpaid rows; archive unresolved rows for late callbacks."""
    orders = db.query(PaymentOrder).filter(
        PaymentOrder.user_id == current_user.id,
        PaymentOrder.status.notin_(["paid", "archived"]),
    ).order_by(PaymentOrder.id.asc()).all()
    deleted = archived = skipped = 0
    for order in orders:
        if order.pay_no == "stripe" and order.status == "pending" and order.platform_order_id:
            try:
                order = _abandon_stripe_order(db, order)
            except (StripeCheckoutError, HTTPException):
                skipped += 1
                continue
        if order.status == "paid":
            skipped += 1
            continue
        credited = db.query(CreditLot.id).filter(
            CreditLot.source_type == "purchase",
            CreditLot.source_ref == order.merchant_order_id,
        ).first()
        if credited:
            skipped += 1
            continue
        if order.status == "pending":
            # Legacy/async orders might still settle. Hide, but keep a callback target.
            order.status = "archived"
            archived += 1
        else:
            db.delete(order)
            deleted += 1
    db.commit()
    return {"deleted": deleted, "archived": archived, "skipped": skipped}


@router.post("/orders/{order_id}/refresh")
def refresh_payment_order(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = db.query(PaymentOrder).filter(
        PaymentOrder.id == order_id,
        PaymentOrder.user_id == current_user.id,
    ).first()
    if not order:
        raise HTTPException(status_code=404, detail="找不到支付订单")
    if order.status == "pending":
        if order.pay_no == "stripe":
            if not order.platform_order_id:
                raise HTTPException(status_code=409, detail="Stripe 收银台尚未创建成功")
            try:
                stripe_session = retrieve_session(order.platform_order_id)
            except StripeCheckoutError as exc:
                raise HTTPException(status_code=502, detail=str(exc)) from exc
            _apply_stripe_session(db, stripe_session, "checkout.session.expired" if stripe_session.get("status") == "expired" else "")
        else:
            try:
                data = query_payment(merchant_order_id=order.merchant_order_id, currency=order.currency, amount=Decimal(order.amount))
            except CheckoutError as exc:
                raise HTTPException(status_code=502, detail=str(exc)) from exc
            _apply_gateway_result(db, {
                "merOrderId": data.get("merOrderId"),
                "merId": data.get("merId"),
                "amount": data.get("amount"),
                "currency": data.get("currency"),
                "status": data.get("status"),
                "platformOrderId": data.get("platformOrderId"),
            })
        db.refresh(order)
    return _order_payload(order)


@router.get("/admin/settings")
def admin_settings(admin: User = Depends(_admin), db: Session = Depends(get_db)):
    del admin
    rates = db.query(CreditRate).all()
    packages = db.query(CreditPackage).order_by(CreditPackage.currency.asc(), CreditPackage.sort_order.asc()).all()
    return {
        "operation_names": OPERATIONS,
        "rates": {item.operation: item.points for item in rates},
        "packages": [{
            "code": item.code,
            "name": item.name,
            "points": item.points,
            "currency": item.currency,
            "price": format_amount(Decimal(item.price), item.currency),
            "enabled": bool(item.enabled),
        } for item in packages],
        "payment_methods": [{"code": "stripe", "name": "Stripe"}],
        "enabled_payment_methods": ["stripe"] if stripe_ready() else [],
    }


class PackagePriceUpdate(BaseModel):
    code: str
    currency: str = Field(min_length=3, max_length=3)
    price: Decimal = Field(ge=0)
    points: int = Field(gt=0)
    enabled: bool = True


class BillingSettingsUpdate(BaseModel):
    rates: dict[str, int]
    packages: list[PackagePriceUpdate]


@router.put("/admin/settings")
def update_admin_settings(
    req: BillingSettingsUpdate,
    admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    if set(req.rates) - set(OPERATIONS):
        raise HTTPException(status_code=422, detail="未知的生成操作")
    for operation, points in req.rates.items():
        if points < 0:
            raise HTTPException(status_code=422, detail="积分扣费不能小于0")
        rate = db.query(CreditRate).filter(CreditRate.operation == operation).first()
        if not rate:
            rate = CreditRate(operation=operation, points=points)
            db.add(rate)
        else:
            rate.points = points
    templates = {code: (name, points, order) for code, name, points, _, order in DEFAULT_PACKAGES}
    for item in req.packages:
        template = templates.get(item.code)
        if not template:
            raise HTTPException(status_code=422, detail="未知积分包")
        if len(item.currency) != 3:
            raise HTTPException(status_code=422, detail="币种代码必须为3位")
        if item.enabled and item.price <= 0:
            raise HTTPException(status_code=422, detail="已开放的积分包价格必须大于0")
        package = db.query(CreditPackage).filter(
            CreditPackage.code == item.code,
            CreditPackage.currency == item.currency.upper(),
        ).first()
        if not package:
            package = CreditPackage(
                code=item.code,
                name=template[0],
                points=item.points,
                currency=item.currency.upper(),
                price=item.price,
                enabled=int(item.enabled),
                sort_order=template[2],
            )
            db.add(package)
        else:
            package.points = item.points
            package.price = item.price
            package.enabled = int(item.enabled)
    db.commit()
    return admin_settings(admin, db)


class CreditAdjustment(BaseModel):
    amount: int
    description: str = Field(min_length=1, max_length=200)
    expire_after_days: Optional[int] = Field(default=None, ge=1, le=3650)
    never_expires: bool = False


@router.post("/admin/users/{user_id}/adjustments")
def adjust_user_credits(
    user_id: int,
    req: CreditAdjustment,
    admin: User = Depends(_admin),
    db: Session = Depends(get_db),
):
    if req.amount == 0:
        raise HTTPException(status_code=422, detail="调整积分不能为0")
    target = db.query(User).filter(User.id == user_id).with_for_update().first()
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")
    if req.amount > 0:
        if req.never_expires == (req.expire_after_days is not None):
            raise HTTPException(status_code=422, detail="请设置赠送积分的到期天数，或勾选永不过期")
        expiry = utcnow() + timedelta(days=req.expire_after_days) if req.expire_after_days else None
        grant_credits(
            db,
            user_id=user_id,
            amount=req.amount,
            source_type="admin_credit",
            source_ref=f"admin-{admin.id}-{uuid.uuid4().hex[:12]}",
            description=f"管理员调整：{req.description}",
            expires_at=expiry,
        )
    else:
        amount = abs(req.amount)
        now = utcnow()
        lots = db.query(CreditLot).filter(
            CreditLot.user_id == user_id,
            CreditLot.remaining > 0,
            (CreditLot.expires_at.is_(None)) | (CreditLot.expires_at > now),
        ).order_by(CreditLot.expires_at.asc().nullslast(), CreditLot.id.asc()).with_for_update().all()
        balance = sum(lot.remaining for lot in lots)
        if balance < amount:
            raise HTTPException(status_code=422, detail=f"用户当前只有 {balance} 可用积分，不能扣 {amount}")
        remaining = amount
        transaction = CreditTransaction(
            user_id=user_id,
            delta=-amount,
            kind="admin_debit",
            status="completed",
            description=f"管理员调整：{req.description}",
            reference_type="admin_adjustment",
            reference_id=str(admin.id),
        )
        db.add(transaction)
        db.flush()
        for lot in lots:
            take = min(lot.remaining, remaining)
            if take:
                lot.remaining -= take
                db.add(CreditAllocation(transaction_id=transaction.id, lot_id=lot.id, amount=take))
                remaining -= take
            if remaining == 0:
                break
    db.commit()
    expire_credits(db, user_id)
    db.commit()
    return {"user_id": user_id, "balance": current_balance(db, user_id)}

