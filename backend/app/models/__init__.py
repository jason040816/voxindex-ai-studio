from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/voice_synthesis")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

from app.models.user import User
from app.models.email_verification import EmailVerification
from app.models.voice_ref import VoiceReference
from app.models.synthesis import SynthesisJob
from app.models.digital_human import DigitalHumanVideo
from app.models.digital_human_model import DigitalHumanModel
from app.models.credits import CreditAllocation, CreditLot, CreditPackage, CreditRate, CreditTransaction, PaymentOrder
from app.models.api_access import ApiKeyUsageEvent, CustomerApiKey, IntegrationSetting, ProviderCallEvent

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
