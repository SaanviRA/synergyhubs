"""Discord notifications for admins. Each admin can set up their own webhook and pick which events it gets.

Messages are sent as background tasks after the response, so a slow or failing Discord never delays or
breaks the request. They live only in memory: a message waiting when the API restarts is lost.
"""

import asyncio
import re
from urllib.parse import urlsplit

import asyncpg
import requests
from fastapi import BackgroundTasks

from .errors import logger

USER_ADDED = "user_added"
USER_DELETED = "user_deleted"
USER_LOGGED_IN = "user_logged_in"
USER_LOGGED_OUT = "user_logged_out"
EVENTS = (USER_ADDED, USER_DELETED, USER_LOGGED_IN, USER_LOGGED_OUT)
DEFAULT_EVENTS = [USER_ADDED]

# Only Discord itself, so a webhook can never be pointed at another server
WEBHOOK_URL = re.compile(
    r"https://(?:(?:ptb|canary)\.)?discord(?:app)?\.com/api(?:/v\d+)?/webhooks/\d+/[A-Za-z0-9_-]+"
)

SIGN_IN_METHODS = {"google": "Google", "password": "email and password"}


class DeliveryError(Exception):
    pass


def is_webhook_url(url: str) -> bool:
    return WEBHOOK_URL.fullmatch(url) is not None


def redact(url: str) -> str:
    """Everything after the host is the webhook's ID and secret token."""
    return f"https://{urlsplit(url).hostname}/••••••••"


def _post(url: str, content: str) -> None:
    # No @everyone, role or user pings, whatever a user's name contains
    res = requests.post(url, json={"content": content, "allowed_mentions": {"parse": []}}, timeout=10)
    if not res.ok:
        # The URL is a secret, so it never goes into the error or the logs
        raise DeliveryError(f"Discord answered with HTTP {res.status_code}")


async def send(url: str, content: str) -> None:
    try:
        await asyncio.to_thread(_post, url, content)
    except requests.RequestException as exc:
        raise DeliveryError(f"Could not reach Discord ({type(exc).__name__})") from None


async def _deliver(event: str, urls: list[str], content: str) -> None:
    for url in urls:
        try:
            await send(url, content)
        except DeliveryError as exc:
            logger.warning("Discord %s notification failed: %s", event, exc)


async def notify(conn: asyncpg.Connection, background: BackgroundTasks, event: str, content: str) -> None:
    """Queues the message for every admin whose webhook is subscribed to this event."""
    rows = await conn.fetch(
        """SELECT w.webhook_url FROM admin_webhooks w JOIN users u ON u.id = w.user_id
           WHERE u.is_admin AND $1 = ANY(w.events)""",
        event,
    )
    if rows:
        background.add_task(_deliver, event, [row["webhook_url"] for row in rows], content)


def plain(text: str) -> str:
    """User-supplied text shown as typed rather than as Discord markdown."""
    return re.sub(r"([\\*_~`|>#\[\]()-])", r"\\\1", text)


def describe(user) -> str:
    return f"{plain(user['name'])} ({plain(user['email'])}, {user['role']})"


def user_added(user, method: str) -> str:
    status = "Approved automatically." if user["approved"] else "Waiting for approval."
    return f"🆕 **New account:** {describe(user)} signed up with {SIGN_IN_METHODS[method]}. {status}"


def user_deleted(user, admin_name: str) -> str:
    return f"🗑️ **Account deleted:** {describe(user)} was deleted by {plain(admin_name)}."


def user_logged_in(user, method: str) -> str:
    return f"🔓 **Signed in:** {describe(user)} signed in with {SIGN_IN_METHODS[method]}."


def user_logged_out(user) -> str:
    return f"🔒 **Signed out:** {describe(user)} signed out."
