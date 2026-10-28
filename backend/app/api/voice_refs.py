import os
import uuid
import subprocess
import tempfile
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from app.models import get_db
from app.models.voice_ref import VoiceReference
from app.models.user import User
from app.services.auth import get_current_user
from app.services.oss_backup import backup_file
import aiofiles

router = APIRouter()

STORAGE_PATH = os.getenv("STORAGE_PATH", "../storage")
VOICE_REFS_PATH = os.path.join(STORAGE_PATH, "voice_refs")


def _convert_uploaded_audio_to_wav(input_path: str, output_path: str, normalize_wav: bool = False) -> None:
    """Normalize uploaded voice references to mono WAV for runtime compatibility."""
    # A normal local reference can retain WAV as-is. FlowTTS clone samples must be
    # normalized to 16 kHz mono even when the upload already has a .wav suffix.
    if os.path.splitext(input_path)[1].lower() == ".wav" and not normalize_wav:
        shutil.copy2(input_path, output_path)
        return

    ffmpeg_executable = shutil.which("ffmpeg")
    if not ffmpeg_executable:
        try:
            import imageio_ffmpeg
            ffmpeg_executable = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception as exc:
            raise HTTPException(status_code=500, detail="音频转换组件不可用，请先安装 FFmpeg。") from exc

    command = [
        ffmpeg_executable,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        input_path,
        "-ac",
        "1",
        "-ar",
        "16000",
        output_path,
    ]
    try:
        subprocess.run(command, check=True)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail="音频转换组件不可用，请先安装 FFmpeg。") from exc
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=400, detail="Uploaded audio could not be converted to WAV.") from exc

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_voice_ref(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    os.makedirs(VOICE_REFS_PATH, exist_ok=True)
    unique_filename = f"{current_user.id}_{uuid.uuid4().hex}.wav"
    file_path = os.path.join(VOICE_REFS_PATH, unique_filename)

    temp_suffix = os.path.splitext(file.filename or "")[1] or ".bin"
    with tempfile.NamedTemporaryFile(delete=False, suffix=temp_suffix, dir=VOICE_REFS_PATH) as temp_input:
        temp_input_path = temp_input.name

    try:
        async with aiofiles.open(temp_input_path, "wb") as f:
            content = await file.read()
            await f.write(content)

        _convert_uploaded_audio_to_wav(temp_input_path, file_path)
    finally:
        if os.path.exists(temp_input_path):
            os.remove(temp_input_path)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail="Voice reference upload failed.")

    backup_file(file_path, f"voice_refs/{unique_filename}")

    voice_ref = VoiceReference(
        user_id=current_user.id,
        filename=unique_filename,
        original_name=file.filename,
        file_path=file_path,
        display_name=os.path.splitext(file.filename or "音频样本")[0],
        provider="local",
        clone_status="reference",
        is_clone=False,
        is_enabled=True,
        consent_confirmed=False,
    )
    db.add(voice_ref)
    db.commit()
    db.refresh(voice_ref)
    return {
        "id": voice_ref.id,
        "filename": voice_ref.filename,
        "original_name": voice_ref.original_name,
        "display_name": voice_ref.display_name or voice_ref.original_name,
        "is_clone": voice_ref.is_clone,
        "voice_id": voice_ref.provider_voice_id,
        "created_at": voice_ref.created_at,
    }

@router.get("/")
def list_voice_refs(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(VoiceReference).filter(
        VoiceReference.user_id == current_user.id,
        VoiceReference.is_enabled.is_(True),
    )
    if os.getenv("TTS_PROVIDER", "stub").strip().lower() == "tencent_flowtts":
        query = query.filter(VoiceReference.is_clone.is_(True), VoiceReference.provider == "tencent_flowtts")
    refs = query.order_by(VoiceReference.created_at.desc()).all()
    return [{
        "id": r.id,
        "filename": r.filename,
        "original_name": r.original_name,
        "display_name": r.display_name or r.original_name,
        "is_clone": r.is_clone,
        "voice_id": r.provider_voice_id,
        "created_at": r.created_at,
    } for r in refs]

@router.delete("/{voice_ref_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_voice_ref(
    voice_ref_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ref = db.query(VoiceReference).filter(VoiceReference.id == voice_ref_id, VoiceReference.user_id == current_user.id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Voice reference not found")
    if os.path.exists(ref.file_path):
        os.remove(ref.file_path)
    db.delete(ref)
    db.commit()
