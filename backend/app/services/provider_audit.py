"""Best-effort persistence for per-user upstream provider call metadata."""

import json

from app.models import SessionLocal
from app.models.api_access import ProviderCallEvent


def record_provider_call(
    *,
    user_id: int | None,
    provider: str,
    operation: str,
    method: str,
    endpoint: str,
    outcome: str,
    duration_ms: int,
    status_code: int | None = None,
    request_summary: dict | None = None,
    response_summary: dict | None = None,
    error_summary: str | None = None,
    reference_type: str | None = None,
    reference_id: int | str | None = None,
) -> None:
    """Persist metadata only; never store credentials, request text, or response bodies."""
    try:
        with SessionLocal() as db:
            db.add(ProviderCallEvent(
                user_id=user_id,
                provider=provider[:50],
                operation=operation[:80],
                method=method[:12],
                endpoint=endpoint[:300],
                status_code=status_code,
                outcome=outcome[:24],
                duration_ms=max(0, int(duration_ms)),
                request_summary=json.dumps(request_summary or {}, ensure_ascii=False)[:2000],
                response_summary=json.dumps(response_summary or {}, ensure_ascii=False)[:2000],
                error_summary=(error_summary or "")[:500] or None,
                reference_type=(reference_type or "")[:40] or None,
                reference_id=str(reference_id)[:80] if reference_id is not None else None,
            ))
            db.commit()
    except Exception:
        # Auditing must not break the user's upstream operation.
        pass
