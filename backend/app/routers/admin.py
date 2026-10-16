from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..access import AUTO_APPROVE, Conn, User, auto_approve_enabled
from ..errors import SafeRoute, fails_with
from ..utils import iso_z


async def require_admin(conn: Conn, user: User) -> None:
    if not await conn.fetchval("SELECT is_admin FROM users WHERE id = $1", user.id):
        raise HTTPException(status_code=403, detail="Admin access required")


router = APIRouter(prefix="/api/admin", route_class=SafeRoute, dependencies=[Depends(require_admin)])


async def _target(conn: Conn, user_id: int):
    target = await conn.fetchrow("SELECT id, is_admin FROM users WHERE id = $1", user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    return target


# Every account, accounts waiting for approval first
@router.get("/users", dependencies=[fails_with("Server error fetching users")])
async def list_users(conn: Conn):
    rows = await conn.fetch(
        """SELECT id, name, email, role, approved, is_admin, created_at,
                  password_hash IS NOT NULL AS has_password, google_id IS NOT NULL AS has_google
           FROM users
           ORDER BY approved ASC, created_at DESC, id DESC"""
    )
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "role": row["role"],
            "approved": row["approved"],
            "isAdmin": row["is_admin"],
            # Neither: a placeholder created when a teammate invited this email
            "signIn": "google" if row["has_google"] else "password" if row["has_password"] else "invited",
            "createdAt": iso_z(row["created_at"]),
        }
        for row in rows
    ]


@router.post("/users/{userId}/approve", dependencies=[fails_with("Server error approving user")])
async def approve_user(userId: int, conn: Conn):
    await _target(conn, userId)
    await conn.execute("UPDATE users SET approved = TRUE WHERE id = $1", userId)
    return {"success": True}


# Deleting removes the account with its memberships and logs; classes it created are kept
@router.delete("/users/{userId}", dependencies=[fails_with("Server error deleting user")])
async def delete_user(userId: int, conn: Conn, user: User):
    target = await _target(conn, userId)
    if target["id"] == user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    if target["is_admin"]:
        raise HTTPException(status_code=400, detail="Admin accounts cannot be deleted here")
    await conn.execute("DELETE FROM users WHERE id = $1", userId)
    return {"success": True}


class AutoApproveBody(BaseModel):
    enabled: bool
    # Must be exactly ENABLE when turning on and DISABLE when turning off
    confirmation: str | None = None


@router.get("/settings", dependencies=[fails_with("Server error fetching settings")])
async def read_settings(conn: Conn):
    return {"autoApprove": await auto_approve_enabled(conn)}


# Turning auto-approve on approves new sign-ups from then on; accounts already waiting stay pending
@router.put("/settings/auto-approve", dependencies=[fails_with("Server error updating settings")])
async def set_auto_approve(body: AutoApproveBody, conn: Conn, user: User):
    expected = "ENABLE" if body.enabled else "DISABLE"
    if body.confirmation != expected:
        raise HTTPException(status_code=400, detail=f"Type {expected} to confirm")
    await conn.execute(
        """INSERT INTO app_settings (key, value, updated_by, updated_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at""",
        AUTO_APPROVE,
        body.enabled,
        user.id,
    )
    return {"autoApprove": body.enabled}
