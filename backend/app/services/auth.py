from datetime import datetime, timedelta, timezone
import hashlib
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.models import get_db
from app.models.api_access import ApiKeyUsageEvent, CustomerApiKey
from app.models.user import User
import os

SECRET_KEY = os.getenv("SECRET_KEY", "changeme-very-secret-key-at-least-32chars")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
PASSWORD_RESET_EXPIRE_MINUTES = int(os.getenv("PASSWORD_RESET_EXPIRE_MINUTES", "60"))
PASSWORD_RESET_PURPOSE = "password_reset"


def _api_operation(request: Request) -> str:
    path = request.url.path
    if path.startswith("/api/voice-clones"):
        return "voice_clone" if request.method == "POST" else "voice_clone_management"
    if path == "/api/synthesis/" and request.method == "POST":
        return "synthesis"
    if path == "/api/synthesis/voices":
        return "voice_list"
    if path.endswith("/audio"):
        return "audio_download"
    return "synthesis_management"


def _record_api_key_event(db: Session, request: Request, api_key_id: int, status_code: int | None = None) -> None:
    event = ApiKeyUsageEvent(
        api_key_id=api_key_id,
        method=request.method[:12],
        path=request.url.path[:500],
        operation=_api_operation(request),
        status_code=status_code,
        outcome="blocked" if status_code == 429 else None,
    )
    db.add(event)
    db.flush()
    request.state.api_key_id = api_key_id
    request.state.api_key_usage_event_id = event.id

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_password_reset_token(email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=PASSWORD_RESET_EXPIRE_MINUTES)
    payload = {
        "sub": email,
        "purpose": PASSWORD_RESET_PURPOSE,
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_password_reset_token(token: str) -> str:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") != PASSWORD_RESET_PURPOSE:
            raise ValueError("Invalid reset token")
        email = payload.get("sub")
        if not email:
            raise ValueError("Invalid reset token")
        return email
    except JWTError as exc:
        raise ValueError("Invalid or expired reset token") from exc

def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if token.startswith("dx_live_"):
        allowed_prefixes = ("/api/voice-clones", "/api/synthesis")
        if not any(
            request.url.path == prefix or request.url.path.startswith(f"{prefix}/")
            for prefix in allowed_prefixes
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This API key is limited to voice clone and synthesis APIs")

        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        api_key = db.query(CustomerApiKey).filter(
            CustomerApiKey.token_hash == token_hash,
            CustomerApiKey.revoked_at.is_(None),
        ).first()
        if not api_key:
            raise credentials_exception

        user = db.query(User).filter(User.id == api_key.user_id).first()
        if not user:
            raise credentials_exception
        if user.is_banned:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已被管理员封禁")

        now = datetime.now(timezone.utc)
        if api_key.max_requests and api_key.request_count >= api_key.max_requests:
            _record_api_key_event(db, request, api_key.id, status.HTTP_429_TOO_MANY_REQUESTS)
            db.commit()
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="此 API Key 已达到调用次数上限")
        updated = db.query(CustomerApiKey).filter(
            CustomerApiKey.id == api_key.id,
            CustomerApiKey.revoked_at.is_(None),
            or_(CustomerApiKey.max_requests == 0, CustomerApiKey.request_count < CustomerApiKey.max_requests),
        ).update(
            {
                CustomerApiKey.last_used_at: now,
                CustomerApiKey.request_count: CustomerApiKey.request_count + 1,
            },
            synchronize_session=False,
        )
        if not updated:
            db.rollback()
            _record_api_key_event(db, request, api_key.id, status.HTTP_429_TOO_MANY_REQUESTS)
            db.commit()
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="此 API Key 已达到调用次数上限")
        _record_api_key_event(db, request, api_key.id)
        db.commit()
        return user

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    if user.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已被管理员封禁")
    return user
