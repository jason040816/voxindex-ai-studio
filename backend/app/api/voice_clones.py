import os
import uuid
import tempfile
import wave
from typing import Optional

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.api.voice_refs import VOICE_REFS_PATH, _convert_uploaded_audio_to_wav
from app.models import get_db
from app.models.user import User
from app.models.voice_ref import VoiceReference
from app.services.auth import get_current_user
from app.services.oss_backup import backup_file
from app.services.credits import capture_reservation, operation_cost, refund_reservation, reserve_credits
from app.services.api_usage import update_api_key_usage

router = APIRouter()
MIN_CLONE_AUDIO_SECONDS = 15


def _wav_duration_seconds(path: str) -> float:
    try:
        with wave.open(path, "rb") as audio:
            frame_rate = audio.getframerate()
            return audio.getnframes() / frame_rate if frame_rate else 0
    except (wave.Error, OSError) as exc:
        raise HTTPException(status_code=400, detail="无法读取音频时长，请更换 WAV、MP3 或 M4A 文件。") from exc


def serialize_clone(item: VoiceReference, include_owner: bool = False):
    payload = {
        "id": item.id,
        "name": item.display_name or item.original_name,
        "filename": item.filename,
        "original_name": item.original_name,
        "sample_text": item.sample_text or "",
        "voice_id": item.provider_voice_id,
        "provider": item.provider,
        "status": item.clone_status,
        "is_enabled": item.is_enabled,
        "created_at": item.created_at,
    }
    if include_owner:
        payload["user_id"] = item.user_id
    return payload


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_voice_clone(
    request: Request,
    name: str = Form(...),
    sample_text: str = Form(""),
    consent: bool = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    clean_name = name.strip()
    if not clean_name:
        raise HTTPException(status_code=422, detail="请输入音色名称")
    if len(clean_name) > 80:
        raise HTTPException(status_code=422, detail="音色名称不能超过 80 个字符")
    if not consent:
        raise HTTPException(status_code=422, detail="请确认你拥有该声音样本的授权")
    if not file.filename:
        raise HTTPException(status_code=422, detail="请选择音频文件")
    if current_user.voice_clone_limit > 0:
        used = db.query(VoiceReference).filter(
            VoiceReference.user_id == current_user.id,
            VoiceReference.is_clone.is_(True),
        ).count()
        if used >= current_user.voice_clone_limit:
            raise HTTPException(status_code=403, detail="已达到声音克隆数量上限")

    os.makedirs(VOICE_REFS_PATH, exist_ok=True)
    unique_filename = f"{current_user.id}_{uuid.uuid4().hex}.wav"
    file_path = os.path.join(VOICE_REFS_PATH, unique_filename)
    suffix = os.path.splitext(file.filename)[1] or ".bin"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=VOICE_REFS_PATH) as temp_file:
        temp_path = temp_file.name

    try:
        async with aiofiles.open(temp_path, "wb") as output:
            content = await file.read()
            if len(content) > 30 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="音频文件不能超过 30MB")
            await output.write(content)
        _convert_uploaded_audio_to_wav(temp_path, file_path, normalize_wav=True)
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

    duration = _wav_duration_seconds(file_path)
    if duration < MIN_CLONE_AUDIO_SECONDS:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(
            status_code=422,
            detail=f"声音样本至少需要 {MIN_CLONE_AUDIO_SECONDS} 秒，当前约 {duration:.1f} 秒。",
        )

    try:
        credit_cost = operation_cost(db, "voice_clone")
        clone_reference_id = uuid.uuid4().hex
        credit_transaction = reserve_credits(
            db,
            user=current_user,
            amount=credit_cost,
            operation="voice_clone",
            reference_type="voice_clone",
            reference_id=clone_reference_id,
        )
    except Exception:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise

    backup_file(file_path, f"voice_refs/{unique_filename}")
    db.commit()

    provider = os.getenv("TTS_PROVIDER", "stub").strip().lower()
    provider_voice_id = None
    if provider == "tencent_flowtts":
        from app.services.tencent_flowtts import clone_voice
        # Tencent's VoiceName only accepts letters, numbers, and underscores.
        # Keep the customer's Chinese display name locally, but use a unique
        # provider-safe name for the upstream request.
        provider_voice_name = f"daxi_{current_user.id}_{uuid.uuid4().hex[:20]}"
        try:
            provider_voice_id = clone_voice(provider_voice_name, file_path, sample_text.strip() or None, user_id=current_user.id, reference_id=clone_reference_id)
        except Exception as exc:
            refund_reservation(db, credit_transaction, str(exc))
            update_api_key_usage(db, request, outcome="failed")
            db.commit()
            if os.path.exists(file_path):
                os.remove(file_path)
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    clone = VoiceReference(
        user_id=current_user.id,
        filename=unique_filename,
        original_name=file.filename,
        file_path=file_path,
        display_name=clean_name,
        sample_text=sample_text.strip(),
        provider="tencent_flowtts" if provider == "tencent_flowtts" else "local",
        clone_status="ready",
        is_clone=True,
        is_enabled=True,
        consent_confirmed=True,
    )
    db.add(clone)
    db.flush()
    clone.provider_voice_id = provider_voice_id or f"daxi_clone_{clone.id:06d}"
    update_api_key_usage(db, request, outcome="completed", credits_used=credit_cost)
    capture_reservation(db, credit_transaction)
    db.commit()
    db.refresh(clone)
    return serialize_clone(clone)


@router.get("/")
def list_voice_clones(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    clones = (
        db.query(VoiceReference)
        .filter(
            VoiceReference.user_id == current_user.id,
            VoiceReference.is_clone.is_(True),
            VoiceReference.is_enabled.is_(True),
            VoiceReference.clone_status != "archived",
        )
        .order_by(VoiceReference.created_at.desc())
        .all()
    )
    return [serialize_clone(item) for item in clones]


@router.patch("/{clone_id}")
def update_voice_clone(
    clone_id: int,
    name: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    clone = db.query(VoiceReference).filter(
        VoiceReference.id == clone_id,
        VoiceReference.user_id == current_user.id,
        VoiceReference.is_clone.is_(True),
    ).first()
    if not clone:
        raise HTTPException(status_code=404, detail="未找到该音色")
    if name is not None:
        clean_name = name.strip()
        if not clean_name:
            raise HTTPException(status_code=422, detail="请输入音色名称")
        clone.display_name = clean_name[:80]
    db.commit()
    db.refresh(clone)
    return serialize_clone(clone)


@router.delete("/{clone_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_voice_clone(
    clone_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    clone = db.query(VoiceReference).filter(
        VoiceReference.id == clone_id,
        VoiceReference.user_id == current_user.id,
        VoiceReference.is_clone.is_(True),
    ).first()
    if not clone:
        raise HTTPException(status_code=404, detail="未找到该音色")
    clone.is_enabled = False
    clone.clone_status = "archived"
    db.commit()
    return None
