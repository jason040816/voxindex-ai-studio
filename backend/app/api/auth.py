from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field
from app.models import get_db
from typing import Optional
from app.models.user import User
from app.models.email_verification import EmailVerification
from app.api.admin import clear_cached_stats
from app.services.auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
    create_password_reset_token,
    verify_password_reset_token,
)
from app.services.email import send_password_reset_code, send_registration_code
from app.services.auth import SECRET_KEY
from datetime import datetime, timedelta, timezone
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
import hashlib
import hmac
import logging
import secrets
from app.services.oss_backup import backup_file
import shutil
import uuid
import os

router = APIRouter()
logger = logging.getLogger(__name__)
CODE_EXPIRE_MINUTES = 10
CODE_RESEND_SECONDS = 60
CODE_MAX_PER_HOUR = 5
CODE_MAX_ATTEMPTS = 5


def _utc_now():
    # Stored as naive UTC for compatibility with SQLite and PostgreSQL DateTime columns.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _code_digest(email: str, code: str, purpose: str = "registration") -> str:
    return hmac.new(SECRET_KEY.encode("utf-8"), f"{purpose}:{email}:{code}".encode("utf-8"), hashlib.sha256).hexdigest()


def _email_registered(db: Session, email: str) -> bool:
    return db.query(User.id).filter(func.lower(User.email) == email).first() is not None

STORAGE_PATH = os.getenv("STORAGE_PATH", "../storage")
AVATARS_PATH = os.path.join(STORAGE_PATH, "avatars")
os.makedirs(AVATARS_PATH, exist_ok=True)

class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    verification_code: str
    referral_source: str = Field(min_length=1, max_length=160)


class SendRegistrationCodeRequest(BaseModel):
    email: EmailStr

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    is_admin: bool


class UserResponse(BaseModel):
    id: int
    username: str
    email: EmailStr
    is_admin: bool
    avatar_filename: Optional[str] = None

class UpdateProfileRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: Optional[str] = None
    email: Optional[EmailStr] = None
    verification_code: Optional[str] = None
    new_password: str

@router.post("/register/send-code")
def send_register_code(req: SendRegistrationCodeRequest, db: Session = Depends(get_db)):
    email = str(req.email).strip().lower()
    if _email_registered(db, email):
        raise HTTPException(status_code=400, detail="Email already registered")
    now = _utc_now()
    latest = (db.query(EmailVerification).filter(EmailVerification.email == email, EmailVerification.purpose == "registration")
              .order_by(EmailVerification.id.desc()).first())
    if latest and latest.created_at > now - timedelta(seconds=CODE_RESEND_SECONDS):
        raise HTTPException(status_code=429, detail="Please wait 60 seconds before requesting another code")
    sent_last_hour = (db.query(EmailVerification.id)
                      .filter(EmailVerification.email == email, EmailVerification.purpose == "registration",
                              EmailVerification.created_at > now - timedelta(hours=1)).count())
    if sent_last_hour >= CODE_MAX_PER_HOUR:
        raise HTTPException(status_code=429, detail="Too many codes requested. Please try again later")

    code = f"{secrets.randbelow(1000000):06d}"
    entry = EmailVerification(
        email=email, purpose="registration", code_digest=_code_digest(email, code), created_at=now,
        expires_at=now + timedelta(minutes=CODE_EXPIRE_MINUTES), attempts=0,
    )
    db.add(entry)
    db.commit()
    try:
        send_registration_code(email, code)
    except Exception:
        logger.exception("Registration email delivery failed")
        db.delete(entry)
        db.commit()
        raise HTTPException(status_code=503, detail="Unable to send verification email. Please try again later")
    return {"message": "Verification code sent", "resend_after_seconds": CODE_RESEND_SECONDS}


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    username = req.username.strip()
    email = str(req.email).strip().lower()
    referral_source = req.referral_source.strip()
    code = req.verification_code.strip()
    if len(username) < 3 or len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters and password at least 6 characters")
    if not referral_source:
        raise HTTPException(status_code=400, detail="推荐渠道/公司为必填项")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=400, detail="Username already registered")
    if _email_registered(db, email):
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(code) != 6 or not code.isascii() or not code.isdigit():
        raise HTTPException(status_code=400, detail="Invalid verification code")
    entry = (db.query(EmailVerification).filter(EmailVerification.email == email, EmailVerification.purpose == "registration")
             .order_by(EmailVerification.id.desc()).first())
    if not entry or entry.consumed_at or entry.expires_at <= _utc_now() or entry.attempts >= CODE_MAX_ATTEMPTS:
        raise HTTPException(status_code=400, detail="Verification code expired or unavailable. Request a new code")
    if not hmac.compare_digest(entry.code_digest, _code_digest(email, code)):
        entry.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid verification code")
    user = User(
        username=username,
        email=email,
        referral_source=referral_source,
        hashed_password=get_password_hash(req.password),
    )
    db.add(user)
    entry.consumed_at = _utc_now()
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Username or email already registered") from exc
    db.refresh(user)
    clear_cached_stats("users_growth_")
    clear_cached_stats("overview")
    return {"id": user.id, "username": user.username, "email": user.email}


@router.post("/forgot-password")
@router.post("/forgot-password/send-code")
def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    email = str(req.email).strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if user:
        now = _utc_now()
        latest = (db.query(EmailVerification).filter(
            EmailVerification.email == email, EmailVerification.purpose == "password_reset",
        ).order_by(EmailVerification.id.desc()).first())
        if latest and latest.created_at > now - timedelta(seconds=CODE_RESEND_SECONDS):
            return {"message": "If the email exists, a password reset code has been sent.", "resend_after_seconds": CODE_RESEND_SECONDS}
        sent_last_hour = db.query(EmailVerification.id).filter(
            EmailVerification.email == email,
            EmailVerification.purpose == "password_reset",
            EmailVerification.created_at > now - timedelta(hours=1),
        ).count()
        if sent_last_hour >= CODE_MAX_PER_HOUR:
            return {"message": "If the email exists, a password reset code has been sent."}
        code = f"{secrets.randbelow(1000000):06d}"
        entry = EmailVerification(
            email=email,
            purpose="password_reset",
            code_digest=_code_digest(email, code, "password_reset"),
            created_at=now,
            expires_at=now + timedelta(minutes=CODE_EXPIRE_MINUTES),
            attempts=0,
        )
        db.add(entry)
        db.commit()
        try:
            send_password_reset_code(user.email, code)
        except Exception:
            db.delete(entry)
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="验证码邮件发送失败，请检查邮件服务配置后重试。",
            )
    return {"message": "If the email exists, a password reset code has been sent.", "resend_after_seconds": CODE_RESEND_SECONDS}


@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    verification = None
    if req.token:
        try:
            email = verify_password_reset_token(req.token)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        email = email.strip().lower()
    else:
        if not req.email or not req.verification_code:
            raise HTTPException(status_code=400, detail="请输入邮箱和邮箱验证码")
        email = str(req.email).strip().lower()
        code = req.verification_code.strip()
        if len(code) != 6 or not code.isascii() or not code.isdigit():
            raise HTTPException(status_code=400, detail="邮箱验证码无效")
        verification = (db.query(EmailVerification).filter(
            EmailVerification.email == email,
            EmailVerification.purpose == "password_reset",
        ).order_by(EmailVerification.id.desc()).first())
        if not verification or verification.consumed_at or verification.expires_at <= _utc_now() or verification.attempts >= CODE_MAX_ATTEMPTS:
            raise HTTPException(status_code=400, detail="验证码已过期或不可用，请重新获取")
        if not hmac.compare_digest(verification.code_digest, _code_digest(email, code, "password_reset")):
            verification.attempts += 1
            db.commit()
            raise HTTPException(status_code=400, detail="邮箱验证码错误")

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if len(req.new_password) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 6 characters")

    if verify_password(req.new_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password cannot be the same as the old password")

    user.hashed_password = get_password_hash(req.new_password)
    if verification:
        verification.consumed_at = _utc_now()
    db.commit()
    return {"message": "Password reset successfully"}

@router.post("/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")
    if user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已被管理员封禁")
    token = create_access_token({"sub": user.username, "is_admin": user.is_admin})
    return {"access_token": token, "token_type": "bearer", "is_admin": user.is_admin}


@router.get("/me", response_model=UserResponse)
def read_current_user(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "is_admin": current_user.is_admin,
        "avatar_filename": current_user.avatar_filename,
    }

@router.patch("/me", response_model=UserResponse)
def update_current_user(
    req: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if req.username and req.username != current_user.username:
        if db.query(User).filter(User.username == req.username).first():
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = req.username

    if req.email and req.email != current_user.email:
        if db.query(User).filter(User.email == req.email).first():
            raise HTTPException(status_code=400, detail="Email already taken")
        current_user.email = req.email

    if req.password:
        if len(req.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        if verify_password(req.password, current_user.hashed_password):
            raise HTTPException(status_code=400, detail="New password cannot be the same as the old password")
        current_user.hashed_password = get_password_hash(req.password)

    db.commit()
    db.refresh(current_user)
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "is_admin": current_user.is_admin,
        "avatar_filename": current_user.avatar_filename,
    }

@router.post("/me/avatar")
def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if file.content_type not in ["image/jpeg", "image/png", "image/webp"]:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG and WebP images are allowed")
    
    if current_user.avatar_filename:
        old_path = os.path.join(AVATARS_PATH, current_user.avatar_filename)
        if os.path.exists(old_path):
            os.remove(old_path)

    ext = file.filename.rsplit(".", 1)[-1].lower()
    filename = f"{current_user.id}_{uuid.uuid4().hex}.{ext}"
    file_path = os.path.join(AVATARS_PATH, filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    backup_file(file_path, f"avatars/{filename}")

    current_user.avatar_filename = filename
    db.commit()
    db.refresh(current_user)
    return {"avatar_filename": filename}

@router.delete("/me/avatar")
def delete_avatar(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user.avatar_filename:
        raise HTTPException(status_code=404, detail="No avatar to delete")
    
    file_path = os.path.join(AVATARS_PATH, current_user.avatar_filename)
    if os.path.exists(file_path):
        os.remove(file_path)
    
    current_user.avatar_filename = None
    db.commit()
    return {"message": "Avatar removed"}
