from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..access import Conn, ProjectAccess, User, is_teacher
from ..errors import SafeRoute, fails_with
from ..utils import iso_z, short_date

router = APIRouter(prefix="/api/projects/{projectId}", route_class=SafeRoute)


class InviteBody(BaseModel):
    email: str | None = None


class RoleBody(BaseModel):
    userId: int | None = None
    role: str | None = None


class TextBody(BaseModel):
    text: str | None = None


def _require_text(body: TextBody) -> str:
    if not body.text or not body.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")
    return body.text


# Fetch project team members
@router.get("/team", dependencies=[fails_with("Server error fetching team members"), ProjectAccess])
async def get_team(projectId: int, conn: Conn, user: User):
    rows = await conn.fetch(
        """SELECT u.id, u.name, u.email, u.avatar, (u.id = $2) AS is_me, pm.roles, pm.active_log,
                  COALESCE(pm.has_visited, FALSE) AS has_visited,
                  pm.last_visited_at,
                  COALESCE(pm.visit_count, 0) AS visit_count
           FROM project_members pm
           JOIN users u ON pm.user_id = u.id
           WHERE pm.project_id = $1
           ORDER BY u.id ASC""",
        projectId,
        user.id,
    )
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "avatar": row["avatar"],
            "is_me": row["is_me"],
            "isMe": row["is_me"],
            "roles": row["roles"],
            "activeLog": row["active_log"],
            "hasVisited": row["has_visited"],
            "lastVisitedAt": iso_z(row["last_visited_at"]),
            "visitCount": row["visit_count"],
        }
        for row in rows
    ]


# Invite a teammate by email
@router.post("/team/invite", dependencies=[fails_with("Server error inviting teammate"), ProjectAccess])
async def invite_teammate(projectId: int, body: InviteBody, conn: Conn):
    email = (body.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    name_part = email.split("@")[0]
    async with conn.transaction():
        invited = await conn.fetchrow("SELECT * FROM users WHERE email = $1 ORDER BY id ASC LIMIT 1", email)
        if invited is None:
            invited = await conn.fetchrow(
                "INSERT INTO users (name, email, avatar, is_me) VALUES ($1, $2, $3, FALSE) RETURNING *",
                name_part,
                email,
                name_part[:2].upper(),
            )

        # Add to class if not member
        await conn.execute(
            """INSERT INTO class_members (class_id, user_id, role)
               SELECT class_id, $2, 'student' FROM projects WHERE id = $1
               ON CONFLICT DO NOTHING""",
            projectId,
            invited["id"],
        )
        await conn.execute(
            """INSERT INTO project_members (project_id, user_id, roles, active_log)
               VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING""",
            projectId,
            invited["id"],
            [],
            "Just joined the project!",
        )

    return {
        "success": True,
        "member": {
            "id": invited["id"],
            "name": invited["name"],
            "avatar": invited["avatar"],
            "roles": [],
            "activeLog": "Just joined the project!",
        },
    }


def _require_role(body: RoleBody) -> tuple[int, str]:
    if body.userId is None or not body.role:
        raise HTTPException(status_code=400, detail="userId and role are required")
    return body.userId, body.role


# Add a role to a member
@router.post("/team/role", dependencies=[fails_with("Server error adding role"), ProjectAccess])
async def add_role(projectId: int, body: RoleBody, conn: Conn):
    user_id, role = _require_role(body)
    await conn.execute(
        """UPDATE project_members SET roles = array_append(roles, $1::text)
           WHERE project_id = $2 AND user_id = $3 AND NOT ($1::text = ANY(roles))""",
        role,
        projectId,
        user_id,
    )
    return {"success": True}


# Remove a role from a member
@router.delete("/team/role", dependencies=[fails_with("Server error removing role"), ProjectAccess])
async def remove_role(projectId: int, body: RoleBody, conn: Conn):
    user_id, role = _require_role(body)
    await conn.execute(
        "UPDATE project_members SET roles = array_remove(roles, $1::text) WHERE project_id = $2 AND user_id = $3",
        role,
        projectId,
        user_id,
    )
    return {"success": True}


# Post a status update (visible to everyone)
@router.post("/team/update", dependencies=[fails_with("Server error posting status update"), ProjectAccess])
async def post_status_update(projectId: int, body: TextBody, conn: Conn, user: User):
    text = _require_text(body)
    await conn.execute(
        "UPDATE project_members SET active_log = $1 WHERE project_id = $2 AND user_id = $3",
        text,
        projectId,
        user.id,
    )
    await conn.execute(
        """INSERT INTO evaluation_logs (project_id, user_id, log_text, date, log_type)
           VALUES ($1, $2, $3, $4, 'status_update')""",
        projectId,
        user.id,
        text,
        short_date(),
    )
    return {"success": True}


# Fetch logs (private user logs for students, or all student logs if teacher)
@router.get("/logs", dependencies=[fails_with("Server error fetching logs"), ProjectAccess])
async def get_logs(projectId: int, conn: Conn, user: User, userId: int | None = None):
    teacher = await is_teacher(conn, user.id)

    if teacher and userId is None:
        rows = await conn.fetch(
            """SELECT el.id, el.log_text AS text, el.date, el.created_at, el.user_id AS "userId",
                      COALESCE(el.log_type, 'work_log') AS type, u.name AS "userName", u.avatar
               FROM evaluation_logs el
               JOIN users u ON el.user_id = u.id
               WHERE el.project_id = $1
               ORDER BY el.id DESC""",
            projectId,
        )
    else:
        # Work logs are private: only teachers may read another user's
        if userId is not None and userId != user.id and not teacher:
            raise HTTPException(status_code=403, detail="You can only view your own logs")
        rows = await conn.fetch(
            """SELECT id, log_text AS text, date, created_at, COALESCE(log_type, 'work_log') AS type
               FROM evaluation_logs
               WHERE project_id = $1 AND user_id = $2
               ORDER BY id DESC""",
            projectId,
            userId if userId is not None else user.id,
        )

    return [{**dict(row), "created_at": iso_z(row["created_at"])} for row in rows]


# Add a private work log
@router.post("/logs", dependencies=[fails_with("Server error saving log"), ProjectAccess])
async def add_log(projectId: int, body: TextBody, conn: Conn, user: User):
    text = _require_text(body)
    new_log = await conn.fetchrow(
        """INSERT INTO evaluation_logs (project_id, user_id, log_text, date, log_type)
           VALUES ($1, $2, $3, $4, 'work_log')
           RETURNING id, log_text AS text, date""",
        projectId,
        user.id,
        text,
        short_date(),
    )
    # Also update public active log
    await conn.execute(
        "UPDATE project_members SET active_log = $1 WHERE project_id = $2 AND user_id = $3",
        text,
        projectId,
        user.id,
    )
    return dict(new_log)


# Delete private work log
@router.delete("/logs/{logId}", dependencies=[fails_with("Server error deleting log"), ProjectAccess])
async def delete_log(projectId: int, logId: int, conn: Conn, user: User):
    await conn.execute(
        "DELETE FROM evaluation_logs WHERE id = $1 AND user_id = $2 AND project_id = $3",
        logId,
        user.id,
        projectId,
    )
    return {"success": True}
