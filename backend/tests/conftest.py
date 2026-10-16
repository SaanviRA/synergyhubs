"""Test setup.

API tests run against a real PostgreSQL database (`group_app_test`) in the project's Docker
container, which is started automatically if it is not running. The database is rebuilt from
schema.sql + migration.sql once per session; each test runs inside a transaction that is rolled back.
"""

import os
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
TEST_DB = "group_app_test"

# Must be set before the app is imported. The developer's .env is deliberately not read.
os.environ["ENV_FILE"] = os.devnull
os.environ["DB_NAME"] = TEST_DB
os.environ["JWT_SECRET"] = "unit-test-secret-0123456789abcdef0123456789abcdef"
os.environ["VITE_GOOGLE_CLIENT_ID"] = "test-client-id.apps.googleusercontent.com"
os.environ["CORS_ORIGINS"] = "http://localhost:5173"

import asyncpg
import httpx
import pytest

from app.config import get_settings
from app.db import get_conn
from app.main import app
from app.migrate import run_migration
from app.security import generate_token

# Users seeded by schema.sql
ALEX = {"id": 1, "name": "Alex M.", "email": "alex@school.edu"}  # student, class 1 + 2, project 101
SARAH = {"id": 2, "name": "Sarah K.", "email": "sarah@school.edu"}  # student, class 1 + 2, project 101
MR_DAVIS = {"id": 4, "name": "Mr. Davis", "email": "davis@school.edu"}  # teacher of class 1
MRS_SMITH = {"id": 5, "name": "Mrs. Smith", "email": "smith@school.edu"}  # teacher of class 2 only

PROJECT = 101  # 'Cold War Perspectives' in class 1, 4 milestones (1 completed)


def auth(user: dict) -> dict:
    return {"Authorization": f"Bearer {generate_token(user)}"}


def _connect(database: str):
    settings = get_settings()
    return asyncpg.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=database,
    )


@pytest.fixture(scope="session")
def docker_database():
    if not os.environ.get("SKIP_DOCKER_DB"):
        subprocess.run([str(REPO_ROOT / "scripts" / "ensure_db.sh")], check=True)


@pytest.fixture(scope="session")
async def database(docker_database):
    admin = await _connect("postgres")
    try:
        await admin.execute(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)")
        await admin.execute(f"CREATE DATABASE {TEST_DB}")
    finally:
        await admin.close()

    conn = await _connect(TEST_DB)
    await conn.execute((REPO_ROOT / "schema.sql").read_text())
    await run_migration(conn)
    yield conn
    await conn.close()


@pytest.fixture
async def conn(database):
    transaction = database.transaction()
    await transaction.start()
    yield database
    await transaction.rollback()


@pytest.fixture
async def client(conn):
    async def override_get_conn():
        yield conn

    app.dependency_overrides[get_conn] = override_get_conn
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client
    app.dependency_overrides.clear()


@pytest.fixture
async def outsider(client, conn):
    """A freshly registered (and approved) student who belongs to no class or project."""
    account = {"email": "olive@example.com", "password": "password123"}
    res = await client.post("/api/auth/signup", json={"name": "Olive Outsider", **account})
    assert res.status_code == 201
    await conn.execute("UPDATE users SET approved = TRUE WHERE email = $1", account["email"])
    res = await client.post("/api/auth/login", json=account)
    return {"Authorization": f"Bearer {res.json()['token']}"}
