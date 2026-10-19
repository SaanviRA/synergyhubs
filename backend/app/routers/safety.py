"""Review queue for chat messages flagged by the safety check (see app/moderation)."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..access import Conn, User
from ..errors import SafeRoute, fails_with
from ..moderation.flags import FLAG_JOINS, RETENTION_DAYS, REVIEWS_CLASS, purge_expired
from ..utils import iso_z

router = APIRouter(prefix="/api/safety", route_class=SafeRoute)

# What each decision does to the message
DECISIONS = {
    "approved": "visible",  # fine after all: everyone sees it
    "false_positive": "visible",  # the check got it wrong: everyone sees it
    "removed": "removed",  # only the writer still sees it, marked as removed
}

# Earlier messages shown with a flag so the reviewer can see what it was replying to
CONTEXT_MESSAGES = 3


class ReviewBody(BaseModel):
    decision: str | None = None


# Open flags the caller reviews: escalations first, then held messages, then the rest, oldest first
@router.get("/flags", dependencies=[fails_with("Server error fetching flagged messages")])
async def list_flags(conn: Conn, user: User):
    await purge_expired(conn)
    rows = await conn.fetch(
        f"""SELECT f.id, f.action, f.categories, f.created_at, m.id AS message_id, m.body, m.author,
                   m.status, m.workspace_id, m.user_id AS writer_id, w.title AS workspace_title,
                   p.name AS project_name, c.name AS class_name,
                   (SELECT COUNT(*) FROM moderation_flags pf
                    JOIN workspace_messages pm ON pm.id = pf.message_id
                    WHERE pm.user_id = m.user_id AND pf.id <> f.id
                      AND pf.created_at > CURRENT_TIMESTAMP - make_interval(days => $2)) AS other_flags
            FROM {FLAG_JOINS}
            WHERE f.reviewed_at IS NULL AND {REVIEWS_CLASS}
            ORDER BY CASE f.action WHEN 'escalate' THEN 0 WHEN 'block' THEN 1 ELSE 2 END, f.created_at""",
        user.id,
        RETENTION_DAYS,
    )

    flags = []
    for row in rows:
        context = await conn.fetch(
            """SELECT author, body, created_at FROM (
                   SELECT id, author, body, created_at FROM workspace_messages
                   WHERE workspace_id = $1 AND id < $2 AND status = 'visible'
                   ORDER BY id DESC LIMIT $3
               ) earlier ORDER BY id""",
            row["workspace_id"],
            row["message_id"],
            CONTEXT_MESSAGES,
        )
        flags.append(
            {
                "id": row["id"],
                "action": row["action"],
                "categories": row["categories"],
                "createdAt": iso_z(row["created_at"]),
                "message": {
                    "id": row["message_id"],
                    "author": row["author"],
                    "text": row["body"],
                    "status": row["status"],
                },
                # The writer's other flags in the last RETENTION_DAYS: a pattern matters more than one message
                "otherFlags": row["other_flags"] if row["writer_id"] is not None else 0,
                "className": row["class_name"],
                "projectName": row["project_name"],
                "workspaceTitle": row["workspace_title"],
                "context": [
                    {"author": c["author"], "text": c["body"], "createdAt": iso_z(c["created_at"])}
                    for c in context
                ],
            }
        )
    return flags


@router.post("/flags/{flagId}/review", dependencies=[fails_with("Server error reviewing flagged message")])
async def review_flag(flagId: int, body: ReviewBody, conn: Conn, user: User):
    if body.decision not in DECISIONS:
        raise HTTPException(status_code=400, detail="Decision must be approved, removed or false_positive")

    flag = await conn.fetchrow(
        f"""SELECT f.message_id, f.reviewed_at, {REVIEWS_CLASS} AS allowed
            FROM {FLAG_JOINS} WHERE f.id = $2""",
        user.id,
        flagId,
    )
    # Someone who does not review the class is not told the flag exists
    if flag is None or not flag["allowed"]:
        raise HTTPException(status_code=404, detail="Flagged message not found")
    if flag["reviewed_at"] is not None:
        raise HTTPException(status_code=409, detail="This message has already been reviewed")

    async with conn.transaction():
        await conn.execute(
            """UPDATE moderation_flags SET decision = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP
               WHERE id = $3""",
            body.decision,
            user.id,
            flagId,
        )
        await conn.execute(
            "UPDATE workspace_messages SET status = $1 WHERE id = $2",
            DECISIONS[body.decision],
            flag["message_id"],
        )
    return {"success": True, "status": DECISIONS[body.decision]}
