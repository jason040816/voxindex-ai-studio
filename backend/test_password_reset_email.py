"""Password reset requires a one-use email verification code."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class PasswordResetEmailTest(unittest.TestCase):
    def test_reset_code_is_required_and_consumed(self):
        with tempfile.TemporaryDirectory() as temporary:
            environment = {
                "DATABASE_URL": f"sqlite:///{Path(temporary, 'password-reset.db').as_posix()}",
                "STORAGE_PATH": temporary,
                "TTS_PROVIDER": "stub",
                "SECRET_KEY": "test-secret-key-long-enough-for-password-reset",
                "EMAIL_PROVIDER": "smtp",
            }
            with patch.dict(os.environ, environment):
                from fastapi.testclient import TestClient
                from app.models import SessionLocal, engine
                from app.models.user import User
                from app.services.auth import get_password_hash, verify_password
                from main import app

                delivered = []
                with patch("app.api.auth.send_password_reset_code", side_effect=lambda email, code: delivered.append((email, code))):
                    with TestClient(app) as client:
                        with SessionLocal() as db:
                            db.add(User(username="reset_user", email="reset@example.com", hashed_password=get_password_hash("old-password")))
                            db.commit()
                        response = client.post("/api/auth/forgot-password", json={"email": "reset@example.com"})
                        self.assertEqual(response.status_code, 200)
                        self.assertNotIn(delivered[0][1], response.text)
                        self.assertEqual(delivered[0][0], "reset@example.com")

                        bad = client.post("/api/auth/reset-password", json={
                            "email": "reset@example.com", "verification_code": "000000",
                            "new_password": "new-password",
                        })
                        if delivered[0][1] != "000000":
                            self.assertEqual(bad.status_code, 400)
                        self.assertEqual(client.post("/api/auth/reset-password", json={
                            "email": "reset@example.com", "verification_code": delivered[0][1],
                            "new_password": "new-password",
                        }).status_code, 200)
                        self.assertEqual(client.post("/api/auth/reset-password", json={
                            "email": "reset@example.com", "verification_code": delivered[0][1],
                            "new_password": "another-password",
                        }).status_code, 400)

                with SessionLocal() as db:
                    user = db.query(User).filter_by(email="reset@example.com").one()
                    self.assertTrue(verify_password("new-password", user.hashed_password))
                engine.dispose()


if __name__ == "__main__":
    unittest.main()
