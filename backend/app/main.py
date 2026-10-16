import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import create_pool
from .errors import register_error_handlers
from .access import active_user
from .routers import admin, auth, classes, milestones, projects, resources, team, users, workspaces

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fails fast on a missing or weak JWT_SECRET
    app.state.pool = await create_pool(get_settings())
    yield
    await app.state.pool.close()


def create_app() -> FastAPI:
    app = FastAPI(title="Group App API", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(get_settings().cors_origins),
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)

    @app.get("/api/health")
    async def health():
        return {"status": "ok"}

    app.include_router(auth.router)
    # Everything outside /api/auth requires a valid token for an approved account
    for module in (users, classes, projects, team, milestones, resources, workspaces, admin):
        app.include_router(module.router, dependencies=[Depends(active_user)])

    return app


app = create_app()
