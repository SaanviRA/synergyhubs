import asyncio

import asyncpg
from fastapi import APIRouter, HTTPException
from google.auth.exceptions import GoogleAuthError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel

from ..access import PENDING_APPROVAL, Conn
from ..config import get_settings
from ..errors import SafeRoute, fails_with, logger
from ..security import generate_token, hash_password, verify_password
from ..utils import get_initials

router = APIRouter(prefix="/api/auth", route_class=SafeRoute)

ROLES = ("student", "teacher")
USER_FIELDS = ("id", "name", "email", "avatar", "role")


class SignupBody(BaseModel):
    name: str | None = None
    email: str | None = None
    password: str | None = None
    role: str | None = None


class LoginBody(BaseModel):
    email: str | None = None
    password: str | None = None
    role: str | None = None


class GoogleBody(BaseModel):
    idToken: str | None = None
    role: str | None = None


def _target_role(role: str | None) -> str:
    role = role or "student"
    if role not in ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    return role


def verify_google_token(token: str, client_id: str) -> dict:
    return google_id_token.verify_oauth2_token(token, google_requests.Request(), client_id)


def _session(user) -> dict:
    """A login token, or a pending notice for an account an admin has not approved yet."""
    if not user["approved"]:
        return {"pending": True, "message": PENDING_APPROVAL}
    return {"token": generate_token(user), "user": {key: user[key] for key in USER_FIELDS}}


@router.post(
    "/signup", status_code=201, dependencies=[fails_with("Internal server error during registration")]
)
async def signup(body: SignupBody, conn: Conn):
    if not body.name or not body.email or not body.password:
        raise HTTPException(status_code=400, detail="All fields are required")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    email = body.email.strip().lower()
    role = _target_role(body.role)
    duplicate = HTTPException(
        status_code=409, detail=f"An account with this email already exists as a {role}"
    )

    # Check if email already exists for this specific role. An account with neither a password nor
    # Google is the placeholder a teammate's invite created, which this sign-up takes over.
    existing = await conn.fetchrow(
        "SELECT id, password_hash, google_id FROM users WHERE email = $1 AND role = $2", email, role
    )
    if existing is not None and (existing["password_hash"] or existing["google_id"]):
        raise duplicate

    password_hash = await hash_password(body.password)
    if existing is not None:
        # Keeps the invited projects; approval is still up to an admin
        user = await conn.fetchrow(
            """UPDATE users SET name = $1, avatar = $2, password_hash = $3
               WHERE id = $4 AND password_hash IS NULL AND google_id IS NULL
               RETURNING id, name, email, avatar, role, approved""",
            body.name.strip(),
            get_initials(body.name),
            password_hash,
            existing["id"],
        )
        if user is None:
            raise duplicate
        return _session(user)

    try:
        user = await conn.fetchrow(
            """INSERT INTO users (name, email, avatar, password_hash, role, is_me)
               VALUES ($1, $2, $3, $4, $5, FALSE)
               RETURNING id, name, email, avatar, role, approved""",
            body.name.strip(),
            email,
            get_initials(body.name),
            password_hash,
            role,
        )
    except asyncpg.UniqueViolationError:
        raise duplicate

    return _session(user)


@router.post("/login", dependencies=[fails_with("Internal server error during login")])
async def login(body: LoginBody, conn: Conn):
    if not body.email or not body.password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    email = body.email.strip().lower()
    role = _target_role(body.role)

    user = await conn.fetchrow("SELECT * FROM users WHERE email = $1 AND role = $2", email, role)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Check if user registered via Google only (no password)
    if not user["password_hash"]:
        raise HTTPException(
            status_code=400,
            detail="This account was created with Google Sign-In. Please click the Google button to access.",
        )

    if not await verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return _session(user)


@router.post("/google", dependencies=[fails_with("Internal server error during Google sign-in")])
async def google_login(body: GoogleBody, conn: Conn):
    if not body.idToken:
        raise HTTPException(status_code=400, detail="Google ID Token is required")
    role = _target_role(body.role)

    invalid = HTTPException(status_code=400, detail="Invalid Google signature or token")
    client_id = get_settings().google_client_id
    if not client_id:
        # Without an audience any Google-signed token would be accepted
        logger.error("Google sign-in attempted but VITE_GOOGLE_CLIENT_ID is not configured")
        raise invalid

    try:
        payload = await asyncio.to_thread(verify_google_token, body.idToken, client_id)
        google_id = payload["sub"]
        email = payload["email"].lower()
        name = payload.get("name") or email.split("@")[0]
        picture = payload.get("picture")
        if not payload.get("email_verified"):
            raise ValueError("Google email is not verified")
    except (ValueError, KeyError, GoogleAuthError):
        logger.exception("Google Auth Error")
        raise invalid

    user = await conn.fetchrow(
        """SELECT id, name, email, avatar, google_id, role, approved FROM users
           WHERE (google_id = $1 OR email = $2) AND role = $3""",
        google_id,
        email,
        role,
    )
    if user is None:
        user = await conn.fetchrow(
            """INSERT INTO users (name, email, avatar, google_id, avatar_url, role)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING id, name, email, avatar, role, approved""",
            name,
            email,
            get_initials(name),
            google_id,
            picture,
            role,
        )
    elif not user["google_id"]:
        user = await conn.fetchrow(
            """UPDATE users SET google_id = $1, avatar_url = $2 WHERE id = $3
               RETURNING id, name, email, avatar, role, approved""",
            google_id,
            picture,
            user["id"],
        )

    return _session(user)
