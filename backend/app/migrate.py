"""Apply migration.sql to the configured database. Safe to re-run: `uv run python -m app.migrate`."""

import asyncio
import os
import sys
from pathlib import Path

import asyncpg

from .config import REPO_ROOT, get_settings


def migration_path() -> Path:
    return Path(os.environ.get("MIGRATION_FILE") or REPO_ROOT / "migration.sql")


async def run_migration(conn: asyncpg.Connection) -> None:
    await conn.execute(migration_path().read_text())


async def main() -> int:
    path = migration_path()
    if not path.exists():
        print(f"Migration file not found at {path}", file=sys.stderr)
        return 1

    settings = get_settings()
    conn = await asyncpg.connect(
        host=settings.db_host,
        port=settings.db_port,
        database=settings.db_name,
        user=settings.db_user,
        password=settings.db_password,
    )
    try:
        print(f"Applying {path} to {settings.db_name}...")
        await run_migration(conn)
    finally:
        await conn.close()
    print("Migration executed successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
