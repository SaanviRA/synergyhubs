import asyncpg
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..access import Conn, User
from ..errors import SafeRoute, fails_with

router = APIRouter(prefix="/api/users", route_class=SafeRoute)

PROFILE_COLUMNS = "id, name, email, avatar, role, is_me, is_admin, school, academic_year"

MAX_SCHOOL_LENGTH = 150
MAX_ACADEMIC_YEAR_LENGTH = 20


class ProfileBody(BaseModel):
    name: str | None = None
    email: str | None = None
    # Left unchanged when not sent; blank clears them
    school: str | None = None
    academic_year: str | None = None


@router.get("/me", dependencies=[fails_with("Server error fetching profile")])
async def get_me(conn: Conn, user: User):
    row = await conn.fetchrow(f"SELECT {PROFILE_COLUMNS} FROM users WHERE id = $1", user.id)
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(row)


@router.put("/me", dependencies=[fails_with("Server error updating profile")])
async def update_me(body: ProfileBody, conn: Conn, user: User):
    if not body.name or not body.email:
        raise HTTPException(status_code=400, detail="Name and email are required")

    updates = {"name": body.name.strip(), "email": body.email.strip().lower()}
    for field, label, limit in (
        ("school", "School", MAX_SCHOOL_LENGTH),
        ("academic_year", "Academic year", MAX_ACADEMIC_YEAR_LENGTH),
    ):
        if field in body.model_fields_set:
            value = (getattr(body, field) or "").strip()
            if len(value) > limit:
                raise HTTPException(status_code=400, detail=f"{label} can be at most {limit} characters")
            updates[field] = value or None

    set_clause = ", ".join(f"{column} = ${i}" for i, column in enumerate(updates, start=1))
    try:
        row = await conn.fetchrow(
            f"UPDATE users SET {set_clause} WHERE id = ${len(updates) + 1} RETURNING {PROFILE_COLUMNS}",
            *updates.values(),
            user.id,
        )
    except asyncpg.UniqueViolationError:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(row)
