from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app import config, security
from app.config import get_settings

USER = {"id": 7, "email": "a@b.co", "name": "Ada"}


def _request(authorization: str | None) -> Request:
    headers = [(b"authorization", authorization.encode())] if authorization else []
    return Request({"type": "http", "headers": headers})


async def test_password_hash_roundtrip():
    hashed = await security.hash_password("correct horse")
    assert hashed.startswith("$2b$10$")
    assert await security.verify_password("correct horse", hashed)
    assert not await security.verify_password("wrong", hashed)
    assert not await security.verify_password("anything", "not-a-bcrypt-hash")


async def test_passwords_longer_than_bcrypt_limit_are_accepted():
    long_password = "x" * 100
    assert await security.verify_password(long_password, await security.hash_password(long_password))


def test_token_roundtrip_matches_the_node_payload():
    token = security.generate_token(USER)
    payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    assert {key: payload[key] for key in ("id", "email", "name")} == USER
    assert payload["exp"] - payload["iat"] == 7 * 24 * 3600
    assert security.current_user(_request(f"Bearer {token}")) == security.CurrentUser(id=7, name="Ada")


def test_missing_token_is_rejected_instead_of_falling_back_to_a_mock_user():
    for header in (None, "Bearer", "Bearer "):
        with pytest.raises(HTTPException) as exc:
            security.current_user(_request(header))
        assert exc.value.status_code == 401


@pytest.mark.parametrize(
    "token",
    [
        "garbage",
        jwt.encode({"id": 3, "name": "You", "exp": 9999999999}, "fallback_secret_for_dev", algorithm="HS256"),
        jwt.encode(
            {"id": 3, "name": "You", "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
            "unit-test-secret-0123456789abcdef0123456789abcdef",
            algorithm="HS256",
        ),
        jwt.encode(
            {"id": 3, "name": "You"}, "unit-test-secret-0123456789abcdef0123456789abcdef", algorithm="HS256"
        ),
        jwt.encode({"id": 3, "name": "You", "exp": 9999999999}, "", algorithm="none"),
    ],
    ids=["garbage", "old-fallback-secret", "expired", "no-expiry", "alg-none"],
)
def test_invalid_tokens_are_rejected(token):
    with pytest.raises(HTTPException) as exc:
        security.current_user(_request(f"Bearer {token}"))
    assert exc.value.status_code == 403


@pytest.mark.parametrize("secret", ["", "fallback_secret_for_dev", "short"])
def test_weak_or_missing_jwt_secret_stops_startup(monkeypatch, secret):
    monkeypatch.setenv("JWT_SECRET", secret)
    get_settings.cache_clear()
    try:
        with pytest.raises(RuntimeError, match="JWT_SECRET"):
            get_settings()
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


def test_settings_read_cors_origins_and_google_client_id():
    settings = config.get_settings()
    assert settings.cors_origins == ("http://localhost:5173",)
    assert settings.google_client_id == "test-client-id.apps.googleusercontent.com"
    assert settings.db_name == "group_app_test"
