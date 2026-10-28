import os
import time
from typing import Any, Dict, Optional

import httpx
from app.services.provider_audit import record_provider_call


class XingchenError(Exception):
    """A readable error returned by the Xingchen Zhichuang API."""


BASE_URL = os.getenv("XINGCHEN_BASE_URL", "https://open.xingchenzhichuang.com/api").rstrip("/")


def _api_key() -> str:
    value = os.getenv("XINGCHEN_API_KEY", "").strip()
    if not value:
        raise XingchenError("数字人接口尚未配置 API Key，请先在服务器 .env.prod 中填写 XINGCHEN_API_KEY")
    return value


def _request(
    method: str,
    path: str,
    *,
    user_id: int | None = None,
    operation: str | None = None,
    reference_type: str | None = None,
    reference_id: int | str | None = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    started = time.perf_counter()
    status_code = None
    audit_operation = operation or path.strip("/").replace("/", "_")
    request_summary = {"parameter_names": sorted(kwargs.keys())}

    def audit(outcome: str, response_summary: dict | None = None, error_summary: str | None = None):
        record_provider_call(
            user_id=user_id,
            provider="xingchen",
            operation=audit_operation,
            method=method,
            endpoint=path,
            outcome=outcome,
            duration_ms=int((time.perf_counter() - started) * 1000),
            status_code=status_code,
            request_summary=request_summary,
            response_summary=response_summary,
            error_summary=error_summary,
            reference_type=reference_type,
            reference_id=reference_id,
        )

    headers = dict(kwargs.pop("headers", {}) or {})
    headers["apikey"] = _api_key()
    if "json" in kwargs:
        headers.setdefault("Content-Type", "application/json")

    try:
        response = httpx.request(
            method,
            f"{BASE_URL}/{path.lstrip('/')}",
            headers=headers,
            timeout=httpx.Timeout(30.0, connect=10.0),
            **kwargs,
        )
        status_code = response.status_code
        response.raise_for_status()
        payload = response.json()
    except httpx.HTTPError as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", status_code)
        audit("failed", error_summary=type(exc).__name__)
        raise XingchenError(f"数字人接口网络请求失败：{exc}") from exc
    except ValueError as exc:
        audit("failed", error_summary="invalid_json")
        raise XingchenError("数字人接口返回了无法解析的响应") from exc

    if payload.get("code") not in (None, 1, "1"):
        audit("failed", response_summary={"code": payload.get("code")}, error_summary="provider_error")
        raise XingchenError(payload.get("msg") or "数字人接口请求失败")
    data = payload.get("data")
    audit("completed", response_summary={"code": payload.get("code"), "data_type": type(data).__name__})
    return payload


def _multipart(fields: Dict[str, Any]) -> Dict[str, Any]:
    return {key: (None, str(value)) for key, value in fields.items()}


def list_models(page: int = 1, size: int = 50, *, user_id: int | None = None) -> Dict[str, Any]:
    return _request("POST", "/ai/modelList", user_id=user_id, operation="list_models", files=_multipart({"page": page, "size": size}))


def get_model(model_id: int, *, user_id: int | None = None, reference_id: int | str | None = None) -> Dict[str, Any]:
    return _request("POST", "/ai/modelDetail", user_id=user_id, operation="get_model", reference_type="digital_human_model", reference_id=reference_id, files=_multipart({"id": model_id}))


def train_model(*, name: str, video_url: str, callback_url: Optional[str] = None, user_id: int | None = None, reference_id: int | str | None = None) -> Dict[str, Any]:
    fields: Dict[str, Any] = {"name": name, "videoUrl": video_url}
    if callback_url:
        fields["callbackurl"] = callback_url
    return _request("POST", "/ai/model", user_id=user_id, operation="train_model", reference_type="digital_human_model", reference_id=reference_id, files=_multipart(fields))


def create_video(
    *,
    model_id: int,
    audio_url: str,
    video_name: Optional[str] = None,
    callback_url: Optional[str] = None,
    watermark_pos: Optional[str] = None,
    user_id: int | None = None,
    reference_id: int | str | None = None,
) -> Dict[str, Any]:
    body: Dict[str, Any] = {"modeid": model_id, "audioUrl": audio_url}
    if video_name:
        body["videoName"] = video_name
    if callback_url:
        body["callbackurl"] = callback_url
    if watermark_pos:
        body["watermark"] = {"pos": watermark_pos}
    return _request("POST", "/ai/video", user_id=user_id, operation="create_video", reference_type="digital_human_video", reference_id=reference_id, json=body)


def get_video(video_id: int, *, user_id: int | None = None, reference_id: int | str | None = None) -> Dict[str, Any]:
    return _request("POST", "/ai/videoDetail", user_id=user_id, operation="get_video", reference_type="digital_human_video", reference_id=reference_id, files=_multipart({"id": video_id}))
