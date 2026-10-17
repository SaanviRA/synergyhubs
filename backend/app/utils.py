import math
import secrets
import string
from datetime import date, datetime, timezone

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

CLASS_COLORS = [
    "from-blue-500 to-indigo-600",
    "from-emerald-400 to-teal-500",
    "from-rose-500 to-pink-600",
    "from-amber-400 to-orange-500",
    "from-violet-500 to-purple-600",
    "from-cyan-400 to-blue-500",
]


def get_initials(name: str | None) -> str:
    """Avatar fallback: first letter of the first two words, e.g. 'Alex M.' -> 'AM'."""
    if not name:
        return "US"
    return "".join(part[0] for part in name.split(" ") if part)[:2].upper()


def short_date(now: datetime | None = None) -> str:
    """'Oct 5' - the display date stored alongside logs."""
    now = now or datetime.now()
    return f"{MONTHS[now.month - 1]} {now.day}"


def due_label(due_on: date | None) -> str:
    """'Oct 5' for a milestone's due date, 'TBD' when it has none."""
    return short_date(datetime(due_on.year, due_on.month, due_on.day)) if due_on else "TBD"


def today_label(now: datetime | None = None) -> str:
    """'Oct 5 (Today)' - the display date stored on resources and workspaces."""
    return f"{short_date(now)} (Today)"


def submitted_at_label(now: datetime | None = None) -> str:
    """'Oct 5, 7:06 PM' - the display timestamp stored on milestone submissions."""
    now = now or datetime.now()
    hour = now.hour % 12 or 12
    meridiem = "AM" if now.hour < 12 else "PM"
    return f"{short_date(now)}, {hour}:{now.minute:02d} {meridiem}"


def progress_percent(completed: int, total: int) -> int:
    """Whole-number percentage, rounding halves up (Python's round() rounds halves to even)."""
    if total <= 0:
        return 0
    return math.floor(completed / total * 100 + 0.5)


def iso_z(value: datetime | None) -> str | None:
    """Serialize timestamps as '2026-10-05T19:06:00.000Z', the format the frontend has always received."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    value = value.astimezone(timezone.utc)
    return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


def generate_join_code() -> str:
    """Invite code shaped like '8XYZ-2PLQ'."""

    def half() -> str:
        return secrets.choice(string.digits) + "".join(
            secrets.choice(string.ascii_uppercase) for _ in range(3)
        )

    return f"{half()}-{half()}"


def random_class_color() -> str:
    return secrets.choice(CLASS_COLORS)
