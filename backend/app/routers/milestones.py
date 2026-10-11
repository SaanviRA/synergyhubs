from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..access import Conn, ProjectAccess, User
from ..errors import SafeRoute, fails_with
from ..progress import recalculate_project_progress
from ..utils import short_date, submitted_at_label

router = APIRouter(prefix="/api/projects/{projectId}/milestones", route_class=SafeRoute)

MILESTONE_STATUSES = ("pending", "in-progress", "completed", "delayed")

# Request field -> column, for partial updates
UPDATABLE_COLUMNS = {"status": "status", "title": "title", "details": "details", "date": "due_date"}


class MilestoneUpdateBody(BaseModel):
    status: str | None = None
    title: str | None = None
    details: str | None = None
    date: str | None = None


class SubmissionBody(BaseModel):
    fileName: str | None = None
    fileUrl: str | None = None


async def _milestone_title(conn, project_id: int, milestone_id: int) -> str:
    title = await conn.fetchval(
        "SELECT title FROM milestones WHERE id = $1 AND project_id = $2", milestone_id, project_id
    )
    if title is None:
        raise HTTPException(status_code=404, detail="Milestone not found")
    return title


# Fetch milestones for a project
@router.get("", dependencies=[fails_with("Server error fetching milestones"), ProjectAccess])
async def get_milestones(projectId: int, conn: Conn):
    rows = await conn.fetch(
        """SELECT id, title, details, due_date, status, assigned_to,
                  submission_file_name, submission_submitted_at, submission_file_url
           FROM milestones
           WHERE project_id = $1
           ORDER BY id ASC""",
        projectId,
    )
    return [
        {
            "id": row["id"],
            "title": row["title"],
            "details": row["details"],
            "date": row["due_date"],
            "status": row["status"],
            "assignee": row["assigned_to"],
            "submission": {
                "fileName": row["submission_file_name"],
                "submittedAt": row["submission_submitted_at"],
                "fileUrl": row["submission_file_url"],
            }
            if row["submission_file_name"]
            else None,
        }
        for row in rows
    ]


# Update a milestone (status, title, details, date) and recalculate project progress
@router.patch("/{milestoneId}", dependencies=[fails_with("Server error updating milestone"), ProjectAccess])
async def update_milestone(
    projectId: int, milestoneId: int, body: MilestoneUpdateBody, conn: Conn, user: User
):
    if "status" in body.model_fields_set and body.status not in MILESTONE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid milestone status")
    if "title" in body.model_fields_set and not (body.title or "").strip():
        raise HTTPException(status_code=400, detail="Milestone title is required")
    if "date" in body.model_fields_set and not body.date:
        raise HTTPException(status_code=400, detail="Milestone date is required")

    title = await _milestone_title(conn, projectId, milestoneId)

    # Only the fields present in the request are updated
    fields = [field for field in UPDATABLE_COLUMNS if field in body.model_fields_set]
    if fields:
        set_clause = ", ".join(
            f"{UPDATABLE_COLUMNS[field]} = ${i}" for i, field in enumerate(fields, start=1)
        )
        await conn.execute(
            f"UPDATE milestones SET {set_clause} WHERE id = ${len(fields) + 1} AND project_id = ${len(fields) + 2}",
            *(getattr(body, field) for field in fields),
            milestoneId,
            projectId,
        )

    progress = await recalculate_project_progress(conn, projectId)

    # If status changed to completed, record an update in evaluation_logs
    if body.status == "completed":
        title = body.title if "title" in body.model_fields_set else title
        await conn.execute(
            """INSERT INTO evaluation_logs (project_id, user_id, log_text, date, log_type)
               VALUES ($1, $2, $3, $4, 'milestone_completed')""",
            projectId,
            user.id,
            f'Completed milestone "{title}"',
            short_date(),
        )

    return {"success": True, "progress": progress}


# Submit work for a milestone
@router.post(
    "/{milestoneId}/submit",
    dependencies=[fails_with("Server error submitting milestone work"), ProjectAccess],
)
async def submit_milestone(projectId: int, milestoneId: int, body: SubmissionBody, conn: Conn, user: User):
    title = await _milestone_title(conn, projectId, milestoneId)
    submitted_at = submitted_at_label()

    await conn.execute(
        """UPDATE milestones
           SET status = 'completed',
               submission_file_name = $1,
               submission_submitted_at = $2,
               submission_file_url = $3
           WHERE id = $4 AND project_id = $5""",
        body.fileName or "Submission.pdf",
        submitted_at,
        body.fileUrl or None,
        milestoneId,
        projectId,
    )

    progress = await recalculate_project_progress(conn, projectId)

    # Log the submission in evaluation_logs for history
    await conn.execute(
        """INSERT INTO evaluation_logs (project_id, user_id, log_text, date, log_type)
           VALUES ($1, $2, $3, $4, 'submission')""",
        projectId,
        user.id,
        f'Submitted work for "{title}": {body.fileName or "Document"}',
        submitted_at,
    )

    return {
        "success": True,
        "fileName": body.fileName,
        "fileUrl": body.fileUrl,
        "submittedAt": submitted_at,
        "progress": progress,
    }
