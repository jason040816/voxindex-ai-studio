"""Stripe-hosted Checkout. Card details never pass through our application."""

import os
from decimal import Decimal

import stripe


class StripeCheckoutError(Exception):
    pass


def stripe_ready() -> bool:
    return bool(os.getenv("STRIPE_SECRET_KEY", "").strip() and os.getenv("STRIPE_WEBHOOK_SECRET", "").strip())


def stripe_key() -> str:
    key = os.getenv("STRIPE_SECRET_KEY", "").strip()
    if not key:
        raise StripeCheckoutError("请先配置 STRIPE_SECRET_KEY")
    return key


def stripe_webhook_secret() -> str:
    secret = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
    if not secret:
        raise StripeCheckoutError("请先配置 STRIPE_WEBHOOK_SECRET，未配置前不能开放付款")
    return secret


def amount_in_minor_units(amount: Decimal, currency: str) -> int:
    # The storefront currently offers only these two-decimal currencies.
    if currency.upper() not in {"CNY", "SGD", "USD"}:
        raise StripeCheckoutError(f"Stripe 暂不支持该站点币种：{currency}")
    minor = Decimal(amount) * 100
    if minor <= 0 or minor != minor.to_integral_value():
        raise StripeCheckoutError("Stripe 价格必须大于 0，且最多保留两位小数")
    return int(minor)


def create_session(*, order_id: str, name: str, points: int, amount: Decimal,
                   currency: str, email: str, frontend_url: str):
    stripe.api_key = stripe_key()
    stripe_webhook_secret()
    minor = amount_in_minor_units(amount, currency)
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            client_reference_id=order_id,
            customer_email=email,
            line_items=[{
                "price_data": {
                    "currency": currency.lower(),
                    "unit_amount": minor,
                    "product_data": {"name": f"{name} · {points:,} 积分"},
                },
                "quantity": 1,
            }],
            metadata={"merchant_order_id": order_id},
            success_url=f"{frontend_url}/credits?checkout=returned&order={order_id}&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{frontend_url}/credits?checkout=cancelled&order={order_id}",
            idempotency_key=order_id,
        )
    except stripe.error.StripeError as exc:
        raise StripeCheckoutError(f"Stripe 收银台创建失败：{exc.user_message or str(exc)}") from exc
    if hasattr(session, "to_dict"):
        session = session.to_dict()
    if not session.get("id") or not session.get("url"):
        raise StripeCheckoutError("Stripe 未返回有效的收银台地址")
    return session


def retrieve_session(session_id: str):
    stripe.api_key = stripe_key()
    try:
        session = stripe.checkout.Session.retrieve(session_id)
        return session.to_dict() if hasattr(session, "to_dict") else session
    except stripe.error.StripeError as exc:
        raise StripeCheckoutError(f"查询 Stripe 订单失败：{exc.user_message or str(exc)}") from exc


def expire_session(session_id: str):
    """Prevent an abandoned, still-open Checkout Session from being paid later."""
    stripe.api_key = stripe_key()
    try:
        session = stripe.checkout.Session.expire(session_id)
        return session.to_dict() if hasattr(session, "to_dict") else session
    except stripe.error.StripeError as exc:
        raise StripeCheckoutError(f"关闭 Stripe 收银台失败：{exc.user_message or str(exc)}") from exc
