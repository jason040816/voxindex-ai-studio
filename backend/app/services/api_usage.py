from fastapi import Request
from sqlalchemy.orm import Session

from app.models.api_access import ApiKeyUsageEvent


def update_api_key_usage(
    db: Session,
    request: Request,
    *,
    outcome: str | None = None,
    characters: int | None = None,
    credits_used: int | None = None,
) -> None:
    event_id = getattr(request.state, "api_key_usage_event_id", None)
    if not event_id:
        return
    event = db.query(ApiKeyUsageEvent).filter(ApiKeyUsageEvent.id == event_id).first()
    if not event:
        return
    if outcome is not None:
        event.outcome = outcome
    if characters is not None:
        event.characters = max(0, characters)
    if credits_used is not None:
        event.credits_used = max(0, credits_used)
