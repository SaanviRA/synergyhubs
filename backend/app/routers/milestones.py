from datetime import date as Date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..access import Conn, ProjectAccess, User
from ..errors import SafeRoute, fails_with
from ..progress import recalculate_project_progress
from ..utils import due_label, short_date, submitted_at_label

router = APIRouter(prefix="/api/projects/{projectId}/milestones", route_class=SafeRoute)

MILESTONE_STATUSES = ("pending", "in-progress", "completed", "delayed")

# Request field -> column, for partial updates
UPDATABLE_COLUMNS = {"status": "status", "title": "title", "details": "details", "date": "due_date"}


class MilestoneUpdateBody(BaseModel):
    status: str | None = None
    title: str | None = None
    details: str | None = None
    date: str | None = None
    # Changes the real due date (null: TBD) and with it the date label
    dueOn: Date | None = None


class MilestoneCreateBody(BaseModel):
    title: str | None = None
    details: str | None = None
    dueOn: Date | None = None


MAX_TITLE_LENGTH = 200


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


MILESTONE_COLUMNS = """id, title, details, due_date, due_on, status, assigned_to,
                       submission_file_name, submission_submitted_at, submission_file_url,
                       started_at, completed_at"""


def _iso(timestamp) -> str | None:
    return timestamp.isoformat() if timestamp else None


def _milestone(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "details": row["details"],
        "date": row["due_date"],
        "dueOn": row["due_on"].isoformat() if row["due_on"] else None,
        "status": row["status"],
        "assignee": row["assigned_to"],
        "startedAt": _iso(row["started_at"]),
        "completedAt": _iso(row["completed_at"]),
        "submission": {
            "fileName": row["submission_file_name"],
            "submittedAt": row["submission_submitted_at"],
            "fileUrl": row["submission_file_url"],
        }
        if row["submission_file_name"]
        else None,
    }


# Fetch a project's milestones in date order; undated (TBD) ones come last, oldest first
@router.get("", dependencies=[fails_with("Server error fetching milestones"), ProjectAccess])
async def get_milestones(projectId: int, conn: Conn):
    rows = await conn.fetch(
        f"""SELECT {MILESTONE_COLUMNS}
           FROM milestones
           WHERE project_id = $1
           ORDER BY due_on ASC NULLS LAST, id ASC""",
        projectId,
    )
    return [_milestone(row) for row in rows]


# Add an event to the timeline after the project was created. Any project member may do this.
@router.post("", status_code=201, dependencies=[fails_with("Server error adding milestone"), ProjectAccess])
async def create_milestone(projectId: int, body: MilestoneCreateBody, conn: Conn):
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Milestone title is required")
    if len(title) > MAX_TITLE_LENGTH:
        raise HTTPException(
            status_code=400, detail=f"Milestone titles can be at most {MAX_TITLE_LENGTH} characters"
        )

    row = await conn.fetchrow(
        f"""INSERT INTO milestones (project_id, title, details, due_date, due_on, status, assigned_to)
            VALUES ($1, $2, $3, $4, $5, 'pending', 'Everyone')
            RETURNING {MILESTONE_COLUMNS}""",
        projectId,
        title,
        (body.details or "").strip() or None,
        due_label(body.dueOn),
        body.dueOn,
    )
    progress = await recalculate_project_progress(conn, projectId)
    return {"milestone": _milestone(row), "progress": progress}


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

    # Stamp when the milestone moves to in-progress or completed. Re-sending the current status
    # keeps the original time; moving back clears the stamps of the later stages.
    # (SET expressions see the row's old status.)
    if "status" in body.model_fields_set:
        await conn.execute(
            """UPDATE milestones
               SET started_at = CASE
                       WHEN status = $1 THEN started_at
                       WHEN $1 = 'in-progress' THEN now()
                       WHEN $1 = 'pending' THEN NULL
                       ELSE started_at END,
                   completed_at = CASE
                       WHEN status = $1 THEN completed_at
                       WHEN $1 = 'completed' THEN now()
                       WHEN $1 IN ('pending', 'in-progress') THEN NULL
                       ELSE completed_at END
               WHERE id = $2 AND project_id = $3""",
            body.status,
            milestoneId,
            projectId,
        )

    # Only the fields present in the request are updated
    updates = {
        UPDATABLE_COLUMNS[field]: getattr(body, field)
        for field in UPDATABLE_COLUMNS
        if field in body.model_fields_set
    }
    if "dueOn" in body.model_fields_set:
        updates["due_on"] = body.dueOn
        updates["due_date"] = due_label(body.dueOn)
    if updates:
        set_clause = ", ".join(f"{column} = ${i}" for i, column in enumerate(updates, start=1))
        await conn.execute(
            f"UPDATE milestones SET {set_clause} WHERE id = ${len(updates) + 1} AND project_id = ${len(updates) + 2}",
            *updates.values(),
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

    stamps = await conn.fetchrow(
        "SELECT started_at, completed_at FROM milestones WHERE id = $1", milestoneId
    )
    return {
        "success": True,
        "progress": progress,
        "startedAt": _iso(stamps["started_at"]),
        "completedAt": _iso(stamps["completed_at"]),
    }


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
               completed_at = CASE WHEN status = 'completed' THEN completed_at ELSE now() END,
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
