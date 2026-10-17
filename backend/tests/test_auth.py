import pytest

from app.routers import auth as auth_router

from app.access import PENDING_APPROVAL

from .conftest import ALEX, auth

SIGNUP = {"name": "Nina New", "email": "  Nina@Example.com ", "password": "password123"}


async def test_health_is_public(client):
    res = await client.get("/api/health")
    assert res.status_code == 200 and res.json() == {"status": "ok"}


PENDING = {"pending": True, "message": PENDING_APPROVAL}


async def test_signup_waits_for_approval_then_login(client, conn):
    res = await client.post("/api/auth/signup", json=SIGNUP)
    assert (res.status_code, res.json()) == (201, PENDING)

    # Until an admin approves the account, logging in hands out no token
    credentials = {"email": "NINA@example.com", "password": "password123"}
    res = await client.post("/api/auth/login", json=credentials)
    assert (res.status_code, res.json()) == (200, PENDING)
    # A wrong password is still just wrong, without revealing the account is pending
    res = await client.post("/api/auth/login", json={**credentials, "password": "wrong-password"})
    assert res.status_code == 401

    await conn.execute("UPDATE users SET approved = TRUE WHERE email = 'nina@example.com'")
    res = await client.post("/api/auth/login", json=credentials)
    assert res.status_code == 200
    user = res.json()["user"]
    assert user == {
        "id": user["id"],
        "name": "Nina New",
        "email": "nina@example.com",
        "avatar": "NN",
        "role": "student",
    }

    me = await client.get("/api/users/me", headers={"Authorization": f"Bearer {res.json()['token']}"})
    assert me.status_code == 200
    assert me.json() == {**user, "is_me": False, "is_admin": False, "school": None, "academic_year": None}


async def test_tokens_stop_working_once_an_account_is_unapproved_or_deleted(client, conn):
    await conn.execute("UPDATE users SET approved = FALSE WHERE id = $1", ALEX["id"])
    res = await client.get("/api/classes", headers=auth(ALEX))
    assert (res.status_code, res.json()) == (403, {"error": PENDING_APPROVAL})

    await conn.execute("DELETE FROM users WHERE id = $1", ALEX["id"])
    res = await client.get("/api/classes", headers=auth(ALEX))
    assert (res.status_code, res.json()) == (401, {"error": "Your account no longer exists"})


@pytest.mark.parametrize(
    ("body", "status", "error"),
    [
        ({"email": "a@b.co", "password": "password123"}, 400, "All fields are required"),
        ({**SIGNUP, "password": "short"}, 400, "Password must be at least 8 characters"),
        ({**SIGNUP, "role": "admin"}, 400, "Invalid role"),
        ({**SIGNUP, "email": ALEX["email"]}, 409, "An account with this email already exists as a student"),
        ({**SIGNUP, "name": 42}, 400, "Invalid request"),
    ],
)
async def test_signup_validation(client, body, status, error):
    res = await client.post("/api/auth/signup", json=body)
    assert (res.status_code, res.json()) == (status, {"error": error})


async def test_same_email_can_register_once_per_role(client, conn):
    res = await client.post("/api/auth/signup", json={**SIGNUP, "email": ALEX["email"], "role": "teacher"})
    assert res.status_code == 201
    roles = await conn.fetch("SELECT role FROM users WHERE email = $1 ORDER BY id", ALEX["email"])
    assert [r["role"] for r in roles] == ["student", "teacher"]



async def test_invited_email_can_sign_up_and_keeps_the_invited_project(client, conn):
    await client.post("/api/projects/101/team/invite", json={"email": "nina@example.com"}, headers=auth(ALEX))
    invited_id = await conn.fetchval("SELECT id FROM users WHERE email = 'nina@example.com'")

    res = await client.post("/api/auth/signup", json=SIGNUP)
    assert (res.status_code, res.json()) == (201, PENDING)
    account = await conn.fetchrow("SELECT * FROM users WHERE email = 'nina@example.com'")
    assert (account["id"], account["name"], account["avatar"], account["approved"]) == (
        invited_id,
        "Nina New",
        "NN",
        False,
    )
    assert await conn.fetchval("SELECT 1 FROM project_members WHERE project_id = 101 AND user_id = $1", invited_id)

    # Once claimed, the email is taken like any other
    res = await client.post("/api/auth/signup", json=SIGNUP)
    assert (res.status_code, res.json()) == (409, {"error": "An account with this email already exists as a student"})

    await conn.execute("UPDATE users SET approved = TRUE WHERE id = $1", invited_id)
    res = await client.post("/api/auth/login", json={"email": "nina@example.com", "password": "password123"})
    assert res.json()["user"]["id"] == invited_id

async def test_login_failures(client):
    await client.post("/api/auth/signup", json=SIGNUP)
    cases = [
        ({"email": "nina@example.com"}, 400, "Email and password are required"),
        ({"email": "nina@example.com", "password": "wrong-password"}, 401, "Invalid credentials"),
        ({"email": "nobody@example.com", "password": "password123"}, 401, "Invalid credentials"),
        # Registered as a student, so the teacher login must not find the account
        (
            {"email": "nina@example.com", "password": "password123", "role": "teacher"},
            401,
            "Invalid credentials",
        ),
    ]
    for body, status, error in cases:
        res = await client.post("/api/auth/login", json=body)
        assert (res.status_code, res.json()) == (status, {"error": error})


async def test_malformed_json_body_returns_error_shape(client):
    res = await client.post(
        "/api/auth/login", content="{not json", headers={"Content-Type": "application/json"}
    )
    assert (res.status_code, res.json()) == (400, {"error": "Invalid request"})


async def test_unknown_route_returns_error_shape(client):
    res = await client.get("/api/nope", headers=auth(ALEX))
    assert (res.status_code, res.json()) == (404, {"error": "Not Found"})


def _google_payload(**overrides):
    payload = {
        "sub": "google-123",
        "email": "Gina@Example.com",
        "name": "Gina Google",
        "picture": "https://example.com/gina.png",
        "email_verified": True,
    }
    return {**payload, **overrides}


async def test_google_login_creates_then_reuses_the_account(client, conn, monkeypatch):
    seen = {}

    def fake_verify(token, client_id):
        seen.update(token=token, client_id=client_id)
        return _google_payload()

    monkeypatch.setattr(auth_router, "verify_google_token", fake_verify)

    # A new Google account also waits for approval
    first = await client.post("/api/auth/google", json={"idToken": "tok", "role": "teacher"})
    assert (first.status_code, first.json()) == (200, PENDING)
    # The token audience is always pinned to our client ID
    assert seen == {"token": "tok", "client_id": "test-client-id.apps.googleusercontent.com"}

    await conn.execute("UPDATE users SET approved = TRUE WHERE google_id = 'google-123'")
    second = await client.post("/api/auth/google", json={"idToken": "tok", "role": "teacher"})
    assert second.json()["user"]["email"] == "gina@example.com"
    assert second.json()["user"]["role"] == "teacher"
    assert "token" in second.json()
    assert await conn.fetchval("SELECT COUNT(*) FROM users WHERE google_id = 'google-123'") == 1


async def test_google_login_links_an_existing_password_account(client, conn, monkeypatch):
    monkeypatch.setattr(
        auth_router, "verify_google_token", lambda token, client_id: _google_payload(email=ALEX["email"])
    )
    res = await client.post("/api/auth/google", json={"idToken": "tok"})
    assert res.status_code == 200
    assert res.json()["user"]["id"] == ALEX["id"]
    assert await conn.fetchval("SELECT google_id FROM users WHERE id = $1", ALEX["id"]) == "google-123"


async def test_google_login_rejections(client, conn, monkeypatch):
    invalid = {"error": "Invalid Google signature or token"}

    res = await client.post("/api/auth/google", json={})
    assert (res.status_code, res.json()) == (400, {"error": "Google ID Token is required"})

    def bad_signature(token, client_id):
        raise ValueError("Wrong signature")

    monkeypatch.setattr(auth_router, "verify_google_token", bad_signature)
    res = await client.post("/api/auth/google", json={"idToken": "forged"})
    assert (res.status_code, res.json()) == (400, invalid)

    # An unverified Google email must not be able to take over an existing account
    monkeypatch.setattr(
        auth_router,
        "verify_google_token",
        lambda token, client_id: _google_payload(email=ALEX["email"], email_verified=False),
    )
    res = await client.post("/api/auth/google", json={"idToken": "tok"})
    assert (res.status_code, res.json()) == (400, invalid)
    assert await conn.fetchval("SELECT google_id FROM users WHERE id = $1", ALEX["id"]) is None


async def test_google_login_refused_when_client_id_is_not_configured(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("VITE_GOOGLE_CLIENT_ID", "")
    get_settings.cache_clear()
    try:
        monkeypatch.setattr(auth_router, "verify_google_token", lambda token, client_id: _google_payload())
        res = await client.post("/api/auth/google", json={"idToken": "tok"})
        assert res.status_code == 400
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


async def test_cors_only_allows_configured_origins(client):
    allowed = await client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    blocked = await client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in blocked.headers


async def test_browser_preflight_for_an_authenticated_request_is_answered_without_a_token(client):
    res = await client.options(
        "/api/users/me",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "authorization" in res.headers["access-control-allow-headers"].lower()


async def test_error_responses_still_carry_cors_headers(client):
    res = await client.get("/api/users/me", headers={"Origin": "http://localhost:5173"})
    assert res.status_code == 401
    assert res.headers["access-control-allow-origin"] == "http://localhost:5173"


async def test_google_signup_is_approved_when_auto_approve_is_on(client, conn, monkeypatch):
    monkeypatch.setattr(auth_router, "verify_google_token", lambda token, client_id: _google_payload())
    await conn.execute("INSERT INTO app_settings (key, value) VALUES ('auto_approve_signups', TRUE)")
    res = await client.post("/api/auth/google", json={"idToken": "tok", "role": "teacher"})
    assert "token" in res.json()
