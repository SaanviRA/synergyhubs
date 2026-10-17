from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..access import Conn, ProjectAccess, User, ensure_project_access
from ..errors import SafeRoute, fails_with
from ..utils import get_initials, today_label

router = APIRouter(prefix="/api", route_class=SafeRoute)

WORKSPACE_TYPES = ("figma", "drive", "miro", "github", "other")


class WorkspaceBody(BaseModel):
    title: str | None = None
    type: str | None = None
    url: str | None = None


# Fetch workspaces
@router.get(
    "/projects/{projectId}/workspaces",
    dependencies=[fails_with("Server error fetching workspaces"), ProjectAccess],
)
async def get_workspaces(projectId: int, conn: Conn):
    rows = await conn.fetch(
        "SELECT id, title, type, url, creator, date FROM workspaces WHERE project_id = $1 ORDER BY id DESC",
        projectId,
    )
    return [dict(row) for row in rows]


# Save workspace
@router.post(
    "/projects/{projectId}/workspaces",
    dependencies=[fails_with("Server error saving workspace"), ProjectAccess],
)
async def save_workspace(projectId: int, body: WorkspaceBody, conn: Conn, user: User):
    if not body.title or not body.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    if body.type not in WORKSPACE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid workspace type")

    row = await conn.fetchrow(
        """INSERT INTO workspaces (project_id, title, type, url, creator, creator_id, date)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, title, type, url, creator, date""",
        projectId,
        body.title,
        body.type,
        body.url,
        user.name,
        user.id,
        today_label(),
    )
    return dict(row)


MAX_TITLE_LENGTH = 200


# Rename workspace
@router.patch("/workspaces/{workspaceId}", dependencies=[fails_with("Server error renaming workspace")])
async def rename_workspace(workspaceId: int, body: WorkspaceBody, conn: Conn, user: User):
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    if len(title) > MAX_TITLE_LENGTH:
        raise HTTPException(status_code=400, detail=f"Titles can be at most {MAX_TITLE_LENGTH} characters")
    await _ensure_workspace_access(conn, workspaceId, user.id)

    row = await conn.fetchrow(
        "UPDATE workspaces SET title = $1 WHERE id = $2 RETURNING id, title, type, url, creator, date",
        title,
        workspaceId,
    )
    return dict(row)


# Delete workspace
@router.delete("/workspaces/{workspaceId}", dependencies=[fails_with("Server error deleting workspace")])
async def delete_workspace(workspaceId: int, conn: Conn, user: User):
    project_id = await conn.fetchval("SELECT project_id FROM workspaces WHERE id = $1", workspaceId)
    if project_id is not None:
        await ensure_project_access(conn, project_id, user.id)
        await conn.execute("DELETE FROM workspaces WHERE id = $1", workspaceId)
    return {"success": True}


# Chat about a workspace document. Every conversation belongs to one workspace, and anyone who can
# see the workspace's project can read and post in it.

MAX_MESSAGE_LENGTH = 2000
MESSAGE_PAGE = 200


class MessageBody(BaseModel):
    text: str | None = None


async def _ensure_workspace_access(conn, workspace_id: int, user_id: int) -> None:
    project_id = await conn.fetchval("SELECT project_id FROM workspaces WHERE id = $1", workspace_id)
    if project_id is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    await ensure_project_access(conn, project_id, user_id)


def _message(row, user_id: int) -> dict:
    return {
        "id": row["id"],
        "author": row["author"],
        "avatar": row["avatar"] or get_initials(row["author"]),
        "text": row["body"],
        "createdAt": row["created_at"].isoformat(),
        "mine": row["user_id"] == user_id,
    }


MESSAGE_COLUMNS = "m.id, m.user_id, m.author, u.avatar, m.body, m.created_at"


# Fetch messages, oldest first. With `after`, only messages newer than that ID (used for polling);
# without it, the latest page.
@router.get("/workspaces/{workspaceId}/messages", dependencies=[fails_with("Server error fetching messages")])
async def get_messages(workspaceId: int, conn: Conn, user: User, after: int = 0):
    await _ensure_workspace_access(conn, workspaceId, user.id)
    if after:
        rows = await conn.fetch(
            f"""SELECT {MESSAGE_COLUMNS} FROM workspace_messages m LEFT JOIN users u ON u.id = m.user_id
                WHERE m.workspace_id = $1 AND m.id > $2 ORDER BY m.id LIMIT $3""",
            workspaceId,
            after,
            MESSAGE_PAGE,
        )
    else:
        rows = await conn.fetch(
            f"""SELECT * FROM (
                    SELECT {MESSAGE_COLUMNS} FROM workspace_messages m LEFT JOIN users u ON u.id = m.user_id
                    WHERE m.workspace_id = $1 ORDER BY m.id DESC LIMIT $2
                ) latest ORDER BY id""",
            workspaceId,
            MESSAGE_PAGE,
        )
    return [_message(row, user.id) for row in rows]


# Post a message
@router.post("/workspaces/{workspaceId}/messages", dependencies=[fails_with("Server error sending message")])
async def post_message(workspaceId: int, body: MessageBody, conn: Conn, user: User):
    await _ensure_workspace_access(conn, workspaceId, user.id)
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(text) > MAX_MESSAGE_LENGTH:
        raise HTTPException(
            status_code=400, detail=f"Messages can be at most {MAX_MESSAGE_LENGTH} characters"
        )

    message_id = await conn.fetchval(
        "INSERT INTO workspace_messages (workspace_id, user_id, author, body) VALUES ($1, $2, $3, $4) RETURNING id",
        workspaceId,
        user.id,
        user.name,
        text,
    )
    row = await conn.fetchrow(
        f"""SELECT {MESSAGE_COLUMNS} FROM workspace_messages m LEFT JOIN users u ON u.id = m.user_id
            WHERE m.id = $1""",
        message_id,
    )
    return _message(row, user.id)
