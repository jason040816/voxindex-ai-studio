"""Optional Alibaba Cloud OSS backup for locally stored media files."""

import logging
import os

logger = logging.getLogger(__name__)


def backup_file(local_path: str, object_key: str) -> None:
    """Upload a local file to OSS when backup is enabled.

    Backup failures are logged but do not break the main application flow. The
    local Docker volume remains the primary source of truth.
    """
    if os.getenv("OSS_BACKUP_ENABLED", "false").strip().lower() not in {"1", "true", "yes", "on"}:
        return

    bucket_name = os.getenv("OSS_BUCKET", "").strip()
    endpoint = os.getenv("OSS_ENDPOINT", "").strip()
    access_key_id = os.getenv("OSS_ACCESS_KEY_ID", "").strip()
    access_key_secret = os.getenv("OSS_ACCESS_KEY_SECRET", "").strip()
    if not all((bucket_name, endpoint, access_key_id, access_key_secret)):
        logger.warning("OSS backup is enabled but its configuration is incomplete")
        return
    if not os.path.isfile(local_path):
        logger.warning("OSS backup skipped because local file is missing: %s", local_path)
        return

    try:
        import oss2

        # Alibaba OSS V4 signatures require the bucket's region.
        region = os.getenv("OSS_REGION", "cn-beijing").strip()
        # Use Alibaba's official V4 environment provider so the SDK reads the
        # exact credentials (and an optional STS token) from the container.
        from oss2.credentials import EnvironmentVariableCredentialsProvider

        auth = oss2.ProviderAuthV4(EnvironmentVariableCredentialsProvider())
        bucket = oss2.Bucket(auth, endpoint, bucket_name, region=region)
        prefix = os.getenv("OSS_PREFIX", "voxindex").strip("/")
        key = f"{prefix}/{object_key.lstrip('/')}" if prefix else object_key.lstrip("/")
        result = bucket.put_object_from_file(key, local_path)
        if result.status >= 300:
            raise RuntimeError(f"OSS returned HTTP {result.status}")
        logger.info("Backed up %s to OSS object %s", local_path, key)
    except Exception:
        logger.exception("OSS backup failed for %s", local_path)
