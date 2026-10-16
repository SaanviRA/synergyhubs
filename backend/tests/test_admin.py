import pytest

from .conftest import ALEX, MR_DAVIS, SARAH, auth


@pytest.fixture
async def admin(conn):
    await conn.execute("UPDATE users SET is_admin = TRUE WHERE id = $1", MR_DAVIS["id"])
    return auth(MR_DAVIS)


async def _signup(client, conn, email):
    await client.post("/api/auth/signup", json={"name": "Pat Pending", "email": email, "password": "password123"})
    return await conn.fetchval("SELECT id FROM users WHERE email = $1", email)


async def test_admin_lists_pending_accounts_first(client, conn, admin):
    pending_id = await _signup(client, conn, "pat@example.com")
    await client.post("/api/projects/101/team/invite", json={"email": "ivy@example.com"}, headers=auth(ALEX))

    users = (await client.get("/api/admin/users", headers=admin)).json()
    assert [(u["email"], u["approved"], u["signIn"]) for u in users[:2]] == [
        ("ivy@example.com", False, "invited"),
        ("pat@example.com", False, "password"),
    ]
    assert users[1] == {
        "id": pending_id,
        "name": "Pat Pending",
        "email": "pat@example.com",
        "role": "student",
        "approved": False,
        "isAdmin": False,
        "signIn": "password",
        "createdAt": users[1]["createdAt"],
    }
    davis = next(u for u in users if u["id"] == MR_DAVIS["id"])
    assert davis["approved"] and davis["isAdmin"]


async def test_admin_approves_an_account(client, conn, admin):
    pending_id = await _signup(client, conn, "pat@example.com")
    res = await client.post(f"/api/admin/users/{pending_id}/approve", headers=admin)
    assert res.json() == {"success": True}

    login = await client.post("/api/auth/login", json={"email": "pat@example.com", "password": "password123"})
    assert "token" in login.json()

    res = await client.post("/api/admin/users/99999/approve", headers=admin)
    assert (res.status_code, res.json()) == (404, {"error": "User not found"})


async def test_admin_deletes_an_account_and_its_memberships(client, conn, admin):
    res = await client.delete(f"/api/admin/users/{SARAH['id']}", headers=admin)
    assert res.json() == {"success": True}
    assert not await conn.fetchval("SELECT 1 FROM users WHERE id = $1", SARAH["id"])
    assert not await conn.fetchval("SELECT 1 FROM project_members WHERE user_id = $1", SARAH["id"])
    team = (await client.get("/api/projects/101/team", headers=auth(ALEX))).json()
    assert SARAH["id"] not in [m["id"] for m in team]


async def test_admin_cannot_delete_themselves_or_another_admin(client, conn, admin):
    res = await client.delete(f"/api/admin/users/{MR_DAVIS['id']}", headers=admin)
    assert (res.status_code, res.json()) == (400, {"error": "You cannot delete your own account"})

    await conn.execute("UPDATE users SET is_admin = TRUE WHERE id = $1", ALEX["id"])
    res = await client.delete(f"/api/admin/users/{ALEX['id']}", headers=admin)
    assert (res.status_code, res.json()) == (400, {"error": "Admin accounts cannot be deleted here"})

    res = await client.delete("/api/admin/users/99999", headers=admin)
    assert res.status_code == 404


@pytest.mark.parametrize(
    ("method", "path"),
    [("GET", "/api/admin/users"), ("POST", "/api/admin/users/2/approve"), ("DELETE", "/api/admin/users/2")],
)
async def test_non_admins_are_refused(client, conn, method, path):
    res = await client.request(method, path, headers=auth(ALEX))
    assert (res.status_code, res.json()) == (403, {"error": "Admin access required"})
    assert await conn.fetchval("SELECT 1 FROM users WHERE id = 2")


async def test_profile_shows_admin_flag(client, admin):
    assert (await client.get("/api/users/me", headers=admin)).json()["is_admin"] is True
