"""Flags raised by the safety check, and who reviews them.

A flag is reviewed by the teachers of the message's class: members of the class whose account is a
teacher account. A student who created a class owns it but never reviews classmates; when a class has
no teacher, admins review its flags instead.
"""

import json
from typing import Annotated

import asyncpg
from fastapi import BackgroundTasks, Depends, Request

from .. import notifications
from . import Moderator, RulesOnly, Verdict

# Reviewed flags (and messages a teacher removed) are kept this long, then deleted. Long enough to
# follow up on an incident or spot a pattern over a term; open flags stay until someone reviews them.
RETENTION_DAYS = 180


def _moderator(request: Request) -> Moderator | RulesOnly:
    return request.app.state.moderator


Moderation = Annotated[Moderator | RulesOnly, Depends(_moderator)]

# Teachers of class p.class_id
CLASS_TEACHERS = """SELECT 1 FROM class_members tm JOIN users t ON t.id = tm.user_id
                    WHERE tm.class_id = p.class_id AND t.role = 'teacher'"""

# Whether the user ($1) reviews flags in class p.class_id
REVIEWS_CLASS = f"""(EXISTS ({CLASS_TEACHERS} AND tm.user_id = $1)
                     OR (NOT EXISTS ({CLASS_TEACHERS})
                         AND (SELECT is_admin FROM users WHERE id = $1)))"""

# Joins a flag f to its message m, workspace w, project p and class c
FLAG_JOINS = """moderation_flags f
                JOIN workspace_messages m ON m.id = f.message_id
                JOIN workspaces w ON w.id = m.workspace_id
                JOIN projects p ON p.id = w.project_id
                JOIN classes c ON c.id = p.class_id"""


async def flag_message(
    conn: asyncpg.Connection,
    background: BackgroundTasks,
    message_id: int,
    verdict: Verdict,
    model_version: str,
) -> None:
    await conn.execute(
        """INSERT INTO moderation_flags (message_id, action, categories, scores, model_version)
           VALUES ($1, $2, $3, $4::jsonb, $5)""",
        message_id,
        verdict.action,
        verdict.categories,
        json.dumps(verdict.scores),
        model_version,
    )
    if verdict.action == "escalate":
        where = await conn.fetchrow(
            f"""SELECT c.name AS class_name, p.name AS project_name, EXISTS ({CLASS_TEACHERS}) AS has_teacher
                FROM workspace_messages m
                JOIN workspaces w ON w.id = m.workspace_id
                JOIN projects p ON p.id = w.project_id
                JOIN classes c ON c.id = p.class_id
                WHERE m.id = $1""",
            message_id,
        )
        await notifications.notify_safety(
            conn,
            background,
            notifications.safety_escalation(where["class_name"], where["project_name"], where["has_teacher"]),
        )


async def purge_expired(conn: asyncpg.Connection) -> None:
    """Deletes flags reviewed more than RETENTION_DAYS ago, and the messages that were removed."""
    async with conn.transaction():
        await conn.execute(
            """DELETE FROM workspace_messages m USING moderation_flags f
               WHERE f.message_id = m.id AND f.decision = 'removed'
                 AND f.reviewed_at < CURRENT_TIMESTAMP - make_interval(days => $1)""",
            RETENTION_DAYS,
        )
        await conn.execute(
            "DELETE FROM moderation_flags WHERE reviewed_at < CURRENT_TIMESTAMP - make_interval(days => $1)",
            RETENTION_DAYS,
        )
