import re
from datetime import datetime, timedelta, timezone

import pytest

from app import utils


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("Alex M.", "AM"),
        ("saanvi", "S"),
        ("Mary Jane Watson", "MJ"),
        ("  padded  name", "PN"),
        ("", "US"),
        (None, "US"),
    ],
)
def test_get_initials(name, expected):
    assert utils.get_initials(name) == expected


def test_date_labels_match_the_format_the_frontend_displays():
    evening = datetime(2026, 10, 5, 19, 6)
    assert utils.short_date(evening) == "Oct 5"
    assert utils.today_label(evening) == "Oct 5 (Today)"
    assert utils.submitted_at_label(evening) == "Oct 5, 7:06 PM"
    assert utils.submitted_at_label(datetime(2026, 1, 31, 0, 6)) == "Jan 31, 12:06 AM"
    assert utils.submitted_at_label(datetime(2026, 1, 31, 12, 0)) == "Jan 31, 12:00 PM"


@pytest.mark.parametrize(
    ("completed", "total", "expected"),
    [(0, 0, 0), (0, 4, 0), (1, 4, 25), (1, 3, 33), (2, 3, 67), (1, 8, 13), (1, 200, 1), (3, 3, 100)],
)
def test_progress_percent_rounds_half_up(completed, total, expected):
    assert utils.progress_percent(completed, total) == expected


def test_iso_z_uses_utc_with_milliseconds():
    assert utils.iso_z(None) is None
    plus_two = timezone(timedelta(hours=2))
    assert utils.iso_z(datetime(2026, 10, 5, 21, 6, 7, 123456, tzinfo=plus_two)) == "2026-10-05T19:06:07.123Z"


def test_join_code_shape_and_class_colors():
    for _ in range(50):
        assert re.fullmatch(r"\d[A-Z]{3}-\d[A-Z]{3}", utils.generate_join_code())
    assert utils.random_class_color() in utils.CLASS_COLORS
