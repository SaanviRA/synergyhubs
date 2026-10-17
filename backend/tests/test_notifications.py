import pytest

from app import notifications
from app.routers import auth as auth_router

from .conftest import ALEX, MR_DAVIS, MRS_SMITH, SARAH, auth

DAVIS_HOOK = "https://discord.com/api/webhooks/111/davis-token"
SMITH_HOOK = "https://discord.com/api/webhooks/222/smith-token"


@pytest.fixture
def sent(monkeypatch):
    """Every Discord message as (webhook URL, content), instead of posting it."""
    messages = []

    async def fake_send(url, content):
        messages.append((url, content))

    monkeypatch.setattr(notifications, "send", fake_send)
    return messages


@pytest.fixture
async def admin(conn):
    await conn.execute("UPDATE users SET is_admin = TRUE WHERE id = $1", MR_DAVIS["id"])
    return auth(MR_DAVIS)


async def _save(client, headers, url, events):
    return await client.put(
        "/api/admin/notifications", json={"webhookUrl": url, "events": events}, headers=headers
    )


async def _signup(client, email, name="Pat New"):
    return await client.post(
        "/api/auth/signup", json={"name": name, "email": email, "password": "password123"}
    )


NO_WEBHOOK = {"webhookUrl": None, "redactedUrl": None, "verified": False, "events": ["user_added"]}
REDACTED = "https://discord.com/••••••••"


async def test_settings_default_to_user_added_until_saved(client, admin):
    res = await client.get("/api/admin/notifications", headers=admin)
    assert res.json() == NO_WEBHOOK

    events = ["user_logged_out", "user_added", "user_added"]
    res = await _save(client, admin, f"  {DAVIS_HOOK} ", events)
    assert res.json() == {
        "webhookUrl": DAVIS_HOOK,
        "redactedUrl": REDACTED,
        "verified": False,
        "events": ["user_added", "user_logged_out"],
    }
    assert (await client.get("/api/admin/notifications", headers=admin)).json() == res.json()

    res = await client.delete("/api/admin/notifications", headers=admin)
    assert res.json() == NO_WEBHOOK


async def test_a_tested_webhook_only_shows_its_host(client, conn, admin, sent):
    await _save(client, admin, DAVIS_HOOK, ["user_added"])
    res = await client.post("/api/admin/notifications/test", headers=admin)
    expected = {"webhookUrl": None, "redactedUrl": REDACTED, "verified": True, "events": ["user_added"]}
    assert res.json() == expected
    res = await client.get("/api/admin/notifications", headers=admin)
    assert res.json() == expected
    assert "davis-token" not in res.text

    # Changing only the events keeps the hidden URL, and it still works
    res = await _save(client, admin, None, ["user_deleted"])
    assert res.json() == {**expected, "events": ["user_deleted"]}
    assert await conn.fetchval("SELECT webhook_url FROM admin_webhooks") == DAVIS_HOOK

    # Saving the same URL again keeps it verified; a new one has to be tested again
    res = await _save(client, admin, DAVIS_HOOK, ["user_deleted"])
    assert res.json()["verified"] is True
    new_hook = "https://canary.discord.com/api/webhooks/333/new-token"
    res = await _save(client, admin, new_hook, ["user_deleted"])
    assert res.json() == {
        "webhookUrl": new_hook,
        "redactedUrl": "https://canary.discord.com/••••••••",
        "verified": False,
        "events": ["user_deleted"],
    }


async def test_a_failed_test_does_not_hide_the_url(client, admin, monkeypatch):
    async def failing_send(url, content):
        raise notifications.DeliveryError("Discord answered with HTTP 404")

    monkeypatch.setattr(notifications, "send", failing_send)
    await _save(client, admin, DAVIS_HOOK, ["user_added"])
    await client.post("/api/admin/notifications/test", headers=admin)
    res = await client.get("/api/admin/notifications", headers=admin)
    assert (res.json()["webhookUrl"], res.json()["verified"]) == (DAVIS_HOOK, False)


async def test_events_cannot_be_saved_without_any_url(client, admin):
    res = await _save(client, admin, None, ["user_added"])
    assert res.status_code == 400


@pytest.mark.parametrize(
    "url",
    [
        "",
        "http://discord.com/api/webhooks/111/token",
        "https://example.com/api/webhooks/111/token",
        "https://discord.com.evil.example/api/webhooks/111/token",
        "https://discord.com/api/webhooks/111/token?redirect=x",
    ],
)
async def test_only_discord_webhook_urls_are_accepted(client, conn, admin, url):
    res = await _save(client, admin, url, ["user_added"])
    assert res.status_code == 400
    assert "Discord webhook URL" in res.json()["error"]
    assert await conn.fetchval("SELECT COUNT(*) FROM admin_webhooks") == 0


async def test_unknown_event_is_refused(client, admin):
    res = await _save(client, admin, DAVIS_HOOK, ["user_added", "class_created"])
    assert (res.status_code, res.json()) == (400, {"error": "Unknown notification type"})


async def test_non_admins_cannot_configure_notifications(client, conn):
    for method in ("GET", "PUT", "DELETE"):
        res = await client.request(method, "/api/admin/notifications", headers=auth(ALEX))
        assert res.status_code == 403
    res = await client.post("/api/admin/notifications/test", headers=auth(ALEX))
    assert res.status_code == 403


async def test_each_admin_gets_only_the_events_they_chose(client, conn, admin, sent):
    await conn.execute("UPDATE users SET is_admin = TRUE WHERE id = $1", MRS_SMITH["id"])
    await _save(client, admin, DAVIS_HOOK, ["user_added"])
    await _save(client, auth(MRS_SMITH), SMITH_HOOK, ["user_deleted"])

    await _signup(client, "pat@example.com")
    assert sent == [
        (
            DAVIS_HOOK,
            (
                "🆕 **New account:** Pat New (pat@example.com, student) signed up with email and password. "
                "Waiting for approval."
            ),
        )
    ]

    sent.clear()
    await client.delete(f"/api/admin/users/{SARAH['id']}", headers=admin)
    assert sent == [
        (SMITH_HOOK, "🗑️ **Account deleted:** Sarah K. (sarah@school.edu, student) was deleted by Mr. Davis.")
    ]


async def test_login_and_logout_notifications(client, conn, admin, sent):
    await _signup(client, "pat@example.com")
    await conn.execute("UPDATE users SET approved = TRUE WHERE email = 'pat@example.com'")
    await _save(client, admin, DAVIS_HOOK, ["user_logged_in", "user_logged_out"])

    login = await client.post("/api/auth/login", json={"email": "pat@example.com", "password": "password123"})
    token = login.json()["token"]
    res = await client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert res.json() == {"success": True}
    assert [content for _, content in sent] == [
        "🔓 **Signed in:** Pat New (pat@example.com, student) signed in with email and password.",
        "🔒 **Signed out:** Pat New (pat@example.com, student) signed out.",
    ]

    res = await client.post("/api/auth/logout")
    assert res.status_code == 401


async def test_failed_logins_and_pending_accounts_do_not_count_as_signed_in(client, admin, sent):
    await _save(client, admin, DAVIS_HOOK, ["user_logged_in"])
    await client.post("/api/auth/login", json={"email": ALEX["email"], "password": "wrong-password"})
    await _signup(client, "pat@example.com")
    await client.post("/api/auth/login", json={"email": "pat@example.com", "password": "password123"})
    assert sent == []


async def test_auto_approved_signup_is_added_and_signed_in(client, conn, admin, sent):
    await _save(client, admin, DAVIS_HOOK, ["user_added", "user_logged_in"])
    await conn.execute("INSERT INTO app_settings (key, value) VALUES ('auto_approve_signups', TRUE)")
    await _signup(client, "pat@example.com")
    assert [content for _, content in sent] == [
        (
            "🆕 **New account:** Pat New (pat@example.com, student) signed up with email and password. "
            "Approved automatically."
        ),
        "🔓 **Signed in:** Pat New (pat@example.com, student) signed in with email and password.",
    ]


async def test_google_sign_up_is_added_but_linking_an_existing_account_is_not(
    client, conn, admin, sent, monkeypatch
):
    payload = {"sub": "g-1", "email": "gina@example.com", "name": "Gina", "email_verified": True}
    monkeypatch.setattr(auth_router, "verify_google_token", lambda token, client_id: payload)
    await _save(client, admin, DAVIS_HOOK, ["user_added"])

    await client.post("/api/auth/google", json={"idToken": "tok"})
    assert [content for _, content in sent] == [
        "🆕 **New account:** Gina (gina@example.com, student) signed up with Google. Waiting for approval."
    ]

    sent.clear()
    payload.update(sub="g-2", email=ALEX["email"], name=ALEX["name"])
    await client.post("/api/auth/google", json={"idToken": "tok"})
    assert sent == []


async def test_admins_who_lose_admin_stop_getting_notifications(client, conn, admin, sent):
    await _save(client, admin, DAVIS_HOOK, ["user_added"])
    await conn.execute("UPDATE users SET is_admin = FALSE WHERE id = $1", MR_DAVIS["id"])
    await _signup(client, "pat@example.com")
    assert sent == []


async def test_names_cannot_add_discord_formatting(client, admin, sent):
    await _save(client, admin, DAVIS_HOOK, ["user_added"])
    await _signup(client, "pat@example.com", name="**Pat** [link](x)")
    assert "\\*\\*Pat\\*\\* \\[link\\]\\(x\\)" in sent[0][1]


async def test_test_message_reports_discord_errors(client, admin, sent, monkeypatch):
    res = await client.post("/api/admin/notifications/test", headers=admin)
    assert (res.status_code, res.json()) == (400, {"error": "Save a webhook URL first"})

    await _save(client, admin, DAVIS_HOOK, [])
    res = await client.post("/api/admin/notifications/test", headers=admin)
    assert res.json()["verified"] is True
    assert sent == [
        (DAVIS_HOOK, "✅ **Test notification:** SynergyHubs notifications for Mr. Davis are working.")
    ]

    async def failing_send(url, content):
        raise notifications.DeliveryError("Discord answered with HTTP 404")

    monkeypatch.setattr(notifications, "send", failing_send)
    res = await client.post("/api/admin/notifications/test", headers=admin)
    assert (res.status_code, res.json()) == (
        502,
        {"error": "Discord answered with HTTP 404. Check the webhook URL."},
    )


async def test_delivery_failures_are_logged_without_the_url(monkeypatch, caplog):
    class Response:
        ok = False
        status_code = 404

    monkeypatch.setattr(notifications.requests, "post", lambda *args, **kwargs: Response())
    await notifications._deliver("user_added", [DAVIS_HOOK], "hello")
    assert "HTTP 404" in caplog.text
    assert "davis-token" not in caplog.text
