import asyncpg
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..access import Conn, User
from ..errors import SafeRoute, fails_with

router = APIRouter(prefix="/api/users", route_class=SafeRoute)


class ProfileBody(BaseModel):
    name: str | None = None
    email: str | None = None


@router.get("/me", dependencies=[fails_with("Server error fetching profile")])
async def get_me(conn: Conn, user: User):
    row = await conn.fetchrow("SELECT id, name, email, avatar, role, is_me, is_admin FROM users WHERE id = $1", user.id)
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(row)


@router.put("/me", dependencies=[fails_with("Server error updating profile")])
async def update_me(body: ProfileBody, conn: Conn, user: User):
    if not body.name or not body.email:
        raise HTTPException(status_code=400, detail="Name and email are required")
    try:
        row = await conn.fetchrow(
            "UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING id, name, email, avatar, role, is_me, is_admin",
            body.name.strip(),
            body.email.strip().lower(),
            user.id,
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(row)
