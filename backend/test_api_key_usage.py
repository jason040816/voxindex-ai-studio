"""Integration checks for per-key request accounting and admin usage details."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class ApiKeyUsageTest(unittest.TestCase):
    def test_key_requests_are_counted_and_attributed_separately(self):
        with tempfile.TemporaryDirectory() as temporary:
            database = Path(temporary, "usage-test.db").as_posix()
            environment = {
                "DATABASE_URL": f"sqlite:///{database}",
                "STORAGE_PATH": temporary,
                "TTS_PROVIDER": "stub",
            }
            with patch.dict(os.environ, environment):
                from fastapi.testclient import TestClient

                from app.models import SessionLocal, engine
                from app.models.credits import CreditRate
                from app.models.user import User
                from app.services.auth import create_access_token
                from app.services.credits import grant_credits
                from main import app

                with TestClient(app) as client:
                    with SessionLocal() as db:
                        db.add_all([
                            User(username="usage_admin", email="admin@example.invalid", hashed_password="unused", is_admin=True),
                            User(username="usage_customer", email="customer@example.invalid", hashed_password="unused", is_admin=False),
                        ])
                        db.commit()
                        customer_id = db.query(User.id).filter(User.username == "usage_customer").scalar()

                    admin_headers = {"Authorization": f"Bearer {create_access_token({'sub': 'usage_admin'})}"}
                    keys = []
                    for name in ("first", "second"):
                        response = client.post(
                            "/api/admin/api-keys",
                            headers=admin_headers,
                            json={"user_id": customer_id, "name": name, "max_requests": 3},
                        )
                        self.assertEqual(response.status_code, 201, response.text)
                        keys.append(response.json())

                    first_headers = {"Authorization": f"Bearer {keys[0]['api_key']}"}
                    self.assertEqual(client.get("/api/voice-clones/", headers=first_headers).status_code, 200)
                    self.assertEqual(
                        client.post("/api/synthesis/", headers=first_headers, json={"voice_ref_id": 1, "text": ""}).status_code,
                        422,
                    )
                    self.assertEqual(client.get("/api/synthesis/voices", headers=first_headers).status_code, 200)
                    self.assertEqual(client.get("/api/voice-clones/", headers=first_headers).status_code, 429)

                    key_list = client.get("/api/admin/api-keys", headers=admin_headers)
                    self.assertEqual(key_list.status_code, 200, key_list.text)
                    listed_first_key = next(item for item in key_list.json() if item["id"] == keys[0]["id"])
                    self.assertTrue(listed_first_key["last_used_at"].endswith("+00:00"))

                    usage = client.get(f"/api/admin/api-keys/{keys[0]['id']}/usage", headers=admin_headers)
                    self.assertEqual(usage.status_code, 200, usage.text)
                    details = usage.json()
                    self.assertEqual(details["summary"]["request_count"], 3)
                    self.assertEqual(details["request_events_total"], 4)
                    self.assertTrue(details["summary"]["last_used_at"].endswith("+00:00"))
                    self.assertTrue(details["request_events"][0]["created_at"].endswith("+00:00"))
                    self.assertEqual(sorted(event["status_code"] for event in details["request_events"]), [200, 200, 422, 429])
                    self.assertEqual(details["summary"]["synthesis_failed_count"], 1)

                    first_page = client.get(
                        f"/api/admin/api-keys/{keys[0]['id']}/usage",
                        headers=admin_headers,
                        params={"page": 1, "limit": 2},
                    ).json()
                    second_page = client.get(
                        f"/api/admin/api-keys/{keys[0]['id']}/usage",
                        headers=admin_headers,
                        params={"page": 2, "limit": 2},
                    ).json()
                    self.assertEqual(first_page["pages"], 2)
                    self.assertEqual(len(first_page["request_events"]), 2)
                    self.assertEqual(len(second_page["request_events"]), 2)
                    self.assertFalse(
                        {event["id"] for event in first_page["request_events"]}
                        & {event["id"] for event in second_page["request_events"]}
                    )

                    other_usage = client.get(f"/api/admin/api-keys/{keys[1]['id']}/usage", headers=admin_headers)
                    self.assertEqual(other_usage.status_code, 200, other_usage.text)
                    self.assertEqual(other_usage.json()["summary"]["request_count"], 0)
                    self.assertEqual(other_usage.json()["request_events_total"], 0)

                    second_headers = {"Authorization": f"Bearer {keys[1]['api_key']}"}
                    voices_response = client.get("/api/synthesis/voices", headers=second_headers)
                    self.assertEqual(voices_response.status_code, 200, voices_response.text)
                    voice_ref_id = voices_response.json()["presets"][0]["reference_id"]
                    with SessionLocal() as db:
                        rate = db.query(CreditRate).filter(CreditRate.operation == "audio_generation").first()
                        rate.points = 7
                        grant_credits(
                            db,
                            user_id=customer_id,
                            amount=20,
                            source_type="test",
                            source_ref=None,
                            description="Usage test credits",
                            expires_at=None,
                        )
                        db.commit()
                    with patch("app.api.synthesis.synthesize"), patch("app.api.synthesis.backup_file"):
                        synthesis_response = client.post(
                            "/api/synthesis/",
                            headers=second_headers,
                            json={"voice_ref_id": voice_ref_id, "text": "Hello"},
                        )
                    self.assertEqual(synthesis_response.status_code, 201, synthesis_response.text)
                    self.assertEqual(synthesis_response.json()["status"], "completed")

                    other_usage = client.get(f"/api/admin/api-keys/{keys[1]['id']}/usage", headers=admin_headers)
                    summary = other_usage.json()["summary"]
                    self.assertEqual(summary["request_count"], 2)
                    self.assertEqual(summary["synthesis_success_count"], 1)
                    self.assertEqual(summary["synthesized_characters"], 5)
                    self.assertEqual(summary["points_used"], 7)
                engine.dispose()


if __name__ == "__main__":
    unittest.main()
