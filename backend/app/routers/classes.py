from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..access import Conn, User
from ..errors import SafeRoute, fails_with
from ..utils import generate_join_code, random_class_color

router = APIRouter(prefix="/api/classes", route_class=SafeRoute)

PROJECT_STATUSES = ("present", "past", "future")


class JoinBody(BaseModel):
    joinCode: str | None = None


class ClassBody(BaseModel):
    className: str | None = None


class TimelineItem(BaseModel):
    title: str | None = None
    details: str | None = None
    date: str | None = None


class ProjectBody(BaseModel):
    name: str | None = None
    status: str | None = None
    color: str | None = None
    hue: str | None = None
    timeline: list[TimelineItem] | None = None


@router.get("", dependencies=[fails_with("Server error fetching classes")])
async def list_classes(conn: Conn, user: User):
    classes = await conn.fetch(
        """SELECT c.*, cm.role AS member_role FROM classes c
           JOIN class_members cm ON c.id = cm.class_id
           WHERE cm.user_id = $1
           ORDER BY c.id ASC""",
        user.id,
    )
    class_ids = [cls["id"] for cls in classes]
    projects = await conn.fetch(
        "SELECT * FROM projects WHERE class_id = ANY($1::int[]) ORDER BY id ASC", class_ids
    )
    members = await conn.fetch(
        """SELECT class_id, COUNT(*) AS member_count FROM class_members
           WHERE class_id = ANY($1::int[]) GROUP BY class_id""",
        class_ids,
    )
    member_counts = {row["class_id"]: row["member_count"] for row in members}

    return [
        {
            "id": cls["id"],
            "name": cls["name"],
            "teacher": cls["teacher"],
            "joinCode": cls["join_code"],
            "color": cls["color"],
            "role": cls["member_role"],
            "members": member_counts.get(cls["id"], 0),
            "projects": [
                {key: p[key] for key in ("id", "name", "status", "progress", "color", "hue")}
                for p in projects
                if p["class_id"] == cls["id"]
            ],
        }
        for cls in classes
    ]


# Join a class using an invite code
@router.post("/join", dependencies=[fails_with("Server error joining class")])
async def join_class(body: JoinBody, conn: Conn, user: User):
    if not body.joinCode:
        raise HTTPException(status_code=400, detail="Join code is required")

    cls = await conn.fetchrow(
        "SELECT * FROM classes WHERE UPPER(join_code) = UPPER($1)", body.joinCode.strip()
    )
    if cls is None:
        raise HTTPException(status_code=404, detail="Class not found with that invite code")

    already_member = await conn.fetchval(
        "SELECT 1 FROM class_members WHERE class_id = $1 AND user_id = $2", cls["id"], user.id
    )
    if not already_member:
        async with conn.transaction():
            await conn.execute(
                "INSERT INTO class_members (class_id, user_id, role) VALUES ($1, $2, 'student') ON CONFLICT DO NOTHING",
                cls["id"],
                user.id,
            )
            # Also automatically assign them to a default project if one exists in this class
            project_id = await conn.fetchval(
                "SELECT id FROM projects WHERE class_id = $1 ORDER BY id ASC LIMIT 1", cls["id"]
            )
            if project_id is not None:
                await conn.execute(
                    """INSERT INTO project_members (project_id, user_id, roles, active_log)
                       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING""",
                    project_id,
                    user.id,
                    ["Collaborator"],
                    "Just joined the project!",
                )

    return {"success": True, "classId": cls["id"], "name": cls["name"]}


# Create a new class. The creator owns it: they hold the 'teacher' class role whatever their account role
@router.post("", dependencies=[fails_with("Server error creating class")])
async def create_class(body: ClassBody, conn: Conn, user: User):
    if not body.className or not body.className.strip():
        raise HTTPException(status_code=400, detail="Class name is required")

    creator_name = await conn.fetchval("SELECT name FROM users WHERE id = $1", user.id)
    if creator_name is None:
        raise HTTPException(status_code=404, detail="User not found")

    while True:
        join_code = generate_join_code()
        if not await conn.fetchval("SELECT id FROM classes WHERE UPPER(join_code) = UPPER($1)", join_code):
            break

    async with conn.transaction():
        new_class = await conn.fetchrow(
            "INSERT INTO classes (name, teacher, join_code, color) VALUES ($1, $2, $3, $4) RETURNING *",
            body.className.strip(),
            creator_name,
            join_code,
            random_class_color(),
        )
        await conn.execute(
            "INSERT INTO class_members (class_id, user_id, role) VALUES ($1, $2, 'teacher')",
            new_class["id"],
            user.id,
        )

    return {
        "success": True,
        "class": {"id": new_class["id"], "name": new_class["name"], "joinCode": new_class["join_code"]},
    }


# Create a new project under a class (class owner only)
@router.post(
    "/{classId}/projects", status_code=201, dependencies=[fails_with("Server error creating project")]
)
async def create_project(classId: int, body: ProjectBody, conn: Conn, user: User):
    if not body.name or not body.name.strip():
        raise HTTPException(status_code=400, detail="Project name is required")
    if body.status not in PROJECT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid project status")
    if not body.color or not body.hue:
        raise HTTPException(status_code=400, detail="Color and hue are required")

    member_role = await conn.fetchval(
        "SELECT role FROM class_members WHERE class_id = $1 AND user_id = $2", classId, user.id
    )
    if member_role is None:
        raise HTTPException(status_code=403, detail="You are not a member of this class")
    if member_role != "teacher":
        raise HTTPException(status_code=403, detail="Only the class owner can create projects")

    async with conn.transaction():
        project = await conn.fetchrow(
            """INSERT INTO projects (class_id, name, status, progress, color, hue)
               VALUES ($1, $2, $3, 0, $4, $5)
               RETURNING id, name, status, progress, color, hue""",
            classId,
            body.name.strip(),
            body.status,
            body.color,
            body.hue,
        )

        # Insert milestones/timeline if provided
        for milestone in body.timeline or []:
            if milestone.title and milestone.title.strip():
                await conn.execute(
                    """INSERT INTO milestones (project_id, title, details, due_date, status, assigned_to)
                       VALUES ($1, $2, $3, $4, 'pending', 'Everyone')""",
                    project["id"],
                    milestone.title.strip(),
                    milestone.details.strip() if milestone.details else None,
                    milestone.date or "TBD",
                )

        # Automatically assign all students of this class to this new project,
        # including a student who owns the class
        await conn.execute(
            """INSERT INTO project_members (project_id, user_id, roles, active_log)
               SELECT $1, cm.user_id, $3::text[], $4 FROM class_members cm
               JOIN users u ON u.id = cm.user_id
               WHERE cm.class_id = $2 AND (cm.role = 'student' OR u.role = 'student')
               ON CONFLICT DO NOTHING""",
            project["id"],
            classId,
            ["Collaborator"],
            "Just joined the project!",
        )

    return dict(project)
