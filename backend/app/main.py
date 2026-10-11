import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import create_pool
from .errors import register_error_handlers
from .routers import auth, classes, milestones, projects, resources, team, users, workspaces
from .security import current_user

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
    # Everything outside /api/auth requires a valid token
    for module in (users, classes, projects, team, milestones, resources, workspaces):
        app.include_router(module.router, dependencies=[Depends(current_user)])

    return app


app = create_app()
