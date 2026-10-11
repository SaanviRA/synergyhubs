import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import HTTPException, Request

from .config import get_settings

SALT_ROUNDS = 10
JWT_ALGORITHM = "HS256"
TOKEN_LIFETIME = timedelta(days=7)
# bcrypt only reads the first 72 bytes of a password
BCRYPT_MAX_BYTES = 72


@dataclass(frozen=True)
class CurrentUser:
    id: int
    name: str


def _password_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:BCRYPT_MAX_BYTES]


async def hash_password(password: str) -> str:
    hashed = await asyncio.to_thread(bcrypt.hashpw, _password_bytes(password), bcrypt.gensalt(SALT_ROUNDS))
    return hashed.decode("ascii")


async def verify_password(password: str, password_hash: str) -> bool:
    try:
        return await asyncio.to_thread(
            bcrypt.checkpw, _password_bytes(password), password_hash.encode("ascii")
        )
    except ValueError:
        return False


def generate_token(user) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "iat": now,
        "exp": now + TOKEN_LIFETIME,
    }
    return jwt.encode(payload, get_settings().jwt_secret, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> CurrentUser:
    decoded = jwt.decode(
        token,
        get_settings().jwt_secret,
        algorithms=[JWT_ALGORITHM],
        options={"require": ["exp"]},
    )
    return CurrentUser(id=int(decoded["id"]), name=decoded.get("name") or "")


def current_user(request: Request) -> CurrentUser:
    """Requires a valid `Authorization: Bearer <token>` header."""
    parts = request.headers.get("authorization", "").split(" ")
    token = parts[1] if len(parts) > 1 else ""
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        return decode_token(token)
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=403, detail="Invalid or expired authentication token")
