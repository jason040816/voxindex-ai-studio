"""Regression checks for bundled video seconds and metered credit charges."""

import os
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch


class DigitalHumanMeteringTest(unittest.TestCase):
    def test_z_legacy_models_receive_allowance_once(self):
        from sqlalchemy import create_engine, text
        import main

        legacy_engine = create_engine("sqlite://")
        with legacy_engine.begin() as connection:
            connection.execute(text("CREATE TABLE digital_human_models (id INTEGER PRIMARY KEY)"))
            connection.execute(text("CREATE TABLE digital_human_videos (id INTEGER PRIMARY KEY)"))
            connection.execute(text("INSERT INTO digital_human_models (id) VALUES (1)"))
        with patch.object(main, "engine", legacy_engine):
            main._ensure_digital_human_billing_columns()
            with legacy_engine.begin() as connection:
                self.assertEqual(connection.execute(text(
                    "SELECT included_seconds_total, included_seconds_remaining "
                    "FROM digital_human_models WHERE id = 1"
                )).one(), (1800, 1800))
                connection.execute(text(
                    "UPDATE digital_human_models SET included_seconds_remaining = 60 WHERE id = 1"
                ))
            main._ensure_digital_human_billing_columns()
            with legacy_engine.connect() as connection:
                self.assertEqual(connection.execute(text(
                    "SELECT included_seconds_remaining FROM digital_human_models WHERE id = 1"
                )).scalar_one(), 60)
        legacy_engine.dispose()

    def test_z_rate_boundaries(self):
        from app.services.credits import text_generation_cost, video_cost_breakdown

        self.assertEqual(text_generation_cost(1, 15), 1)
        self.assertEqual(text_generation_cost(1000, 15), 2)
        self.assertEqual(text_generation_cost(2000, 15), 3)
        self.assertEqual(video_cost_breakdown(300, 300, 2), (300, 0, 0))
        self.assertEqual(video_cost_breakdown(300, 60, 2), (60, 240, 480))
        self.assertEqual(video_cost_breakdown(300, 0, 2), (0, 300, 600))

    def test_video_failure_restores_allowance_and_success_captures_once(self):
        with tempfile.TemporaryDirectory() as temporary:
            environment = {
                "DATABASE_URL": f"sqlite:///{Path(temporary, 'metering.db').as_posix()}",
                "STORAGE_PATH": temporary,
                "TTS_PROVIDER": "stub",
                "FRONTEND_APP_URL": "https://voice.example.invalid",
            }
            with patch.dict(os.environ, environment):
                from fastapi.testclient import TestClient
                from app.models import SessionLocal, engine
                from app.models.credits import CreditLot, CreditRate, CreditTransaction
                from app.models.digital_human_model import DigitalHumanModel
                from app.models.synthesis import SynthesisJob
                from app.models.user import User
                from app.services.auth import get_current_user
                from app.services.xingchen import XingchenError
                from main import app

                with TestClient(app) as client:
                    audio_path = Path(temporary, "input.wav")
                    with wave.open(str(audio_path), "wb") as audio:
                        audio.setnchannels(1)
                        audio.setsampwidth(2)
                        audio.setframerate(1)
                        audio.writeframes(b"\0\0" * 300)

                    with SessionLocal() as db:
                        user = User(username="video_meter", email="video@example.invalid", hashed_password="unused")
                        db.add(user)
                        db.flush()
                        user_id = user.id
                        db.add(CreditLot(user_id=user_id, amount=2000, remaining=2000, source_type="test"))
                        db.add(DigitalHumanModel(
                            user_id=user_id, remote_model_id=123, name="测试模型", status=2,
                            included_seconds_total=1800, included_seconds_remaining=60,
                        ))
                        db.add(SynthesisJob(
                            user_id=user_id, voice_ref_id=1, input_text="hello", status="completed",
                            output_filename="input.wav", output_path=str(audio_path),
                        ))
                        db.query(CreditRate).filter_by(operation="digital_human_video").one().points = 2
                        db.commit()
                        job_id = db.query(SynthesisJob.id).one()[0]

                    app.dependency_overrides[get_current_user] = lambda: User(
                        id=user_id, username="video_meter", email="video@example.invalid",
                        hashed_password="unused", is_admin=False, digital_human_video_limit=0,
                    )
                    try:
                        def submit(remote_id):
                            with patch("app.api.digital_human.get_model", return_value={"data": {"status": 2}}), patch(
                                "app.api.digital_human.create_video", return_value={"data": {"videoId": remote_id}}
                            ):
                                return client.post("/api/digital-human/videos", json={
                                    "synthesis_job_id": job_id, "model_id": 123,
                                })

                        first = submit(987)
                        self.assertEqual(first.status_code, 201, first.text)
                        self.assertEqual(first.json()["included_seconds_used"], 60)
                        self.assertEqual(first.json()["billed_seconds"], 240)
                        self.assertEqual(first.json()["charged_credits"], 480)
                        with SessionLocal() as db:
                            self.assertEqual(db.query(DigitalHumanModel).one().included_seconds_remaining, 0)
                            self.assertEqual(db.query(CreditLot).one().remaining, 1520)

                        failure = {"callbackType": "clone", "taskType": "video-synthesis", "data": {
                            "videoId": 987, "synthesisStatus": 4,
                        }}
                        with patch("app.api.digital_human.get_video", return_value={"data": {"synthesisStatus": 2}}):
                            self.assertEqual(client.post("/api/digital-human/callback", json=failure).status_code, 200)
                        with SessionLocal() as db:
                            self.assertEqual(db.query(DigitalHumanModel).one().included_seconds_remaining, 0)
                            self.assertEqual(db.query(CreditLot).one().remaining, 1520)
                        with patch("app.api.digital_human.get_video", return_value={"data": failure["data"]}):
                            self.assertEqual(client.post("/api/digital-human/callback", json=failure).status_code, 200)
                            self.assertEqual(client.post("/api/digital-human/callback", json=failure).status_code, 200)
                        with SessionLocal() as db:
                            self.assertEqual(db.query(DigitalHumanModel).one().included_seconds_remaining, 60)
                            self.assertEqual(db.query(CreditLot).one().remaining, 2000)
                            self.assertEqual(db.query(CreditTransaction).filter_by(kind="refund").count(), 1)

                        with patch("app.api.digital_human.get_model", return_value={"data": {"status": 2}}), patch(
                            "app.api.digital_human.create_video", side_effect=XingchenError("upstream unavailable")
                        ):
                            rejected = client.post("/api/digital-human/videos", json={
                                "synthesis_job_id": job_id, "model_id": 123,
                            })
                        self.assertEqual(rejected.status_code, 502, rejected.text)
                        with SessionLocal() as db:
                            self.assertEqual(db.query(DigitalHumanModel).one().included_seconds_remaining, 60)
                            self.assertEqual(db.query(CreditLot).one().remaining, 2000)

                        second = submit(988)
                        self.assertEqual(second.status_code, 201, second.text)
                        success = {"callbackType": "clone", "taskType": "video-synthesis", "data": {
                            "videoId": 988, "synthesisStatus": 3,
                        }}
                        with patch("app.api.digital_human.get_video", return_value={"data": success["data"]}):
                            self.assertEqual(client.post("/api/digital-human/callback", json=success).status_code, 200)
                            self.assertEqual(client.post("/api/digital-human/callback", json=success).status_code, 200)
                        with SessionLocal() as db:
                            self.assertEqual(db.query(DigitalHumanModel).one().included_seconds_remaining, 0)
                            self.assertEqual(db.query(CreditLot).one().remaining, 1520)
                            self.assertEqual(db.query(CreditTransaction).filter_by(status="completed", kind="usage").count(), 1)
                    finally:
                        app.dependency_overrides.clear()
                engine.dispose()


if __name__ == "__main__":
    unittest.main()
