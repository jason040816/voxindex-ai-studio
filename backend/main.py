from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from dotenv import load_dotenv
from sqlalchemy import inspect, text

env_path = os.path.join(os.path.dirname(__file__), ".env")
# Prefer environment variables supplied by Docker Compose in production;
# use the local .env only as defaults for development.
load_dotenv(env_path)

from app.models import Base, SessionLocal, engine
from app.models.api_access import ApiKeyUsageEvent
from app.api import auth as auth_router
from app.api import voice_refs as voice_refs_router
from app.api import voice_clones as voice_clones_router
from app.api import synthesis as synthesis_router
from app.api import admin as admin_router
from app.api import sample as sample_router
from app.api import digital_human as digital_human_router
from app.api import billing as billing_router
from app.services.tts import TTSServiceError, warmup as tts_warmup
from app.services.credits import VIDEO_INCLUDED_SECONDS, seed_credit_catalog

app = FastAPI(title="Voice Synthesis API")


@app.middleware("http")
async def finalize_api_key_usage(request, call_next):
    try:
        response = await call_next(request)
    except Exception:
        _save_api_key_response(request, 500)
        raise
    _save_api_key_response(request, response.status_code)
    return response


def _save_api_key_response(request, status_code: int) -> None:
    event_id = getattr(request.state, "api_key_usage_event_id", None)
    if not event_id:
        return
    try:
        with SessionLocal() as db:
            event = db.query(ApiKeyUsageEvent).filter(ApiKeyUsageEvent.id == event_id).first()
            if event:
                event.status_code = status_code
                if status_code >= 400 and event.outcome is None:
                    event.outcome = "failed"
                db.commit()
    except Exception:
        # Usage logging must never turn an otherwise successful API call into a failure.
        pass


@app.get("/api/health")
def health_check():
    return {"status": "ok"}

def _parse_origins(raw_origins: str):
    origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    return origins or ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174", "http://localhost:5175", "http://127.0.0.1:5175"]


frontend_origins = _parse_origins(
    os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:5175,http://127.0.0.1:5175")
)

frontend_origin_regex = os.getenv(
    "FRONTEND_ORIGIN_REGEX",
    r"^https://([a-z0-9-]+\.)*vercel\.app$",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_origin_regex=frontend_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STORAGE_PATH = os.getenv("STORAGE_PATH", "../storage")
OUTPUTS_PATH = os.path.join(STORAGE_PATH, "outputs")
VOICE_REFS_PATH = os.path.join(STORAGE_PATH, "voice_refs")
DIGITAL_HUMAN_PATH = os.path.join(STORAGE_PATH, "digital_human")
DIGITAL_HUMAN_INPUT_PATH = os.path.join(STORAGE_PATH, "digital_human_inputs")

AVATARS_PATH = os.path.join(STORAGE_PATH, "avatars")
os.makedirs(AVATARS_PATH, exist_ok=True)
app.mount("/static/avatars", StaticFiles(directory=AVATARS_PATH), name="avatars")

os.makedirs(OUTPUTS_PATH, exist_ok=True)
os.makedirs(VOICE_REFS_PATH, exist_ok=True)
os.makedirs(DIGITAL_HUMAN_PATH, exist_ok=True)
os.makedirs(DIGITAL_HUMAN_INPUT_PATH, exist_ok=True)

app.mount("/static/outputs", StaticFiles(directory=OUTPUTS_PATH), name="outputs")
app.mount("/static/voice_refs", StaticFiles(directory=VOICE_REFS_PATH), name="voice_refs")
app.mount("/static/digital_human", StaticFiles(directory=DIGITAL_HUMAN_PATH), name="digital_human")
app.mount("/static/digital_human_inputs", StaticFiles(directory=DIGITAL_HUMAN_INPUT_PATH), name="digital_human_inputs")


def _ensure_user_admin_column():
    with engine.begin() as connection:
        inspector = inspect(connection)
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        if "is_admin" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE"))

def _ensure_avatar_column():
    with engine.begin() as connection:
        inspector = inspect(connection)
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        if "avatar_filename" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN avatar_filename VARCHAR"))


def _ensure_user_control_columns():
    required_columns = {
        "is_banned": "BOOLEAN NOT NULL DEFAULT FALSE",
        "voice_clone_limit": "INTEGER NOT NULL DEFAULT 0",
        "synthesis_limit": "INTEGER NOT NULL DEFAULT 0",
        "digital_human_model_limit": "INTEGER NOT NULL DEFAULT 0",
        "digital_human_video_limit": "INTEGER NOT NULL DEFAULT 0",
    }
    required_columns["referral_source"] = "VARCHAR(160)"
    with engine.begin() as connection:
        inspector = inspect(connection)
        columns = {column["name"] for column in inspector.get_columns("users")}
        for name, definition in required_columns.items():
            if name not in columns:
                connection.execute(text(f"ALTER TABLE users ADD COLUMN {name} {definition}"))


def _ensure_voice_clone_columns():
    required_columns = {
        "display_name": "VARCHAR",
        "sample_text": "TEXT",
        "provider_voice_id": "VARCHAR",
        "provider": "VARCHAR NOT NULL DEFAULT 'local'",
        "clone_status": "VARCHAR NOT NULL DEFAULT 'reference'",
        "is_clone": "BOOLEAN NOT NULL DEFAULT FALSE",
        "is_enabled": "BOOLEAN NOT NULL DEFAULT TRUE",
        "consent_confirmed": "BOOLEAN NOT NULL DEFAULT FALSE",
    }
    with engine.begin() as connection:
        inspector = inspect(connection)
        columns = {column["name"] for column in inspector.get_columns("voice_references")}
        for name, definition in required_columns.items():
            if name not in columns:
                connection.execute(text(f"ALTER TABLE voice_references ADD COLUMN {name} {definition}"))


def _ensure_synthesis_columns():
    with engine.begin() as connection:
        inspector = inspect(connection)
        columns = {column["name"] for column in inspector.get_columns("synthesis_jobs")}
        if "audio_name" not in columns:
            connection.execute(text("ALTER TABLE synthesis_jobs ADD COLUMN audio_name VARCHAR"))


def _ensure_digital_human_billing_columns():
    # When the allowance columns are first added, grant each existing model
    # one full bundle. This runs once; restarts never replenish used seconds.
    additions = {
        "digital_human_models": {
            "included_seconds_total": "INTEGER NOT NULL DEFAULT 0",
            "included_seconds_remaining": "INTEGER NOT NULL DEFAULT 0",
        },
        "digital_human_videos": {
            "duration_seconds": "INTEGER",
            "included_seconds_used": "INTEGER NOT NULL DEFAULT 0",
            "billed_seconds": "INTEGER NOT NULL DEFAULT 0",
            "charged_credits": "INTEGER NOT NULL DEFAULT 0",
            "billing_status": "VARCHAR(16) NOT NULL DEFAULT 'legacy'",
        },
    }
    with engine.begin() as connection:
        inspector = inspect(connection)
        for table, required in additions.items():
            columns = {column["name"] for column in inspector.get_columns(table)}
            first_model_migration = table == "digital_human_models" and "included_seconds_total" not in columns
            for name, definition in required.items():
                if name not in columns:
                    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {definition}"))
            if first_model_migration:
                connection.execute(text(
                    "UPDATE digital_human_models SET included_seconds_total = :seconds, "
                    "included_seconds_remaining = :seconds"
                ), {"seconds": VIDEO_INCLUDED_SECONDS})


def _ensure_api_access_columns():
    with engine.begin() as connection:
        inspector = inspect(connection)
        if "customer_api_keys" not in inspector.get_table_names():
            return
        columns = {column["name"] for column in inspector.get_columns("customer_api_keys")}
        if "max_requests" not in columns:
            connection.execute(text("ALTER TABLE customer_api_keys ADD COLUMN max_requests INTEGER NOT NULL DEFAULT 0"))
        if "api_key_usage_events" in inspector.get_table_names():
            event_columns = {column["name"] for column in inspector.get_columns("api_key_usage_events")}
            additions = {
                "outcome": "VARCHAR(24)",
                "characters": "INTEGER NOT NULL DEFAULT 0",
                "credits_used": "INTEGER NOT NULL DEFAULT 0",
            }
            for name, definition in additions.items():
                if name not in event_columns:
                    connection.execute(text(f"ALTER TABLE api_key_usage_events ADD COLUMN {name} {definition}"))


def _ensure_email_verification_purpose_column():
    with engine.begin() as connection:
        inspector = inspect(connection)
        if "email_verifications" not in inspector.get_table_names():
            return
        columns = {column["name"] for column in inspector.get_columns("email_verifications")}
        if "purpose" not in columns:
            connection.execute(text(
                "ALTER TABLE email_verifications ADD COLUMN purpose VARCHAR(32) NOT NULL DEFAULT 'registration'"
            ))


@app.on_event("startup")
async def startup_event():
    Base.metadata.create_all(bind=engine)
    _ensure_user_admin_column()
    _ensure_avatar_column()
    _ensure_user_control_columns()
    _ensure_voice_clone_columns()
    _ensure_synthesis_columns()
    _ensure_digital_human_billing_columns()
    _ensure_api_access_columns()
    _ensure_email_verification_purpose_column()
    with SessionLocal() as db:
        seed_credit_catalog(db)
    os.makedirs(OUTPUTS_PATH, exist_ok=True)
    os.makedirs(VOICE_REFS_PATH, exist_ok=True)
    os.makedirs(DIGITAL_HUMAN_PATH, exist_ok=True)
    os.makedirs(DIGITAL_HUMAN_INPUT_PATH, exist_ok=True)

    if os.getenv("TTS_PROVIDER", "indextts2").strip().lower() == "indextts2":
        try:
            tts_warmup()
        except TTSServiceError:
            # Let the app start; the first request will surface the runtime error if warmup fails.
            pass

app.include_router(auth_router.router, prefix="/api/auth", tags=["auth"])
app.include_router(voice_refs_router.router, prefix="/api/voice-refs", tags=["voice-refs"])
app.include_router(voice_clones_router.router, prefix="/api/voice-clones", tags=["voice-clones"])
app.include_router(synthesis_router.router, prefix="/api/synthesis", tags=["synthesis"])
app.include_router(admin_router.router, prefix="/api/admin", tags=["admin"])
app.include_router(sample_router.router, prefix="/api/sample", tags=["sample"])
app.include_router(digital_human_router.router, prefix="/api/digital-human", tags=["digital-human"])
app.include_router(billing_router.router, prefix="/api/billing", tags=["billing"])
