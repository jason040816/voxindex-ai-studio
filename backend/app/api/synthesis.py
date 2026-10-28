import os
import uuid
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from app.models import get_db
from app.models.synthesis import SynthesisJob
from app.models.voice_ref import VoiceReference
from app.models.user import User
from app.services.auth import get_current_user
from app.services.tts import TTSServiceError, synthesize, warmup as tts_warmup
from app.services.oss_backup import backup_file
from app.services.credits import capture_reservation, operation_cost, refund_reservation, reserve_credits, text_generation_cost
from app.services.media_duration import audio_duration_seconds
from app.services.api_usage import update_api_key_usage

logger = logging.getLogger(__name__)

router = APIRouter()

STORAGE_PATH = os.getenv("STORAGE_PATH", "../storage")
OUTPUTS_PATH = os.path.join(STORAGE_PATH, "outputs")

# Tencent's public FlowTTS voices. These give the product a usable synthesis
# experience even before a customer has successfully created a private clone.
PRESET_VOICES = (
    {"id": "v-female-R2s4N9qJ", "name": "温柔姐姐", "description": "温暖、自然，适合品牌介绍", "gender": "女声"},
    {"id": "v-male-W1tH9jVc", "name": "自然男声", "description": "平稳、清晰，适合讲解与客服", "gender": "男声"},
    {"id": "female-kefu-xiaomei", "name": "客服小美", "description": "明快、专业，适合通知播报", "gender": "女声"},
    {"id": "v-male-Bk7vD3xP", "name": "威严男声", "description": "沉稳、有力量，适合宣传配音", "gender": "男声"},
)
PRESET_BY_ID = {voice["id"]: voice for voice in PRESET_VOICES}

def _normalize_text(text: str) -> str:
    cleaned = text.replace("/", " slash ").replace("\\", " slash ")
    return " ".join(cleaned.split())

class SynthesisRequest(BaseModel):
    voice_ref_id: int
    text: str
    audio_name: Optional[str] = Field(default=None, max_length=120)
    speed: float = 1.0
    volume: float = 1.0
    pitch: int = 0
    emo_voice_ref_id: Optional[int] = None
    emo_vector: Optional[list] = None  # 8-float emotion vector [happy, angry, sad, afraid, disgusted, melancholic, surprised, calm]
    emo_alpha: float = 1.0  # emotion strength: 0.0 to 1.0
    use_emo_text: bool = False  # enable emotion from emo_text
    emo_text: Optional[str] = None  # text describing desired emotion
    use_random: bool = False  # randomize generation aspects
    max_text_tokens_per_segment: int = 160  # larger chunks reduce pauses between segments
    interval_silence: int = 200  # silence between segments (ms)


@router.get("/voices")
def list_available_voices(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    clones = (
        db.query(VoiceReference)
        .filter(
            VoiceReference.user_id == current_user.id,
            VoiceReference.is_clone.is_(True),
            VoiceReference.is_enabled.is_(True),
            VoiceReference.provider == "tencent_flowtts",
        )
        .order_by(VoiceReference.created_at.desc())
        .all()
    )
    presets = []
    for voice in PRESET_VOICES:
        reference = _get_or_create_preset_reference(db, current_user.id, voice["id"])
        presets.append({**voice, "reference_id": reference.id})
    return {
        "presets": presets,
        "clones": [
            {"id": item.id, "name": item.display_name or item.original_name, "voice_id": item.provider_voice_id}
            for item in clones
        ],
    }


def _get_or_create_preset_reference(db: Session, user_id: int, voice_id: str) -> VoiceReference:
    preset = PRESET_BY_ID.get(voice_id)
    if not preset:
        raise HTTPException(status_code=400, detail="未识别的官方音色")
    stored_voice_id = f"preset__{user_id}__{voice_id}"
    existing = db.query(VoiceReference).filter(
        VoiceReference.user_id == user_id,
        VoiceReference.provider == "tencent_flowtts",
        VoiceReference.provider_voice_id == stored_voice_id,
        VoiceReference.is_clone.is_(False),
    ).first()
    if existing:
        return existing

    reference = VoiceReference(
        user_id=user_id,
        filename=f"preset_{voice_id}.wav",
        original_name=f"官方音色：{preset['name']}",
        file_path="",
        display_name=preset["name"],
        provider_voice_id=stored_voice_id,
        provider="tencent_flowtts",
        clone_status="preset",
        is_clone=False,
        is_enabled=True,
        consent_confirmed=False,
    )
    db.add(reference)
    db.commit()
    db.refresh(reference)
    return reference


def _upstream_voice_id(reference: VoiceReference) -> str:
    """Keep shared official IDs unique in our per-user database rows."""
    stored_id = reference.provider_voice_id or ""
    if stored_id.startswith("preset__"):
        return stored_id.rsplit("__", 1)[-1]
    return stored_id

@router.post("/", status_code=status.HTTP_201_CREATED)
def create_synthesis(
    req: SynthesisRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    logger.info(f"Synthesis request received: text='{req.text}' voice_ref_id={req.voice_ref_id}")
    logger.info(f"TTS_PROVIDER env={os.getenv('TTS_PROVIDER', 'NOT SET')}")
    
    cleaned_text = _normalize_text(req.text.strip())
    clean_audio_name = (req.audio_name or "").strip() or None
    if not cleaned_text:
        raise HTTPException(status_code=422, detail="Text must not be empty")
    if len(cleaned_text) > 2000:
        raise HTTPException(status_code=422, detail="Text length must be 2000 characters or fewer")
    if not 0.5 <= req.speed <= 2.0:
        raise HTTPException(status_code=422, detail="语速范围为 0.5 到 2.0")
    if not 0 < req.volume <= 1.0:
        raise HTTPException(status_code=422, detail="音量范围为 0 到 1.0")
    if not -12 <= req.pitch <= 12:
        raise HTTPException(status_code=422, detail="音调范围为 -12 到 12")
    if current_user.synthesis_limit > 0:
        used = db.query(SynthesisJob).filter(SynthesisJob.user_id == current_user.id).count()
        if used >= current_user.synthesis_limit:
            raise HTTPException(status_code=403, detail="已达到音频生成数量上限")

    voice_ref = db.query(VoiceReference).filter(
        VoiceReference.id == req.voice_ref_id,
        VoiceReference.user_id == current_user.id,
    ).first()
    if not voice_ref:
        raise HTTPException(status_code=404, detail="Voice reference not found")
    if not voice_ref.is_enabled:
        raise HTTPException(status_code=400, detail="该音色已被停用")
    if os.getenv("TTS_PROVIDER", "stub").strip().lower() == "tencent_flowtts":
        if voice_ref.provider != "tencent_flowtts" or not voice_ref.provider_voice_id:
            raise HTTPException(status_code=400, detail="请选择官方音色或已创建的声音克隆")

    emo_voice_ref = None
    if req.emo_voice_ref_id is not None:
        emo_voice_ref = db.query(VoiceReference).filter(
            VoiceReference.id == req.emo_voice_ref_id,
            VoiceReference.user_id == current_user.id,
        ).first()
        if not emo_voice_ref:
            raise HTTPException(status_code=404, detail="Emotion reference not found")

    output_filename = f"{current_user.id}_{uuid.uuid4().hex}_output.wav"
    output_path = os.path.join(OUTPUTS_PATH, output_filename)
    os.makedirs(OUTPUTS_PATH, exist_ok=True)

    job = SynthesisJob(
        user_id=current_user.id,
        voice_ref_id=voice_ref.id,
        audio_name=clean_audio_name,
        input_text=cleaned_text,
        output_filename=output_filename,
        output_path=output_path,
        status="pending",
    )
    db.add(job)
    db.flush()
    credit_cost = text_generation_cost(len(cleaned_text), operation_cost(db, "audio_generation"))
    credit_transaction = reserve_credits(
        db,
        user=current_user,
        amount=credit_cost,
        operation="audio_generation",
        reference_type="synthesis",
        reference_id=job.id,
    )
    db.commit()
    db.refresh(job)

    error_message = None
    try:
        logger.info(f"Calling synthesize with voice_ref={voice_ref.file_path}, emo_alpha={req.emo_alpha}, use_random={req.use_random}")
        synthesize(
            cleaned_text,
            voice_ref.file_path,
            output_path,
            provider_voice_id=_upstream_voice_id(voice_ref),
            emo_audio_prompt=emo_voice_ref.file_path if emo_voice_ref else None,
            emo_vector=req.emo_vector,
            emo_alpha=req.emo_alpha,
            use_emo_text=req.use_emo_text,
            emo_text=req.emo_text,
            use_random=req.use_random,
            max_text_tokens_per_segment=req.max_text_tokens_per_segment,
            interval_silence=req.interval_silence,
            speed=req.speed,
            volume=req.volume,
            pitch=req.pitch,
            user_id=current_user.id,
            reference_id=job.id,
        )

        logger.info(f"Synthesis succeeded, status=completed")
        job.status = "completed"
        try:
            job.duration_seconds = audio_duration_seconds(output_path)
        except ValueError:
            logger.warning("Could not determine synthesized audio duration: %s", output_path)
        capture_reservation(db, credit_transaction)
        backup_file(output_path, f"outputs/{output_filename}")
    except TTSServiceError as exc:
        logger.error(f"TTSServiceError: {exc}")
        error_message = str(exc)
        job.status = "failed"
        refund_reservation(db, credit_transaction, error_message)
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        error_message = "Unexpected synthesis error"
        job.status = "failed"
        refund_reservation(db, credit_transaction, error_message)

    update_api_key_usage(
        db,
        request,
        outcome="completed" if job.status == "completed" else "failed",
        characters=len(cleaned_text),
        credits_used=credit_cost if job.status == "completed" else 0,
    )
    db.commit()
    db.refresh(job)

    return {
        "id": job.id,
        "status": job.status,
        "output_filename": job.output_filename,
        "audio_name": job.audio_name,
        "input_text": job.input_text,
        "created_at": job.created_at,
        "error_message": error_message,
    }


@router.post("/warmup")
def warmup_synthesis_engine():
    """Load the TTS engine and its model weights without synthesizing audio."""
    try:
        tts_warmup()
        return {"status": "ok", "message": "IndexTTS2 warmup completed"}
    except TTSServiceError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

@router.get("/")
def list_synthesis_jobs(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    jobs = db.query(SynthesisJob).filter(SynthesisJob.user_id == current_user.id).order_by(SynthesisJob.created_at.desc()).all()
    updated = False
    for job in jobs:
        if job.status == "completed" and not job.duration_seconds and job.output_path and os.path.isfile(job.output_path):
            try:
                job.duration_seconds = audio_duration_seconds(job.output_path)
                updated = True
            except ValueError:
                pass
    if updated:
        db.commit()
    return [
        {
            "id": j.id,
            "status": j.status,
            "output_filename": j.output_filename,
            "audio_name": j.audio_name,
            "input_text": j.input_text,
            "voice_ref_id": j.voice_ref_id,
            "created_at": j.created_at,
            "duration_seconds": j.duration_seconds,
        }
        for j in jobs
    ]


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_synthesis_job(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(SynthesisJob).filter(
        SynthesisJob.id == job_id,
        SynthesisJob.user_id == current_user.id,
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="未找到这条历史记录")

    # Only remove the file recorded for this user's job; a missing file should
    # not prevent the database record from being removed.
    if job.output_path and os.path.isfile(job.output_path):
        try:
            os.remove(job.output_path)
        except OSError:
            logger.warning("Unable to remove synthesis output: %s", job.output_path)
    db.delete(job)
    db.commit()
    return None

@router.get("/{job_id}/audio")
def get_audio(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(SynthesisJob).filter(SynthesisJob.id == job_id, SynthesisJob.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Synthesis job not found")
    if job.status != "completed" or not job.output_path or not os.path.exists(job.output_path):
        raise HTTPException(status_code=404, detail="Audio not available")
    return FileResponse(job.output_path, media_type="audio/wav", filename=job.output_filename)
