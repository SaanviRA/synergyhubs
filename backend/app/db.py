import asyncpg
from fastapi import Request

from .config import Settings


async def create_pool(settings: Settings) -> asyncpg.Pool:
    return await asyncpg.create_pool(
        host=settings.db_host,
        port=settings.db_port,
        database=settings.db_name,
        user=settings.db_user,
        password=settings.db_password,
        min_size=1,
        max_size=10,
    )


async def get_conn(request: Request):
    async with request.app.state.pool.acquire() as conn:
        yield conn
