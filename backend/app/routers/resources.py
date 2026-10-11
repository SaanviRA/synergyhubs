from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..access import Conn, ProjectAccess, User, ensure_project_access
from ..errors import SafeRoute, fails_with
from ..utils import today_label

router = APIRouter(prefix="/api", route_class=SafeRoute)

RESOURCE_TYPES = ("doc", "document", "link", "website", "image", "video", "article")


class ResourceBody(BaseModel):
    title: str | None = None
    type: str | None = None
    url: str | None = None


# Fetch resources
@router.get(
    "/projects/{projectId}/resources",
    dependencies=[fails_with("Server error fetching resources"), ProjectAccess],
)
async def get_resources(projectId: int, conn: Conn):
    rows = await conn.fetch(
        "SELECT id, title, type, url, uploader, date FROM resources WHERE project_id = $1 ORDER BY id DESC",
        projectId,
    )
    return [dict(row) for row in rows]


# Save resource
@router.post(
    "/projects/{projectId}/resources",
    dependencies=[fails_with("Server error saving resource"), ProjectAccess],
)
async def save_resource(projectId: int, body: ResourceBody, conn: Conn, user: User):
    if not body.title or not body.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    if body.type not in RESOURCE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid resource type")

    row = await conn.fetchrow(
        """INSERT INTO resources (project_id, title, type, url, uploader, uploader_id, date)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, title, type, url, uploader, date""",
        projectId,
        body.title,
        body.type,
        body.url,
        user.name,
        user.id,
        today_label(),
    )
    return dict(row)


# Delete resource
@router.delete("/resources/{resourceId}", dependencies=[fails_with("Server error deleting resource")])
async def delete_resource(resourceId: int, conn: Conn, user: User):
    project_id = await conn.fetchval("SELECT project_id FROM resources WHERE id = $1", resourceId)
    if project_id is not None:
        await ensure_project_access(conn, project_id, user.id)
        await conn.execute("DELETE FROM resources WHERE id = $1", resourceId)
    return {"success": True}
