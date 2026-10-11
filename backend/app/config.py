import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]

# Secrets that must never be accepted, including the old Node fallback
INSECURE_JWT_SECRETS = {"fallback_secret_for_dev", "changeme", "secret"}
MIN_JWT_SECRET_LENGTH = 32

DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"


@dataclass(frozen=True)
class Settings:
    db_host: str
    db_port: int
    db_name: str
    db_user: str
    db_password: str
    jwt_secret: str
    google_client_id: str
    cors_origins: tuple[str, ...]


def _validate_jwt_secret(secret: str) -> str:
    if not secret:
        raise RuntimeError("JWT_SECRET is not set. Generate one with: openssl rand -hex 32")
    if secret in INSECURE_JWT_SECRETS or len(secret) < MIN_JWT_SECRET_LENGTH:
        raise RuntimeError(
            f"JWT_SECRET is too weak (need at least {MIN_JWT_SECRET_LENGTH} characters). "
            "Generate one with: openssl rand -hex 32"
        )
    return secret


@lru_cache
def get_settings() -> Settings:
    # Real environment variables win over the file. ENV_FILE overrides the root .env location.
    env_file = os.environ.get("ENV_FILE") or REPO_ROOT / ".env"
    load_dotenv(env_file, override=False)

    origins = os.environ.get("CORS_ORIGINS", DEFAULT_CORS_ORIGINS)
    return Settings(
        db_host=os.environ.get("DB_HOST", "localhost"),
        db_port=int(os.environ.get("DB_PORT", "5432")),
        db_name=os.environ.get("DB_NAME", "group_app_db"),
        db_user=os.environ.get("DB_USER", "pguser"),
        db_password=os.environ.get("DB_PASSWORD", "pgpassword"),
        jwt_secret=_validate_jwt_secret(os.environ.get("JWT_SECRET", "").strip()),
        google_client_id=(
            os.environ.get("GOOGLE_CLIENT_ID") or os.environ.get("VITE_GOOGLE_CLIENT_ID", "")
        ).strip(),
        cors_origins=tuple(o.strip() for o in origins.split(",") if o.strip()),
    )
