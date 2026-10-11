import asyncpg

from .utils import progress_percent


async def recalculate_project_progress(conn: asyncpg.Connection, project_id: int) -> int:
    """Recalculate project progress from milestone completions and store it."""
    row = await conn.fetchrow(
        """SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'completed') AS completed
           FROM milestones WHERE project_id = $1""",
        project_id,
    )
    if not row["total"]:
        return 0
    progress = progress_percent(row["completed"], row["total"])
    await conn.execute("UPDATE projects SET progress = $1 WHERE id = $2", progress, project_id)
    return progress
