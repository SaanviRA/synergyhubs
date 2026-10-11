from fastapi import APIRouter, HTTPException

from ..access import Conn, ProjectAccess, User, is_teacher
from ..errors import SafeRoute, fails_with
from ..progress import recalculate_project_progress
from ..utils import iso_z

router = APIRouter(prefix="/api/projects/{projectId}", route_class=SafeRoute)


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


# Record student project visit / click
@router.post("/visit", dependencies=[fails_with("Server error recording project visit"), ProjectAccess])
async def record_visit(projectId: int, conn: Conn, user: User):
    await conn.execute(
        """INSERT INTO project_members (project_id, user_id, roles, active_log, has_visited, last_visited_at, visit_count)
           VALUES ($1, $2, ARRAY['Member'], 'Joined project workspace', TRUE, CURRENT_TIMESTAMP, 1)
           ON CONFLICT (project_id, user_id)
           DO UPDATE SET has_visited = TRUE, last_visited_at = CURRENT_TIMESTAMP,
                         visit_count = COALESCE(project_members.visit_count, 0) + 1""",
        projectId,
        user.id,
    )
    return {"success": True}


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
