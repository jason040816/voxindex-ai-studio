"""Registration requires a valid, one-use email code."""

import os
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch


class RegistrationEmailTest(unittest.TestCase):
    def test_registration_code_lifecycle(self):
        with tempfile.TemporaryDirectory() as temporary:
            environment = {
                "DATABASE_URL": f"sqlite:///{Path(temporary, 'registration.db').as_posix()}",
                "STORAGE_PATH": temporary,
                "TTS_PROVIDER": "stub",
                "SECRET_KEY": "test-secret-key-long-enough-for-registration",
                "EMAIL_PROVIDER": "smtp",
            }
            with patch.dict(os.environ, environment):
                from fastapi.testclient import TestClient
                from app.models import SessionLocal, engine
                from app.models.email_verification import EmailVerification
                from app.models.user import User
                from main import app

                delivered = []
                with patch("app.api.auth.send_registration_code", side_effect=lambda email, code: delivered.append((email, code))):
                    with TestClient(app) as client:
                        email = "NewUser@example.com"
                        send = lambda: client.post("/api/auth/register/send-code", json={"email": email})
                        registration = lambda code: client.post("/api/auth/register", json={
                            "username": "new_user", "email": email, "password": "password123",
                            "verification_code": code, "referral_source": "测试渠道/公司",
                        })

                        self.assertEqual(registration("123456").status_code, 400)
                        response = send()
                        self.assertEqual(response.status_code, 200)
                        self.assertNotIn(delivered[0][1], response.text)
                        self.assertEqual(delivered[0][0], "newuser@example.com")
                        self.assertEqual(send().status_code, 429)

                        with SessionLocal() as db:
                            entry = db.query(EmailVerification).first()
                            self.assertNotEqual(entry.code_digest, delivered[0][1])

                        wrong = "000000" if delivered[0][1] != "000000" else "999999"
                        for _ in range(5):
                            self.assertEqual(registration(wrong).status_code, 400)
                        self.assertEqual(registration(delivered[0][1]).status_code, 400)

                        with SessionLocal() as db:
                            entry = db.query(EmailVerification).first()
                            entry.created_at -= timedelta(seconds=61)
                            db.commit()

                        self.assertEqual(send().status_code, 200)
                        with SessionLocal() as db:
                            latest = db.query(EmailVerification).order_by(EmailVerification.id.desc()).first()
                            latest.expires_at -= timedelta(minutes=11)
                            db.commit()
                        self.assertEqual(registration(delivered[-1][1]).status_code, 400)

                        with SessionLocal() as db:
                            latest = db.query(EmailVerification).order_by(EmailVerification.id.desc()).first()
                            latest.created_at -= timedelta(seconds=61)
                            db.commit()
                        self.assertEqual(send().status_code, 200)
                        self.assertEqual(registration(delivered[-1][1]).status_code, 201)
                        self.assertEqual(registration(delivered[-1][1]).status_code, 400)
                        with SessionLocal() as db:
                            user = db.query(User).filter(User.username == "new_user").one()
                            self.assertEqual(user.email, "newuser@example.com")
                            self.assertEqual(user.referral_source, "测试渠道/公司")
                        self.assertEqual(send().status_code, 400)

                        with patch("app.api.auth.send_registration_code", side_effect=OSError("SMTP unavailable")):
                            failed = client.post("/api/auth/register/send-code", json={"email": "other@example.com"})
                            self.assertEqual(failed.status_code, 503)
                            self.assertNotIn("SMTP unavailable", failed.text)
                        with SessionLocal() as db:
                            self.assertEqual(db.query(EmailVerification).filter_by(email="other@example.com").count(), 0)
                engine.dispose()


if __name__ == "__main__":
    unittest.main()
