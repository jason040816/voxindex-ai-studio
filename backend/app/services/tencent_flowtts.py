import base64
import json
import logging
import os
import time
from typing import Optional

from app.services.tts import TTSServiceError
from app.services.provider_audit import record_provider_call

logger = logging.getLogger(__name__)

TENCENT_ENDPOINT = "trtc.tencentcloudapi.com"
TENCENT_REGION = "ap-beijing"
TENCENT_MODEL = "flow_01_ex"


def _ensure_integration_enabled():
    from app.models import SessionLocal
    from app.models.api_access import IntegrationSetting

    try:
        with SessionLocal() as db:
            setting = db.query(IntegrationSetting).filter(
                IntegrationSetting.name == "tencent_flowtts_enabled"
            ).first()
            if setting and setting.value.lower() != "true":
                raise TTSServiceError("腾讯云声音服务已由管理员停用。")
    except TTSServiceError:
        raise
    except Exception as exc:
        logger.exception("Unable to read Tencent integration status")
        raise TTSServiceError("无法读取腾讯云声音服务状态，请稍后再试。") from exc


def _load_client():
    _ensure_integration_enabled()
    secret_id = os.getenv("TENCENTCLOUD_SECRET_ID", "").strip()
    secret_key = os.getenv("TENCENTCLOUD_SECRET_KEY", "").strip()
    token = os.getenv("TENCENTCLOUD_TOKEN", "").strip()
    if not secret_id or not secret_key:
        raise TTSServiceError("腾讯云密钥未配置，请检查后端 .env 文件。")

    try:
        from tencentcloud.common import credential
        from tencentcloud.common.profile.client_profile import ClientProfile
        from tencentcloud.common.profile.http_profile import HttpProfile
        from tencentcloud.trtc.v20190722 import trtc_client
    except ImportError as exc:
        raise TTSServiceError("腾讯云 SDK 未安装。") from exc

    http_profile = HttpProfile()
    http_profile.endpoint = os.getenv("TENCENTCLOUD_ENDPOINT", TENCENT_ENDPOINT).strip() or TENCENT_ENDPOINT
    http_profile.reqTimeout = 120
    # Some Windows/Python runtimes close the SDK's background pre-connection
    # during TLS negotiation, producing ClientNetworkError before VoiceClone
    # reaches Tencent. A regular HTTPS request is more reliable here.
    http_profile.keepAlive = False
    http_profile.pre_conn_pool_size = 0

    profile = ClientProfile()
    profile.httpProfile = http_profile
    region = os.getenv("TENCENTCLOUD_REGION", TENCENT_REGION).strip() or TENCENT_REGION
    # The optional token supports Tencent Cloud temporary credentials. Permanent
    # CAM access keys leave it empty.
    return trtc_client.TrtcClient(credential.Credential(secret_id, secret_key, token), region, profile)


def _sdk_app_id() -> int:
    raw_value = os.getenv("TENCENTCLOUD_SDK_APP_ID", "").strip()
    try:
        return int(raw_value)
    except (TypeError, ValueError) as exc:
        raise TTSServiceError("腾讯云 SDKAppID 未配置或格式不正确。") from exc


def clone_voice(voice_name: str, prompt_audio_path: str, prompt_text: Optional[str] = None, *, user_id: int | None = None, reference_id: int | str | None = None) -> str:
    """Create a Tencent FlowTTS clone and return Tencent's real VoiceId."""
    try:
        from tencentcloud.trtc.v20190722 import models
        from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
    except ImportError as exc:
        raise TTSServiceError("腾讯云 SDK 未安装。") from exc

    with open(prompt_audio_path, "rb") as prompt_file:
        prompt_audio = base64.b64encode(prompt_file.read()).decode("utf-8")

    params = {
        "Model": os.getenv("TENCENTCLOUD_MODEL", TENCENT_MODEL).strip() or TENCENT_MODEL,
        "SdkAppId": _sdk_app_id(),
        "VoiceName": voice_name,
        "PromptAudio": prompt_audio,
    }
    if prompt_text:
        params["PromptText"] = prompt_text

    request = models.VoiceCloneRequest()
    request.from_json_string(json.dumps(params))
    started = time.perf_counter()
    try:
        response = _load_client().VoiceClone(request)
    except TencentCloudSDKException as exc:
        request_id = exc.get_request_id() or "未返回"
        logger.warning("Tencent VoiceClone failed: code=%s request_id=%s", exc.get_code(), request_id)
        record_provider_call(user_id=user_id, provider="tencent_flowtts", operation="voice_clone", method="SDK", endpoint="VoiceClone", outcome="failed", duration_ms=int((time.perf_counter() - started) * 1000), request_summary={"voice_name": voice_name}, error_summary=str(exc.get_code()), reference_type="voice_clone", reference_id=reference_id)
        raise TTSServiceError(
            f"腾讯云声音克隆失败：{exc.get_code()}（请求编号：{request_id}）。"
        ) from exc
    except Exception as exc:
        logger.exception("Tencent VoiceClone failed unexpectedly")
        record_provider_call(user_id=user_id, provider="tencent_flowtts", operation="voice_clone", method="SDK", endpoint="VoiceClone", outcome="failed", duration_ms=int((time.perf_counter() - started) * 1000), request_summary={"voice_name": voice_name}, error_summary=type(exc).__name__, reference_type="voice_clone", reference_id=reference_id)
        raise TTSServiceError("腾讯云声音克隆失败，请稍后再试。") from exc

    voice_id = getattr(response, "VoiceId", None)
    record_provider_call(user_id=user_id, provider="tencent_flowtts", operation="voice_clone", method="SDK", endpoint="VoiceClone", outcome="completed" if voice_id else "failed", duration_ms=int((time.perf_counter() - started) * 1000), request_summary={"voice_name": voice_name}, response_summary={"voice_id_returned": bool(voice_id)}, reference_type="voice_clone", reference_id=reference_id)
    if not voice_id:
        raise TTSServiceError("腾讯云未返回 VoiceId。")
    return voice_id


def synthesize(
    text: str,
    voice_id: str,
    output_path: str,
    language: str = "zh",
    speed: float = 1.0,
    volume: float = 1.0,
    pitch: int = 0,
    user_id: int | None = None,
    reference_id: int | str | None = None,
) -> None:
    """Create a WAV file through Tencent's non-streaming TextToSpeech API."""
    if not voice_id:
        raise TTSServiceError("该音色没有腾讯云 VoiceId，请重新创建声音克隆。")

    try:
        from tencentcloud.trtc.v20190722 import models
        from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
    except ImportError as exc:
        raise TTSServiceError("腾讯云 SDK 未安装。") from exc

    params = {
        "Model": os.getenv("TENCENTCLOUD_MODEL", TENCENT_MODEL).strip() or TENCENT_MODEL,
        "Text": text,
        # Speed, volume and pitch are fields of the nested Voice object.
        # Sending them at the request root makes the Tencent SDK discard them,
        # so the controls in the web page appeared to work but had no effect.
        "Voice": {
            "VoiceId": voice_id,
            "Speed": speed,
            "Volume": volume,
            "Pitch": pitch,
        },
        "AudioFormat": {"Format": "wav", "SampleRate": 24000},
        "SdkAppId": _sdk_app_id(),
        "Language": language,
    }
    request = models.TextToSpeechRequest()
    request.from_json_string(json.dumps(params))
    started = time.perf_counter()
    try:
        response = _load_client().TextToSpeech(request)
    except TencentCloudSDKException as exc:
        request_id = exc.get_request_id() or "未返回"
        logger.warning("Tencent TextToSpeech failed: code=%s request_id=%s", exc.get_code(), request_id)
        record_provider_call(user_id=user_id, provider="tencent_flowtts", operation="text_to_speech", method="SDK", endpoint="TextToSpeech", outcome="failed", duration_ms=int((time.perf_counter() - started) * 1000), request_summary={"characters": len(text), "voice_id": voice_id}, error_summary=str(exc.get_code()), reference_type="synthesis", reference_id=reference_id)
        raise TTSServiceError(
            f"腾讯云语音合成失败：{exc.get_code()}（请求编号：{request_id}）。"
        ) from exc
    except Exception as exc:
        logger.exception("Tencent TextToSpeech failed unexpectedly")
        record_provider_call(user_id=user_id, provider="tencent_flowtts", operation="text_to_speech", method="SDK", endpoint="TextToSpeech", outcome="failed", duration_ms=int((time.perf_counter() - started) * 1000), request_summary={"characters": len(text), "voice_id": voice_id}, error_summary=type(exc).__name__, reference_type="synthesis", reference_id=reference_id)
        raise TTSServiceError("腾讯云语音合成失败，请稍后再试。") from exc

    audio = getattr(response, "Audio", None)
    record_provider_call(user_id=user_id, provider="tencent_flowtts", operation="text_to_speech", method="SDK", endpoint="TextToSpeech", outcome="completed" if audio else "failed", duration_ms=int((time.perf_counter() - started) * 1000), request_summary={"characters": len(text), "voice_id": voice_id}, response_summary={"audio_returned": bool(audio)}, reference_type="synthesis", reference_id=reference_id)
    if not audio:
        raise TTSServiceError("腾讯云未返回音频数据。")
    try:
        with open(output_path, "wb") as output_file:
            output_file.write(base64.b64decode(audio))
    except (ValueError, OSError) as exc:
        raise TTSServiceError("腾讯云音频保存失败。") from exc
