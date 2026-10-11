from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..access import Conn, ProjectAccess, User, ensure_project_access
from ..errors import SafeRoute, fails_with
from ..utils import today_label

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


# Delete workspace
@router.delete("/workspaces/{workspaceId}", dependencies=[fails_with("Server error deleting workspace")])
async def delete_workspace(workspaceId: int, conn: Conn, user: User):
    project_id = await conn.fetchval("SELECT project_id FROM workspaces WHERE id = $1", workspaceId)
    if project_id is not None:
        await ensure_project_access(conn, project_id, user.id)
        await conn.execute("DELETE FROM workspaces WHERE id = $1", workspaceId)
    return {"success": True}
