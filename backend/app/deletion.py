"""Students deleting projects and classes.

Deleting only takes the project or class away from the student who deletes it. Teammates who still
have a project keep it; it is erased once nobody has it any more, and a class goes with its last
member and project.
"""

import asyncpg

# Someone still has project $1: they are on its team, or in its class and have not deleted it
PROJECT_IN_USE = """EXISTS (SELECT 1 FROM project_members WHERE project_id = $1)
    OR EXISTS (SELECT 1 FROM projects p
               JOIN class_members cm ON cm.class_id = p.class_id
               WHERE p.id = $1 AND NOT EXISTS (SELECT 1 FROM project_deletions d
                                               WHERE d.project_id = p.id AND d.user_id = cm.user_id))"""


async def delete_project_for(conn: asyncpg.Connection, project_id: int, user_id: int) -> None:
    async with conn.transaction():
        for table in ("project_members", "project_placements"):
            await conn.execute(
                f"DELETE FROM {table} WHERE project_id = $1 AND user_id = $2", project_id, user_id
            )
        await conn.execute(
            "INSERT INTO project_deletions (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            project_id,
            user_id,
        )
        class_id = await conn.fetchval(
            f"DELETE FROM projects WHERE id = $1 AND NOT ({PROJECT_IN_USE}) RETURNING class_id", project_id
        )
        if class_id is not None:
            await _erase_class_if_unused(conn, class_id)


async def delete_class_for(conn: asyncpg.Connection, class_id: int, user_id: int) -> None:
    """Leaves the class and deletes every project the student sees in it: the class's own
    projects and any other projects they filed under it."""
    async with conn.transaction():
        await conn.execute(
            "DELETE FROM class_members WHERE class_id = $1 AND user_id = $2", class_id, user_id
        )
        project_ids = await conn.fetch(
            """SELECT id FROM projects WHERE class_id = $1
               UNION
               SELECT project_id FROM project_placements WHERE user_id = $2 AND class_id = $1""",
            class_id,
            user_id,
        )
        for row in project_ids:
            await delete_project_for(conn, row["id"], user_id)
        await _erase_class_if_unused(conn, class_id)


async def _erase_class_if_unused(conn: asyncpg.Connection, class_id: int) -> None:
    # Projects shared with people outside the class keep it in place until they are gone too
    await conn.execute(
        """DELETE FROM classes c WHERE c.id = $1
           AND NOT EXISTS (SELECT 1 FROM class_members WHERE class_id = c.id)
           AND NOT EXISTS (SELECT 1 FROM projects WHERE class_id = c.id)""",
        class_id,
    )
