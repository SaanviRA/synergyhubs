from typing import Annotated

import asyncpg
from fastapi import Depends, HTTPException

from .db import get_conn
from .security import CurrentUser, current_user

Conn = Annotated[asyncpg.Connection, Depends(get_conn)]

PENDING_APPROVAL = "Your account is waiting for approval by an administrator. Please check back later."

AUTO_APPROVE = "auto_approve_signups"


async def auto_approve_enabled(conn: asyncpg.Connection) -> bool:
    """When an admin has turned this on, new accounts are approved as soon as they sign up."""
    return bool(await conn.fetchval("SELECT value FROM app_settings WHERE key = $1", AUTO_APPROVE))


async def active_user(conn: Conn, user: Annotated[CurrentUser, Depends(current_user)]) -> CurrentUser:
    """A valid token is not enough: the account must still exist and be approved."""
    approved = await conn.fetchval("SELECT approved FROM users WHERE id = $1", user.id)
    if approved is None:
        raise HTTPException(status_code=401, detail="Your account no longer exists")
    if not approved:
        raise HTTPException(status_code=403, detail=PENDING_APPROVAL)
    return user


User = Annotated[CurrentUser, Depends(active_user)]


async def ensure_project_access(conn: asyncpg.Connection, project_id: int, user_id: int) -> None:
    """Allows members of the project and members of the class the project belongs to."""
    class_id = await conn.fetchval("SELECT class_id FROM projects WHERE id = $1", project_id)
    if class_id is None:
        raise HTTPException(status_code=404, detail="Project not found")
    allowed = await conn.fetchval(
        """SELECT EXISTS (SELECT 1 FROM class_members WHERE class_id = $1 AND user_id = $3)
               OR EXISTS (SELECT 1 FROM project_members WHERE project_id = $2 AND user_id = $3)""",
        class_id,
        project_id,
        user_id,
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="You do not have access to this project")


async def project_access(projectId: int, conn: Conn, user: User) -> None:
    await ensure_project_access(conn, projectId, user.id)


async def is_teacher(conn: asyncpg.Connection, user_id: int) -> bool:
    role = await conn.fetchval("SELECT role FROM users WHERE id = $1", user_id)
    return role == "teacher"


# Route dependency for every /api/projects/{projectId}/... endpoint
ProjectAccess = Depends(project_access)
