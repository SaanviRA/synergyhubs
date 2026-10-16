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
    [
        ("GET", "/api/admin/users"),
        ("POST", "/api/admin/users/2/approve"),
        ("DELETE", "/api/admin/users/2"),
        ("GET", "/api/admin/settings"),
    ],
)
async def test_non_admins_are_refused(client, conn, method, path):
    res = await client.request(method, path, headers=auth(ALEX))
    assert (res.status_code, res.json()) == (403, {"error": "Admin access required"})
    assert await conn.fetchval("SELECT 1 FROM users WHERE id = 2")


async def test_profile_shows_admin_flag(client, admin):
    assert (await client.get("/api/users/me", headers=admin)).json()["is_admin"] is True


async def _set_auto_approve(client, headers, enabled, confirmation):
    return await client.put(
        "/api/admin/settings/auto-approve",
        json={"enabled": enabled, "confirmation": confirmation},
        headers=headers,
    )


async def test_auto_approve_is_off_by_default(client, admin):
    assert (await client.get("/api/admin/settings", headers=admin)).json() == {"autoApprove": False}


async def test_auto_approve_needs_the_matching_confirmation_word(client, admin):
    for enabled, word in [(True, None), (True, "enable"), (True, "DISABLE"), (False, "ENABLE"), (False, "")]:
        res = await _set_auto_approve(client, admin, enabled, word)
        expected = "ENABLE" if enabled else "DISABLE"
        assert (res.status_code, res.json()) == (400, {"error": f"Type {expected} to confirm"})
    assert (await client.get("/api/admin/settings", headers=admin)).json() == {"autoApprove": False}


async def test_auto_approve_approves_new_signups_until_turned_off(client, conn, admin):
    waiting_id = await _signup(client, conn, "early@example.com")

    res = await _set_auto_approve(client, admin, True, "ENABLE")
    assert res.json() == {"autoApprove": True}
    assert (await client.get("/api/admin/settings", headers=admin)).json() == {"autoApprove": True}
    assert await conn.fetchval("SELECT updated_by FROM app_settings") == MR_DAVIS["id"]

    res = await client.post(
        "/api/auth/signup", json={"name": "Quick Start", "email": "quick@example.com", "password": "password123"}
    )
    assert "token" in res.json()
    # Accounts that were already waiting are left for an admin to approve
    assert not await conn.fetchval("SELECT approved FROM users WHERE id = $1", waiting_id)

    # An invited placeholder signing up is a new account too
    await client.post("/api/projects/101/team/invite", json={"email": "ivy@example.com"}, headers=auth(ALEX))
    res = await client.post(
        "/api/auth/signup", json={"name": "Ivy", "email": "ivy@example.com", "password": "password123"}
    )
    assert "token" in res.json()

    res = await _set_auto_approve(client, admin, False, "DISABLE")
    assert res.json() == {"autoApprove": False}
    res = await client.post(
        "/api/auth/signup", json={"name": "Late", "email": "late@example.com", "password": "password123"}
    )
    assert res.json()["pending"] is True


async def test_non_admins_cannot_change_auto_approve(client, conn):
    res = await _set_auto_approve(client, auth(ALEX), True, "ENABLE")
    assert (res.status_code, res.json()) == (403, {"error": "Admin access required"})
    assert await conn.fetchval("SELECT COUNT(*) FROM app_settings") == 0
