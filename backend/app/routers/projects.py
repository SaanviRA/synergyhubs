from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..access import Conn, ProjectAccess, User, is_teacher
from ..deletion import delete_project_for
from ..errors import SafeRoute, fails_with
from ..progress import recalculate_project_progress
from ..utils import iso_z

router = APIRouter(prefix="/api/projects/{projectId}", route_class=SafeRoute)


class MoveBody(BaseModel):
    classId: int | None = None


# Fetch single project details with dynamic progress
@router.get("", dependencies=[fails_with("Server error fetching project"), ProjectAccess])
async def get_project(projectId: int, conn: Conn):
    project = await conn.fetchrow("SELECT * FROM projects WHERE id = $1", projectId)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return {
        "id": project["id"],
        "classId": project["class_id"],
        "name": project["name"],
        "status": project["status"],
        "progress": await recalculate_project_progress(conn, projectId),
        "color": project["color"],
        "hue": project["hue"],
    }


# Delete the project for the calling student. Anyone else who has it keeps it; it is erased once
# nobody does.
@router.delete("", dependencies=[fails_with("Server error deleting project"), ProjectAccess])
async def delete_project(projectId: int, conn: Conn, user: User):
    if await is_teacher(conn, user.id):
        raise HTTPException(status_code=403, detail="Only students can delete projects")
    await delete_project_for(conn, projectId, user.id)
    return {"success": True}


# Record student project visit / click. A visit adds a class member to the team, unless they
# were removed from it.
@router.post("/visit", dependencies=[fails_with("Server error recording project visit"), ProjectAccess])
async def record_visit(projectId: int, conn: Conn, user: User):
    await conn.execute(
        """INSERT INTO project_members (project_id, user_id, roles, active_log, has_visited, last_visited_at, visit_count)
           SELECT $1, $2, ARRAY['Member'], 'Joined project workspace', TRUE, CURRENT_TIMESTAMP, 1
           WHERE NOT EXISTS (SELECT 1 FROM project_removals WHERE project_id = $1 AND user_id = $2)
           ON CONFLICT (project_id, user_id)
           DO UPDATE SET has_visited = TRUE, last_visited_at = CURRENT_TIMESTAMP,
                         visit_count = COALESCE(project_members.visit_count, 0) + 1""",
        projectId,
        user.id,
    )
    return {"success": True}


# File a project under another of the caller's classes (null: back to its own class, or "Shared" for
# a project shared with them). This only changes where the caller sees it; the project stays in its
# own class for everyone else.
@router.put("/class", dependencies=[fails_with("Server error moving project"), ProjectAccess])
async def move_project(projectId: int, body: MoveBody, conn: Conn, user: User):
    own_class_id = await conn.fetchval("SELECT class_id FROM projects WHERE id = $1", projectId)
    if body.classId is None or body.classId == own_class_id:
        await conn.execute(
            "DELETE FROM project_placements WHERE project_id = $1 AND user_id = $2", projectId, user.id
        )
        return {"success": True, "classId": body.classId}

    if not await conn.fetchval(
        "SELECT 1 FROM class_members WHERE class_id = $1 AND user_id = $2", body.classId, user.id
    ):
        raise HTTPException(status_code=403, detail="You are not a member of that class")

    await conn.execute(
        """INSERT INTO project_placements (project_id, user_id, class_id) VALUES ($1, $2, $3)
           ON CONFLICT (project_id, user_id) DO UPDATE SET class_id = EXCLUDED.class_id""",
        projectId,
        user.id,
        body.classId,
    )
    return {"success": True, "classId": body.classId}


# Fetch history of student updates & engagement for teacher view
@router.get(
    "/student-history", dependencies=[fails_with("Server error fetching student history"), ProjectAccess]
)
async def student_history(projectId: int, conn: Conn, user: User):
    if not await is_teacher(conn, user.id):
        raise HTTPException(status_code=403, detail="Only teachers can view student history")

    members = await conn.fetch(
        """SELECT u.id, u.name, u.email, u.avatar, pm.roles, pm.active_log,
                  COALESCE(pm.has_visited, FALSE) AS has_visited,
                  pm.last_visited_at,
                  COALESCE(pm.visit_count, 0) AS visit_count
           FROM project_members pm
           JOIN users u ON pm.user_id = u.id
           WHERE pm.project_id = $1 AND u.role = 'student'
           ORDER BY pm.has_visited DESC, pm.last_visited_at DESC NULLS LAST, u.name ASC""",
        projectId,
    )
    logs = await conn.fetch(
        """SELECT id, user_id, log_text, date, COALESCE(log_type, 'work_log') AS type, created_at
           FROM evaluation_logs
           WHERE project_id = $1
           ORDER BY id DESC""",
        projectId,
    )

    return [
        {
            "id": student["id"],
            "name": student["name"],
            "email": student["email"],
            "avatar": student["avatar"],
            "roles": student["roles"] or [],
            "activeLog": student["active_log"] or None,
            "hasVisited": student["has_visited"],
            "lastVisitedAt": iso_z(student["last_visited_at"]),
            "visitCount": student["visit_count"],
            "updates": [
                {
                    "id": log["id"],
                    "text": log["log_text"],
                    "date": log["date"],
                    "type": log["type"],
                    "createdAt": iso_z(log["created_at"]),
                }
                for log in logs
                if log["user_id"] == student["id"]
            ],
        }
        for student in members
    ]
