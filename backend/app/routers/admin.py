from fastapi import APIRouter, Depends, HTTPException

from ..access import Conn, User
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
