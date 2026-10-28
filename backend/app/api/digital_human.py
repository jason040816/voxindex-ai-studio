import hmac
import os
import uuid
from typing import Any, Dict, Optional

import aiofiles
import httpx
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.models import get_db
from app.models.digital_human import DigitalHumanVideo
from app.models.digital_human_model import DigitalHumanModel
from app.models.synthesis import SynthesisJob
from app.models.user import User
from app.services.auth import get_current_user
from app.services.xingchen import XingchenError, create_video, get_model, get_video, list_models, train_model
from app.services.credits import (
    VIDEO_INCLUDED_SECONDS, capture_reservation, operation_cost, refund_reservation,
    reserve_credits, settle_reference, video_cost_breakdown,
)
from app.services.media_duration import audio_duration_seconds

router = APIRouter()

STORAGE_PATH = os.getenv("STORAGE_PATH", "../storage")
DIGITAL_HUMAN_PATH = os.path.join(STORAGE_PATH, "digital_human")
DIGITAL_HUMAN_INPUT_PATH = os.path.join(STORAGE_PATH, "digital_human_inputs")
MAX_TRAINING_VIDEO_BYTES = 1024 * 1024 * 1024
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov"}


class CreateDigitalHumanVideoRequest(BaseModel):
    synthesis_job_id: int
    model_id: int
    video_name: Optional[str] = Field(default=None, max_length=120)
    watermark_pos: Optional[str] = Field(default=None, pattern="^(top-left|top-right|bottom-left|bottom-right)$")


def _public_base_url() -> str:
    return (
        os.getenv("DIGITAL_HUMAN_PUBLIC_BASE_URL")
        or os.getenv("FRONTEND_APP_URL")
        or ""
    ).strip().rstrip("/")


def _callback_url() -> Optional[str]:
    configured = os.getenv("DIGITAL_HUMAN_CALLBACK_URL", "").strip()
    if configured:
        return configured
    base = _public_base_url()
    return f"{base}/api/digital-human/callback" if base else None


def _audio_url(job: SynthesisJob) -> str:
    base = _public_base_url()
    if not base:
        raise HTTPException(status_code=503, detail="请先配置 FRONTEND_APP_URL，数字人服务需要公网访问语音文件")
    return f"{base}/static/outputs/{job.output_filename}"


def _status_from_upstream(value: Any) -> str:
    try:
        code = int(value)
    except (TypeError, ValueError):
        return "pending"
    return {3: "completed", 4: "failed", 2: "processing", 1: "pending", -1: "pending"}.get(code, "pending")


def _model_payload(item: DigitalHumanModel) -> Dict[str, Any]:
    return {
        "id": item.remote_model_id or item.id,
        "local_id": item.id,
        "name": item.name,
        "status": item.status,
        "cover_url": item.cover_url,
        "fail_reason": item.fail_reason,
        "included_seconds_total": item.included_seconds_total,
        "included_seconds_remaining": item.included_seconds_remaining,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def _sync_model(item: DigitalHumanModel, db: Session) -> None:
    if not item.remote_model_id or item.status in {2, 3, 4}:
        return
    try:
        payload = get_model(item.remote_model_id, user_id=item.user_id, reference_id=item.id)
    except XingchenError:
        return
    data = payload.get("data") or {}
    try:
        item.status = int(data.get("status", item.status))
    except (TypeError, ValueError):
        pass
    item.name = data.get("name") or item.name
    item.cover_url = data.get("coverUrl") or item.cover_url
    item.fail_reason = data.get("failreason") or item.fail_reason
    if item.status == 2:
        settle_reference(db, "digital_human_model", item.id, True)
    elif item.status in {3, 4}:
        settle_reference(db, "digital_human_model", item.id, False, item.fail_reason or "数字人模型训练失败")
    db.commit()
    db.refresh(item)


def _video_payload(item: DigitalHumanVideo) -> Dict[str, Any]:
    base = _public_base_url()
    local_url = None
    if item.local_video_filename and base:
        local_url = f"{base}/static/digital_human/{item.local_video_filename}"
    return {
        "id": item.id,
        "model_id": item.model_id,
        "synthesis_job_id": item.synthesis_job_id,
        "video_name": item.video_name,
        "status": item.status,
        "video_url": local_url or item.remote_video_url,
        "cover_url": item.cover_url,
        "fail_reason": item.fail_reason,
        "duration_seconds": item.duration_seconds,
        "included_seconds_used": item.included_seconds_used,
        "billed_seconds": item.billed_seconds,
        "charged_credits": item.charged_credits,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def _download_result(item: DigitalHumanVideo) -> None:
    if item.local_video_filename or not item.remote_video_url:
        return
    os.makedirs(DIGITAL_HUMAN_PATH, exist_ok=True)
    filename = f"{item.user_id}_{item.remote_video_id or uuid.uuid4().hex}.mp4"
    path = os.path.join(DIGITAL_HUMAN_PATH, filename)
    try:
        with httpx.stream("GET", item.remote_video_url, timeout=httpx.Timeout(180.0, connect=15.0), follow_redirects=True) as response:
            response.raise_for_status()
            with open(path, "wb") as output:
                for chunk in response.iter_bytes():
                    output.write(chunk)
    except (httpx.HTTPError, OSError):
        return
    item.local_video_filename = filename


def _settle_video_billing(item: DigitalHumanVideo, db: Session, succeeded: bool) -> None:
    reason = item.fail_reason or "数字人视频生成失败"
    if item.billing_status == "legacy":
        settle_reference(db, "digital_human_video", item.id, succeeded, reason)
        return
    if item.billing_status != "reserved":
        return
    final_status = "completed" if succeeded else "refunded"
    # Conditional update makes duplicate callbacks/polls harmless, including
    # when a zero-credit video has no CreditTransaction to settle.
    changed = db.query(DigitalHumanVideo).filter(
        DigitalHumanVideo.id == item.id,
        DigitalHumanVideo.billing_status == "reserved",
    ).update({DigitalHumanVideo.billing_status: final_status}, synchronize_session=False)
    if not changed:
        return
    item.billing_status = final_status
    if succeeded:
        settle_reference(db, "digital_human_video", item.id, True)
    else:
        model = db.query(DigitalHumanModel).filter(
            DigitalHumanModel.user_id == item.user_id,
            DigitalHumanModel.remote_model_id == item.model_id,
        ).with_for_update().first()
        if model:
            model.included_seconds_remaining = min(
                model.included_seconds_total,
                model.included_seconds_remaining + item.included_seconds_used,
            )
        settle_reference(db, "digital_human_video", item.id, False, reason)


def _apply_video_status(item: DigitalHumanVideo, db: Session, data: Dict[str, Any]) -> None:
    upstream_status = _status_from_upstream(data.get("synthesisStatus"))
    # A late provider update must not reverse an already settled result.
    if item.status not in {"completed", "failed"} or item.status == upstream_status:
        item.status = upstream_status
    item.remote_video_url = data.get("videoUrl") or item.remote_video_url
    item.cover_url = data.get("coverUrl") or item.cover_url
    item.fail_reason = data.get("failreason") or item.fail_reason
    if item.status == "completed":
        _download_result(item)
        _settle_video_billing(item, db, True)
    elif item.status == "failed":
        _settle_video_billing(item, db, False)


def _sync_video(item: DigitalHumanVideo, db: Session) -> None:
    if not item.remote_video_id or item.status == "failed":
        return
    # A completion callback can arrive without a videoUrl. Keep polling the
    # provider in that case so the URL can still be recovered from videoDetail.
    if item.status == "completed" and (item.remote_video_url or item.local_video_filename) and item.billing_status != "reserved":
        return
    try:
        payload = get_video(item.remote_video_id, user_id=item.user_id, reference_id=item.id)
    except XingchenError:
        return
    data = payload.get("data") or {}
    _apply_video_status(item, db, data)
    db.commit()
    db.refresh(item)


@router.get("/models")
def get_digital_human_models(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = db.query(DigitalHumanModel).filter(
        DigitalHumanModel.user_id == current_user.id,
    ).order_by(DigitalHumanModel.created_at.desc()).all()
    for item in items:
        _sync_model(item, db)
    return {"models": [_model_payload(item) for item in items]}


@router.post("/models/train", status_code=status.HTTP_201_CREATED)
async def train_digital_human_model(
    name: str = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    clean_name = name.strip()
    if not clean_name:
        raise HTTPException(status_code=422, detail="请输入数字人模型名称")
    if len(clean_name) > 80:
        raise HTTPException(status_code=422, detail="模型名称不能超过 80 个字符")
    if current_user.digital_human_model_limit > 0:
        used = db.query(DigitalHumanModel).filter(DigitalHumanModel.user_id == current_user.id).count()
        if used >= current_user.digital_human_model_limit:
            raise HTTPException(status_code=403, detail="已达到数字人模型数量上限")

    suffix = os.path.splitext(file.filename or "")[1].lower()
    if suffix not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(status_code=422, detail="训练视频只支持 MP4 或 MOV 格式")

    base = _public_base_url()
    if not base:
        raise HTTPException(status_code=503, detail="请先配置 DIGITAL_HUMAN_PUBLIC_BASE_URL")

    os.makedirs(DIGITAL_HUMAN_INPUT_PATH, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{suffix}"
    file_path = os.path.join(DIGITAL_HUMAN_INPUT_PATH, filename)
    total = 0
    try:
        async with aiofiles.open(file_path, "wb") as output:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_TRAINING_VIDEO_BYTES:
                    raise HTTPException(status_code=413, detail="训练视频不能超过 1GB")
                await output.write(chunk)
    except HTTPException:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise
    except OSError as exc:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail="训练视频保存失败") from exc

    video_url = f"{base}/static/digital_human_inputs/{filename}"
    model = DigitalHumanModel(
        user_id=current_user.id,
        remote_model_id=None,
        name=clean_name,
        status=0,
        included_seconds_total=VIDEO_INCLUDED_SECONDS,
        included_seconds_remaining=VIDEO_INCLUDED_SECONDS,
    )
    db.add(model)
    db.flush()
    try:
        credit_transaction = reserve_credits(
            db,
            user=current_user,
            amount=operation_cost(db, "digital_human_model"),
            operation="digital_human_model",
            reference_type="digital_human_model",
            reference_id=model.id,
        )
        db.commit()
    except Exception:
        db.rollback()
        if os.path.exists(file_path):
            os.remove(file_path)
        raise

    try:
        response = train_model(name=clean_name, video_url=video_url, callback_url=_callback_url(), user_id=current_user.id, reference_id=model.id)
    except XingchenError as exc:
        refund_reservation(db, credit_transaction, str(exc))
        db.delete(model)
        db.commit()
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    remote_model_id = (response.get("data") or {}).get("id")
    if remote_model_id is None:
        refund_reservation(db, credit_transaction, "数字人接口没有返回模型任务 ID")
        db.delete(model)
        db.commit()
        raise HTTPException(status_code=502, detail="数字人接口没有返回模型任务 ID")
    model.remote_model_id = int(remote_model_id)
    model.status = int((response.get("data") or {}).get("status") or 0)
    if model.status == 2:
        capture_reservation(db, credit_transaction)
    elif model.status in {3, 4}:
        refund_reservation(db, credit_transaction, "数字人模型训练失败")
    db.commit()
    db.refresh(model)
    return {
        "model_id": model.remote_model_id,
        "message": response.get("msg") or "训练任务已提交",
    }


@router.delete("/models/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_digital_human_model(
    model_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    model = db.query(DigitalHumanModel).filter(
        DigitalHumanModel.user_id == current_user.id,
        DigitalHumanModel.remote_model_id == model_id,
    ).first()
    if not model:
        raise HTTPException(status_code=404, detail="未找到该数字人模型")
    pending_video = db.query(DigitalHumanVideo.id).filter(
        DigitalHumanVideo.user_id == current_user.id,
        DigitalHumanVideo.model_id == model_id,
        DigitalHumanVideo.status.in_(["pending", "processing"]),
    ).first()
    if pending_video:
        raise HTTPException(status_code=409, detail="该模型还有生成中的视频，请完成后再删除")
    if model.status not in {2, 3, 4}:
        raise HTTPException(status_code=409, detail="模型训练尚未结束，请稍后再删除")
    db.delete(model)
    db.commit()
    return None


@router.post("/videos", status_code=status.HTTP_201_CREATED)
def create_digital_human_video(
    req: CreateDigitalHumanVideoRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.digital_human_video_limit > 0:
        used = db.query(DigitalHumanVideo).filter(DigitalHumanVideo.user_id == current_user.id).count()
        if used >= current_user.digital_human_video_limit:
            raise HTTPException(status_code=403, detail="已达到数字人视频生成数量上限")
    job = db.query(SynthesisJob).filter(
        SynthesisJob.id == req.synthesis_job_id,
        SynthesisJob.user_id == current_user.id,
    ).first()
    if not job or job.status != "completed" or not job.output_filename or not job.output_path or not os.path.isfile(job.output_path):
        raise HTTPException(status_code=400, detail="请选择一条已完成且可访问的语音合成记录")

    owned_model = db.query(DigitalHumanModel).filter(
        DigitalHumanModel.user_id == current_user.id,
        DigitalHumanModel.remote_model_id == req.model_id,
    ).first()
    if not owned_model:
        raise HTTPException(status_code=404, detail="未找到你的数字人模型")
    try:
        duration_seconds = audio_duration_seconds(job.output_path)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        model = get_model(req.model_id, user_id=current_user.id, reference_id=owned_model.id).get("data") or {}
    except XingchenError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if int(model.get("status") or 0) != 2:
        raise HTTPException(status_code=400, detail="该数字人模型还没有训练成功，请换一个模型")

    audio_url = _audio_url(job)
    owned_model = db.query(DigitalHumanModel).filter(
        DigitalHumanModel.id == owned_model.id,
    ).with_for_update().first()
    included, billed, credit_cost = video_cost_breakdown(
        duration_seconds,
        owned_model.included_seconds_remaining,
        operation_cost(db, "digital_human_video"),
    )
    item = DigitalHumanVideo(
        user_id=current_user.id,
        synthesis_job_id=job.id,
        model_id=req.model_id,
        video_name=(req.video_name or "").strip() or None,
        audio_url=audio_url,
        status="pending",
        duration_seconds=duration_seconds,
        included_seconds_used=included,
        billed_seconds=billed,
        charged_credits=credit_cost,
        billing_status="reserved",
    )
    db.add(item)
    db.flush()
    try:
        reserve_credits(
            db, user=current_user, amount=credit_cost,
            operation="digital_human_video", reference_type="digital_human_video",
            reference_id=item.id,
        )
        owned_model.included_seconds_remaining -= included
        db.commit()
    except Exception:
        db.rollback()
        raise
    try:
        response = create_video(
            model_id=req.model_id,
            audio_url=audio_url,
            video_name=item.video_name,
            callback_url=_callback_url(),
            watermark_pos=req.watermark_pos,
            user_id=current_user.id,
            reference_id=item.id,
        )
        remote_id = (response.get("data") or {}).get("videoId")
        if remote_id is None:
            raise XingchenError("数字人接口没有返回视频任务 ID")
        remote_id = int(remote_id)
    except XingchenError as exc:
        item.status = "failed"
        item.fail_reason = str(exc)
        _settle_video_billing(item, db, False)
        db.commit()
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        item.status = "failed"
        item.fail_reason = "数字人接口请求失败"
        _settle_video_billing(item, db, False)
        db.commit()
        raise HTTPException(status_code=502, detail=item.fail_reason) from exc
    item.remote_video_id = remote_id
    item.status = "pending"
    db.commit()
    db.refresh(item)
    return _video_payload(item)


@router.get("/videos")
def list_digital_human_videos(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = db.query(DigitalHumanVideo).filter(
        DigitalHumanVideo.user_id == current_user.id,
    ).order_by(DigitalHumanVideo.created_at.desc()).all()
    for item in items:
        _sync_video(item, db)
    return [_video_payload(item) for item in items]


@router.get("/videos/{video_id}")
def get_digital_human_video(
    video_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(DigitalHumanVideo).filter(
        DigitalHumanVideo.id == video_id,
        DigitalHumanVideo.user_id == current_user.id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="未找到数字人视频任务")
    _sync_video(item, db)
    return _video_payload(item)


@router.post("/callback")
def digital_human_callback(
    payload: Dict[str, Any],
    apikey: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    configured_key = os.getenv("XINGCHEN_API_KEY", "").strip()
    data = payload.get("data") or {}
    documented_video_callback = (
        payload.get("callbackType") == "clone"
        and payload.get("taskType") == "video-synthesis"
    )
    # The documented video callback is a JSON POST and does not specify an
    # apikey header. Do not reuse the outbound API credential as callback auth.
    if (
        configured_key
        and not documented_video_callback
        and not hmac.compare_digest(apikey or "", configured_key)
    ):
        raise HTTPException(status_code=401, detail="invalid callback key")

    video_id = data.get("videoId") or (data.get("id") if documented_video_callback else None)
    if video_id is not None:
        item = db.query(DigitalHumanVideo).filter(DigitalHumanVideo.remote_video_id == int(video_id)).first()
        if not item:
            return {"ok": True}
        if documented_video_callback:
            # This callback format has no signature/header. Never change
            # credits based solely on an unauthenticated POST body.
            try:
                data = (get_video(item.remote_video_id, user_id=item.user_id, reference_id=item.id).get("data") or {})
            except XingchenError:
                # Normal polling will reconcile the task later.
                return {"ok": True}
        _apply_video_status(item, db, data)
        db.commit()
        return {"ok": True}

    remote_model_id = data.get("id") or payload.get("id")
    if remote_model_id is None:
        return {"ok": True}
    model = db.query(DigitalHumanModel).filter(DigitalHumanModel.remote_model_id == int(remote_model_id)).first()
    if not model:
        # Older video callbacks may expose their identifier as `id` instead of `videoId`.
        item = db.query(DigitalHumanVideo).filter(DigitalHumanVideo.remote_video_id == int(remote_model_id)).first()
        if not item:
            return {"ok": True}
        _apply_video_status(item, db, data)
        db.commit()
        return {"ok": True}
    try:
        model.status = int(data.get("status", model.status))
    except (TypeError, ValueError):
        pass
    model.cover_url = data.get("coverUrl") or model.cover_url
    model.fail_reason = data.get("failreason") or model.fail_reason
    if model.status == 2:
        settle_reference(db, "digital_human_model", model.id, True)
    elif model.status in {3, 4}:
        settle_reference(db, "digital_human_model", model.id, False, model.fail_reason or "数字人模型训练失败")
    db.commit()
    return {"ok": True}
