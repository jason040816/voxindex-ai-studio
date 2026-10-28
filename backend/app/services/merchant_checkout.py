import hashlib
import hmac
import json
import os
import time
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from urllib.parse import urljoin

import httpx


class CheckoutError(Exception):
    pass


PAYMENT_METHODS = {
    "100000": "Alipay (CN)",
    "100001": "WeChat Pay",
    "100003": "Alipay (HK)",
    "100006": "Credit card",
}

# ISO 4217 minor-unit exceptions; most currencies use two decimal places.
_ZERO_DECIMAL_CURRENCIES = {"BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"}
_THREE_DECIMAL_CURRENCIES = {"BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"}


def format_amount(amount: Decimal, currency: str) -> str:
    code = str(currency).upper()
    places = 0 if code in _ZERO_DECIMAL_CURRENCIES else 3 if code in _THREE_DECIMAL_CURRENCIES else 2
    rounded = Decimal(amount).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)
    return f"{rounded:.{places}f}"


def merchant_id() -> str:
    value = os.getenv("UPG_MERCHANT_ID", "").strip()
    if not value:
        raise CheckoutError("请先在服务器环境变量中配置 UPG_MERCHANT_ID")
    return value


def signing_key() -> str:
    value = os.getenv("UPG_SIGNING_KEY", "").strip()
    if not value:
        raise CheckoutError("请先在服务器环境变量中配置 UPG_SIGNING_KEY")
    return value


def checkout_url() -> str:
    base = os.getenv("UPG_CHECKOUT_BASE_URL", "").strip().rstrip("/")
    if not base:
        raise CheckoutError("请先配置 UPG_CHECKOUT_BASE_URL")
    return f"{base}/prevapi/checkout"


def api_url() -> str:
    base = os.getenv("UPG_API_BASE_URL", "").strip().rstrip("/")
    if not base:
        raise CheckoutError("请先配置 UPG_API_BASE_URL")
    return base


def configured_payments() -> list[dict[str, str]]:
    raw = os.getenv("UPG_PAY_NOS", ",".join(PAYMENT_METHODS)).strip()
    codes = [part.strip() for part in raw.split(",") if part.strip()]
    return [{"code": code, "name": PAYMENT_METHODS[code]} for code in codes if code in PAYMENT_METHODS]


def _signable_string(fields: dict[str, Any]) -> str:
    values = {
        str(key): str(value)
        for key, value in fields.items()
        if key != "sign" and value is not None and str(value) != ""
    }
    return "&".join(f"{key}={values[key]}" for key in sorted(values))


def sign(fields: dict[str, Any]) -> str:
    raw = _signable_string(fields) + signing_key()
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def verify_signature(fields: dict[str, Any]) -> bool:
    provided = str(fields.get("sign") or "").strip().lower()
    if not provided:
        return False
    try:
        expected = sign(fields)
    except CheckoutError:
        return False
    return hmac.compare_digest(provided, expected)


def signed_checkout_fields(
    *,
    merchant_order_id: str,
    amount: Decimal,
    currency: str,
    pay_no: str,
    points: int,
    user_name: str,
    user_email: str,
    user_contact: str,
    backend_url: str,
    response_url: str,
    address: dict[str, str] | None = None,
) -> dict[str, str]:
    amount_text = format_amount(amount, currency)
    item_transactions = json.dumps([{
        "id": f"credits-{points}",
        "name": f"DAXI Credits {points}",
        "quantity": "1",
        "amount": amount_text,
    }], ensure_ascii=False, separators=(",", ":"))
    fields: dict[str, Any] = {
        "merId": merchant_id(),
        "payNo": pay_no,
        "merOrderId": merchant_order_id,
        "amount": amount_text,
        "currency": currency,
        "backendUrl": backend_url,
        "responseUrl": response_url,
        "prodDesc": f"DAXI 积分包 {points} 积分",
        "itemTransactions": item_transactions,
        "userName": user_name,
        "userEmail": user_email,
        "userContact": user_contact,
        "remark": f"credits:{points}",
    }
    if pay_no == "100006":
        if not address:
            raise CheckoutError("信用卡支付需要账单/收货地址")
        shipping = {
            "firstName": address["first_name"],
            "lastName": address["last_name"],
            "email": user_email,
            "address": address["address"],
            "city": address["city"],
            "state": address["state"],
            "postalCode": address["postal_code"],
            "phone": user_contact,
            "countryCode": address["country_code"],
        }
        fields["shippingAddress"] = json.dumps(shipping, ensure_ascii=False, separators=(",", ":"))
    fields["sign"] = sign(fields)
    return {key: str(value) for key, value in fields.items()}


def query_payment(*, merchant_order_id: str, currency: str, amount: Decimal) -> dict:
    fields: dict[str, Any] = {
        "merId": merchant_id(),
        "version": "1.0",
        "timestamp": str(int(time.time() * 1000)),
        "queryMerOrderId": merchant_order_id,
        "currency": currency,
        "amount": format_amount(amount, currency),
    }
    fields["sign"] = sign(fields)
    endpoint = urljoin(api_url() + "/", "api/unified/query")
    try:
        response = httpx.post(endpoint, json=fields, headers={"Content-Type": "application/json; charset=UTF-8"}, timeout=20.0)
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise CheckoutError(f"支付订单查询失败：{exc}") from exc
    if not verify_signature(payload):
        raise CheckoutError("支付平台订单查询响应验签失败")
    if str(payload.get("code")) != "0":
        raise CheckoutError(str(payload.get("message") or "支付平台订单查询失败"))
    data = payload.get("data") or {}
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except ValueError as exc:
            raise CheckoutError("支付平台订单查询数据格式错误") from exc
    return data

