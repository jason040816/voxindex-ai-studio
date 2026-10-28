"""Checkout return must not credit an unsigned gateway error."""

import os
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch


class PaymentReturnTest(unittest.TestCase):
    def test_unsigned_error_redirects_without_credit_and_signed_success_is_idempotent(self):
        with tempfile.TemporaryDirectory() as temporary:
            environment = {
                "DATABASE_URL": f"sqlite:///{Path(temporary, 'payment-test.db').as_posix()}",
                "STORAGE_PATH": temporary,
                "TTS_PROVIDER": "stub",
                "UPG_MERCHANT_ID": "test-merchant",
                "UPG_SIGNING_KEY": "test-signing-key",
                "FRONTEND_APP_URL": "https://shop.example.invalid",
            }
            with patch.dict(os.environ, environment):
                from fastapi.testclient import TestClient

                from app.models import SessionLocal, engine
                from app.models.credits import CreditLot, PaymentOrder
                from app.models.user import User
                from app.services.merchant_checkout import sign
                from main import app

                with TestClient(app) as client:
                    with SessionLocal() as db:
                        user = User(
                            username="checkout_customer",
                            email="checkout@example.invalid",
                            hashed_password="unused",
                            is_admin=False,
                        )
                        db.add(user)
                        db.flush()
                        order = PaymentOrder(
                            user_id=user.id,
                            merchant_order_id="DXTESTORDER1",
                            package_code="starter",
                            points=50000,
                            amount=Decimal("108.00"),
                            currency="CNY",
                            pay_no="100000",
                            status="pending",
                        )
                        db.add(order)
                        db.commit()

                    unsigned = {
                        "merId": "test-merchant",
                        "merOrderId": "DXTESTORDER1",
                        "amount": "108.00",
                        "currency": "CNY",
                        "status": "0",
                        "errDesc": "Merchant's paymentMethod not configured",
                    }
                    response = client.post("/api/billing/return", data=unsigned, follow_redirects=False)
                    self.assertEqual(response.status_code, 303)
                    params = parse_qs(urlparse(response.headers["location"]).query)
                    self.assertEqual(params["checkout"], ["unverified"])
                    self.assertEqual(params["order"], ["DXTESTORDER1"])

                    with SessionLocal() as db:
                        self.assertEqual(db.query(PaymentOrder).one().status, "pending")
                        self.assertEqual(db.query(CreditLot).count(), 0)

                    signed = {
                        "merId": "test-merchant",
                        "merOrderId": "DXTESTORDER1",
                        "amount": "108.00",
                        "currency": "CNY",
                        "status": "1",
                    }
                    signed["sign"] = sign(signed)
                    for _ in range(2):
                        response = client.post("/api/billing/return", data=signed, follow_redirects=False)
                        self.assertEqual(response.status_code, 303)
                        self.assertEqual(parse_qs(urlparse(response.headers["location"]).query)["checkout"], ["paid"])

                    with SessionLocal() as db:
                        self.assertEqual(db.query(PaymentOrder).one().status, "paid")
                        self.assertEqual(db.query(CreditLot).count(), 1)
                        self.assertEqual(db.query(CreditLot).one().remaining, 50000)
                engine.dispose()


if __name__ == "__main__":
    unittest.main()
