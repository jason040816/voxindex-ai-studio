"""Stripe checkout must only credit a matching, signed paid session once."""

import hashlib
import hmac
import json
import os
import tempfile
import time
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch


class StripeCheckoutTest(unittest.TestCase):
    def test_signed_paid_event_and_idempotency(self):
        with tempfile.TemporaryDirectory() as temporary:
            environment = {
                "DATABASE_URL": f"sqlite:///{Path(temporary, 'stripe-test.db').as_posix()}",
                "STORAGE_PATH": temporary,
                "TTS_PROVIDER": "stub",
                "FRONTEND_APP_URL": "https://shop.example.invalid",
                "STRIPE_SECRET_KEY": "sk_test_dummy",
                "STRIPE_WEBHOOK_SECRET": "whsec_dummy",
            }
            with patch.dict(os.environ, environment):
                from fastapi.testclient import TestClient

                from app.models import SessionLocal, engine
                from app.models.credits import CreditLot, CreditTransaction, PaymentOrder
                from app.models.user import User
                from app.services.auth import get_current_user
                from app.services.stripe_checkout import create_session
                from main import app

                with patch("app.services.stripe_checkout.stripe.checkout.Session.create") as create:
                    create.return_value = {"id": "cs_test_123", "url": "https://checkout.stripe.com/c/test"}
                    session = create_session(
                        order_id="DXSTRIPETEST", name="测试包", points=50000,
                        amount=Decimal("108.00"), currency="CNY",
                        email="checkout@example.invalid", frontend_url="https://shop.example.invalid",
                    )
                    self.assertEqual(session["url"], "https://checkout.stripe.com/c/test")
                    self.assertEqual(create.call_args.kwargs["line_items"][0]["price_data"]["unit_amount"], 10800)

                with TestClient(app) as client:
                    with SessionLocal() as db:
                        user = User(username="stripe_customer", email="stripe@example.invalid", hashed_password="unused", is_admin=False)
                        db.add(user)
                        db.flush()
                        user_id = user.id
                        db.add(PaymentOrder(
                            user_id=user.id, merchant_order_id="DXSTRIPETEST", package_code="starter",
                            points=50000, amount=Decimal("108.00"), currency="CNY",
                            pay_no="stripe", platform_order_id="cs_test_123", status="pending",
                        ))
                        db.commit()

                    stripe_session = {
                        "id": "cs_test_123", "object": "checkout.session", "client_reference_id": "DXSTRIPETEST",
                        "mode": "payment", "currency": "cny", "amount_total": 10800,
                        "payment_status": "paid", "metadata": {"merchant_order_id": "DXSTRIPETEST"},
                    }

                    def send(payload, signature=None):
                        raw = json.dumps({"id": "evt_test_123", "object": "event", "type": "checkout.session.completed", "data": {"object": payload}}).encode()
                        timestamp = int(time.time())
                        digest = hmac.new(b"whsec_dummy", f"{timestamp}.".encode() + raw, hashlib.sha256).hexdigest()
                        return client.post("/api/billing/stripe/webhook", content=raw, headers={
                            "Content-Type": "application/json",
                            "Stripe-Signature": signature or f"t={timestamp},v1={digest}",
                        })

                    self.assertEqual(send(stripe_session, "t=1,v1=bad").status_code, 400)
                    self.assertEqual(send({**stripe_session, "amount_total": 1}).status_code, 400)
                    self.assertEqual(send({**stripe_session, "payment_status": "unpaid"}).status_code, 200)
                    with SessionLocal() as db:
                        self.assertEqual(db.query(CreditLot).count(), 0)

                    self.assertEqual(send(stripe_session).status_code, 200)
                    self.assertEqual(send(stripe_session).status_code, 200)
                    with SessionLocal() as db:
                        self.assertEqual(db.query(PaymentOrder).one().status, "paid")
                        self.assertEqual(db.query(CreditLot).count(), 1)
                        self.assertEqual(db.query(CreditLot).one().remaining, 50000)
                        self.assertEqual(db.query(CreditTransaction).filter_by(kind="purchase").count(), 1)
                    app.dependency_overrides[get_current_user] = lambda: User(
                        id=user_id, username="stripe_customer", email="stripe@example.invalid",
                        hashed_password="unused", is_admin=False,
                    )
                    try:
                        with patch("app.api.billing.create_session") as create_for_order:
                            create_for_order.return_value = {
                                "id": "cs_test_new", "url": "https://checkout.stripe.com/c/new",
                            }
                            response = client.post("/api/billing/orders", json={
                                "package_code": "starter", "currency": "CNY", "pay_no": "stripe",
                            })
                        self.assertEqual(response.status_code, 201, response.text)
                        self.assertEqual(response.json()["checkout_url"], "https://checkout.stripe.com/c/new")
                        created_order = response.json()["order"]
                        self.assertEqual(created_order["status"], "pending")
                        with SessionLocal() as db:
                            self.assertEqual(db.query(CreditLot).count(), 1)
                        with patch("app.api.billing.retrieve_session") as retrieve:
                            retrieve.return_value = {
                                **stripe_session, "id": "cs_test_new",
                                "client_reference_id": created_order["merchant_order_id"],
                            }
                            response = client.post(f"/api/billing/orders/{created_order['id']}/refresh")
                        self.assertEqual(response.status_code, 200, response.text)
                        self.assertEqual(response.json()["status"], "paid")
                        with SessionLocal() as db:
                            self.assertEqual(db.query(CreditLot).count(), 2)

                        with SessionLocal() as db:
                            abandoned = PaymentOrder(
                                user_id=user_id, merchant_order_id="DXABANDONTEST", package_code="starter",
                                points=1, amount=Decimal("5.00"), currency="USD", pay_no="stripe",
                                platform_order_id="cs_test_abandon", status="pending",
                            )
                            legacy = PaymentOrder(
                                user_id=user_id, merchant_order_id="DXLEGACYTEST", package_code="starter",
                                points=1, amount=Decimal("99.00"), currency="CNY", pay_no="100000",
                                status="pending",
                            )
                            db.add_all([abandoned, legacy])
                            db.commit()
                            abandoned_id = abandoned.id

                        open_session = {
                            "id": "cs_test_abandon", "client_reference_id": "DXABANDONTEST",
                            "mode": "payment", "currency": "usd", "amount_total": 500,
                            "payment_status": "unpaid", "status": "open",
                        }
                        with patch("app.api.billing.retrieve_session", return_value=open_session), patch(
                            "app.api.billing.expire_session", return_value={**open_session, "status": "expired"}
                        ) as expire:
                            response = client.post(f"/api/billing/orders/{abandoned_id}/abandon")
                        self.assertEqual(response.status_code, 200, response.text)
                        self.assertEqual(response.json()["status"], "closed")
                        expire.assert_called_once_with("cs_test_abandon")
                        with SessionLocal() as db:
                            paid_during_return = PaymentOrder(
                                user_id=user_id, merchant_order_id="DXRETURNPAID", package_code="starter",
                                points=2, amount=Decimal("5.00"), currency="USD", pay_no="stripe",
                                platform_order_id="cs_test_paid_return", status="pending",
                            )
                            db.add(paid_during_return)
                            db.commit()
                            paid_during_return_id = paid_during_return.id
                        with patch("app.api.billing.retrieve_session", return_value={
                            **open_session, "id": "cs_test_paid_return",
                            "client_reference_id": "DXRETURNPAID", "status": "complete",
                            "payment_status": "paid",
                        }):
                            response = client.post(f"/api/billing/orders/{paid_during_return_id}/abandon")
                        self.assertEqual(response.status_code, 200, response.text)
                        self.assertEqual(response.json()["status"], "paid")
                        response = client.delete("/api/billing/orders/unpaid")
                        self.assertEqual(response.status_code, 200, response.text)
                        self.assertEqual(response.json(), {"deleted": 1, "archived": 1, "skipped": 0})
                        with SessionLocal() as db:
                            self.assertEqual(db.query(PaymentOrder).filter_by(status="paid").count(), 3)
                            self.assertEqual(db.query(PaymentOrder).filter_by(status="archived").count(), 1)
                            self.assertEqual(db.query(PaymentOrder).filter_by(id=abandoned_id).count(), 0)
                            self.assertEqual(db.query(CreditLot).count(), 3)
                        self.assertEqual(len(client.get("/api/billing/orders").json()), 3)
                    finally:
                        app.dependency_overrides.pop(get_current_user, None)
                engine.dispose()


if __name__ == "__main__":
    unittest.main()
