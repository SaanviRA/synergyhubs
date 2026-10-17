from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from .. import notifications
from ..access import AUTO_APPROVE, Conn, User, auto_approve_enabled
from ..errors import SafeRoute, fails_with
from ..utils import iso_z


async def require_admin(conn: Conn, user: User) -> None:
    if not await conn.fetchval("SELECT is_admin FROM users WHERE id = $1", user.id):
        raise HTTPException(status_code=403, detail="Admin access required")


router = APIRouter(prefix="/api/admin", route_class=SafeRoute, dependencies=[Depends(require_admin)])


async def _target(conn: Conn, user_id: int):
    target = await conn.fetchrow("SELECT id, name, email, role, is_admin FROM users WHERE id = $1", user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    return target


# Every account, accounts waiting for approval first
@router.get("/users", dependencies=[fails_with("Server error fetching users")])
async def list_users(conn: Conn):
    rows = await conn.fetch(
        """SELECT id, name, email, role, approved, is_admin, created_at,
                  password_hash IS NOT NULL AS has_password, google_id IS NOT NULL AS has_google
           FROM users
           ORDER BY approved ASC, created_at DESC, id DESC"""
    )
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "role": row["role"],
            "approved": row["approved"],
            "isAdmin": row["is_admin"],
            # Neither: a placeholder created when a teammate invited this email
            "signIn": "google" if row["has_google"] else "password" if row["has_password"] else "invited",
            "createdAt": iso_z(row["created_at"]),
        }
        for row in rows
    ]


@router.post("/users/{userId}/approve", dependencies=[fails_with("Server error approving user")])
async def approve_user(userId: int, conn: Conn):
    await _target(conn, userId)
    await conn.execute("UPDATE users SET approved = TRUE WHERE id = $1", userId)
    return {"success": True}


# Deleting removes the account with its memberships and logs; classes it created are kept
@router.delete("/users/{userId}", dependencies=[fails_with("Server error deleting user")])
async def delete_user(userId: int, conn: Conn, user: User, background: BackgroundTasks):
    target = await _target(conn, userId)
    if target["id"] == user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    if target["is_admin"]:
        raise HTTPException(status_code=400, detail="Admin accounts cannot be deleted here")
    await conn.execute("DELETE FROM users WHERE id = $1", userId)
    admin_name = await conn.fetchval("SELECT name FROM users WHERE id = $1", user.id)
    await notifications.notify(
        conn, background, notifications.USER_DELETED, notifications.user_deleted(target, admin_name)
    )
    return {"success": True}


class AutoApproveBody(BaseModel):
    enabled: bool
    # Must be exactly ENABLE when turning on and DISABLE when turning off
    confirmation: str | None = None


@router.get("/settings", dependencies=[fails_with("Server error fetching settings")])
async def read_settings(conn: Conn):
    return {"autoApprove": await auto_approve_enabled(conn)}


# Turning auto-approve on approves new sign-ups from then on; accounts already waiting stay pending
@router.put("/settings/auto-approve", dependencies=[fails_with("Server error updating settings")])
async def set_auto_approve(body: AutoApproveBody, conn: Conn, user: User):
    expected = "ENABLE" if body.enabled else "DISABLE"
    if body.confirmation != expected:
        raise HTTPException(status_code=400, detail=f"Type {expected} to confirm")
    await conn.execute(
        """INSERT INTO app_settings (key, value, updated_by, updated_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at""",
        AUTO_APPROVE,
        body.enabled,
        user.id,
    )
    return {"autoApprove": body.enabled}


class NotificationsBody(BaseModel):
    # Leave out to keep the saved URL, such as when only the events change
    webhookUrl: str | None = None
    events: list[str] | None = None


NO_WEBHOOK = {
    "webhookUrl": None,
    "redactedUrl": None,
    "verified": False,
    "events": notifications.DEFAULT_EVENTS,
}


def _webhook_settings(row) -> dict:
    """A tested webhook is only ever shown by its host; until then the admin can still see what they typed."""
    if row is None:
        return NO_WEBHOOK
    return {
        "webhookUrl": None if row["verified"] else row["webhook_url"],
        "redactedUrl": notifications.redact(row["webhook_url"]),
        "verified": row["verified"],
        "events": list(row["events"]),
    }


async def _saved_webhook(conn: Conn, user_id: int):
    return await conn.fetchrow(
        "SELECT webhook_url, events, verified FROM admin_webhooks WHERE user_id = $1", user_id
    )


# Each admin's own Discord webhook; until one is saved, user_added is the suggested event
@router.get("/notifications", dependencies=[fails_with("Server error fetching notification settings")])
async def read_notifications(conn: Conn, user: User):
    return _webhook_settings(await _saved_webhook(conn, user.id))


@router.put("/notifications", dependencies=[fails_with("Server error saving notification settings")])
async def save_notifications(body: NotificationsBody, conn: Conn, user: User):
    url = (body.webhookUrl or "").strip()
    saved = await _saved_webhook(conn, user.id)
    if not url and saved is not None:
        url = saved["webhook_url"]
    if not notifications.is_webhook_url(url):
        raise HTTPException(
            status_code=400, detail="Enter a Discord webhook URL (https://discord.com/api/webhooks/...)"
        )
    events = body.events or []
    if any(event not in notifications.EVENTS for event in events):
        raise HTTPException(status_code=400, detail="Unknown notification type")
    events = [event for event in notifications.EVENTS if event in events]
    # A different URL has to be tested again before it is hidden
    row = await conn.fetchrow(
        """INSERT INTO admin_webhooks (user_id, webhook_url, events, verified, updated_at)
           VALUES ($1, $2, $3, FALSE, CURRENT_TIMESTAMP)
           ON CONFLICT (user_id) DO UPDATE
           SET webhook_url = EXCLUDED.webhook_url, events = EXCLUDED.events, updated_at = EXCLUDED.updated_at,
               verified = admin_webhooks.verified AND admin_webhooks.webhook_url = EXCLUDED.webhook_url
           RETURNING webhook_url, events, verified""",
        user.id,
        url,
        events,
    )
    return _webhook_settings(row)


@router.delete("/notifications", dependencies=[fails_with("Server error removing notification settings")])
async def remove_notifications(conn: Conn, user: User):
    await conn.execute("DELETE FROM admin_webhooks WHERE user_id = $1", user.id)
    return NO_WEBHOOK


# Sent right away rather than in the background, so a wrong URL shows up as an error
@router.post("/notifications/test", dependencies=[fails_with("Server error sending test notification")])
async def test_notification(conn: Conn, user: User):
    url = await conn.fetchval("SELECT webhook_url FROM admin_webhooks WHERE user_id = $1", user.id)
    if url is None:
        raise HTTPException(status_code=400, detail="Save a webhook URL first")
    name = await conn.fetchval("SELECT name FROM users WHERE id = $1", user.id)
    try:
        await notifications.send(
            url,
            f"✅ **Test notification:** SynergyHubs notifications for {notifications.plain(name)} are working.",
        )
    except notifications.DeliveryError as exc:
        raise HTTPException(status_code=502, detail=f"{exc}. Check the webhook URL.")
    # Only the URL that was tested, in case it was replaced while the message was on its way
    row = await conn.fetchrow(
        """UPDATE admin_webhooks SET verified = TRUE WHERE user_id = $1 AND webhook_url = $2
           RETURNING webhook_url, events, verified""",
        user.id,
        url,
    )
    return _webhook_settings(row or await _saved_webhook(conn, user.id))
