from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from ..access import Conn, ProjectAccess, User, ensure_project_access
from ..errors import SafeRoute, fails_with
from ..moderation.flags import Moderation, flag_message
from ..utils import get_initials, today_label

router = APIRouter(prefix="/api", route_class=SafeRoute)

# Platforms a new workspace can be on. Older workspaces may also be 'figma', 'miro' or 'github'.
WORKSPACE_TYPES = ("drive", "canva", "microsoft", "other")


class WorkspaceBody(BaseModel):
    title: str | None = None
    type: str | None = None
    url: str | None = None


# Messages in workspace w.id that the caller ($2) has not read. Their own messages never count, nor
# do messages held by the safety check.
UNREAD = """(SELECT COUNT(*) FROM workspace_messages m
             LEFT JOIN workspace_reads r ON r.workspace_id = m.workspace_id AND r.user_id = $2
             WHERE m.workspace_id = w.id AND m.id > COALESCE(r.last_read_id, 0)
               AND m.user_id IS DISTINCT FROM $2 AND m.status = 'visible')"""


# Fetch workspaces, each with the caller's unread chat count
@router.get(
    "/projects/{projectId}/workspaces",
    dependencies=[fails_with("Server error fetching workspaces"), ProjectAccess],
)
async def get_workspaces(projectId: int, conn: Conn, user: User):
    rows = await conn.fetch(
        f"""SELECT w.id, w.title, w.type, w.url, w.creator, w.date, {UNREAD} AS unread
            FROM workspaces w WHERE w.project_id = $1 ORDER BY w.id DESC""",
        projectId,
        user.id,
    )
    return [dict(row) for row in rows]


# Total unread chat messages across the project's workspaces (for the Workspaces tab badge)
@router.get(
    "/projects/{projectId}/workspaces/unread",
    dependencies=[fails_with("Server error fetching unread messages"), ProjectAccess],
)
async def get_unread_total(projectId: int, conn: Conn, user: User):
    total = await conn.fetchval(
        f"SELECT COALESCE(SUM({UNREAD}), 0) FROM workspaces w WHERE w.project_id = $1",
        projectId,
        user.id,
    )
    return {"total": total}


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
           RETURNING id, title, type, url, creator, date, 0 AS unread""",
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
        f"""UPDATE workspaces w SET title = $1 WHERE id = $3
            RETURNING id, title, type, url, creator, date, {UNREAD} AS unread""",
        title,
        user.id,
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
    # Sent again after the "are you sure?" nudge, to post it anyway
    confirmed: bool = False


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
        # 'held' or 'removed' only ever reach the message's writer
        "status": row["status"],
    }


MESSAGE_COLUMNS = "m.id, m.user_id, m.author, u.avatar, m.body, m.status, m.created_at"


def seen_by(user_param: str) -> str:
    """Everyone sees visible messages; writers also see their own held and removed ones."""
    return f"(m.status = 'visible' OR m.user_id = {user_param})"


# Fetch messages, oldest first. With `after`, only messages newer than that ID (used for polling);
# without it, the latest page. Whatever is returned counts as read.
@router.get("/workspaces/{workspaceId}/messages", dependencies=[fails_with("Server error fetching messages")])
async def get_messages(workspaceId: int, conn: Conn, user: User, after: int = 0):
    await _ensure_workspace_access(conn, workspaceId, user.id)
    if after:
        rows = await conn.fetch(
            f"""SELECT {MESSAGE_COLUMNS} FROM workspace_messages m LEFT JOIN users u ON u.id = m.user_id
                WHERE m.workspace_id = $1 AND m.id > $2 AND {seen_by("$3")} ORDER BY m.id LIMIT $4""",
            workspaceId,
            after,
            user.id,
            MESSAGE_PAGE,
        )
    else:
        rows = await conn.fetch(
            f"""SELECT * FROM (
                    SELECT {MESSAGE_COLUMNS} FROM workspace_messages m LEFT JOIN users u ON u.id = m.user_id
                    WHERE m.workspace_id = $1 AND {seen_by("$2")} ORDER BY m.id DESC LIMIT $3
                ) latest ORDER BY id""",
            workspaceId,
            user.id,
            MESSAGE_PAGE,
        )
    if rows:
        await conn.execute(
            """INSERT INTO workspace_reads (workspace_id, user_id, last_read_id) VALUES ($1, $2, $3)
               ON CONFLICT (workspace_id, user_id)
               DO UPDATE SET last_read_id = GREATEST(workspace_reads.last_read_id, EXCLUDED.last_read_id)""",
            workspaceId,
            user.id,
            rows[-1]["id"],
        )
    return [_message(row, user.id) for row in rows]


# Post a message. It goes through the safety check first (see app/moderation):
#   allow    posted
#   review   not posted yet: {"nudge": true} asks the writer to think again. Sent again with
#            confirmed=true, it is posted and flagged for the class teacher.
#   block    saved as 'held': only the writer sees it until the teacher decides
#   escalate held like block, and admins get an urgent Discord alert
@router.post("/workspaces/{workspaceId}/messages", dependencies=[fails_with("Server error sending message")])
async def post_message(
    workspaceId: int,
    body: MessageBody,
    conn: Conn,
    user: User,
    moderator: Moderation,
    background: BackgroundTasks,
):
    await _ensure_workspace_access(conn, workspaceId, user.id)
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(text) > MAX_MESSAGE_LENGTH:
        raise HTTPException(
            status_code=400, detail=f"Messages can be at most {MAX_MESSAGE_LENGTH} characters"
        )

    # CPU-bound (a few milliseconds), so it runs off the event loop
    verdict = await run_in_threadpool(moderator.moderate, text)
    # A message that only mentions self-harm as a topic ("we read about suicide in health") is not
    # hurtful, so it is posted for a teacher to glance at without asking the writer to think again
    topic_only = verdict.categories == ["self_harm_mention"]
    if verdict.action == "review" and not body.confirmed and not topic_only:
        return {"nudge": True}

    status = "visible" if verdict.action in ("allow", "review") else "held"
    async with conn.transaction():
        message_id = await conn.fetchval(
            """INSERT INTO workspace_messages (workspace_id, user_id, author, body, status)
               VALUES ($1, $2, $3, $4, $5) RETURNING id""",
            workspaceId,
            user.id,
            user.name,
            text,
            status,
        )
        if verdict.action != "allow":
            await flag_message(conn, background, message_id, verdict, moderator.version)
    row = await conn.fetchrow(
        f"""SELECT {MESSAGE_COLUMNS} FROM workspace_messages m LEFT JOIN users u ON u.id = m.user_id
            WHERE m.id = $1""",
        message_id,
    )
    # The writer may be at risk: their chat shows where to get help
    return {**_message(row, user.id), "support": verdict.action == "escalate"}
