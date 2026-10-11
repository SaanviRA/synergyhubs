from app.utils import short_date

from .conftest import ALEX, PROJECT, auth

BASE = f"/api/projects/{PROJECT}/milestones"


async def _last_log(conn):
    log = await conn.fetchrow(
        "SELECT user_id, log_text, log_type FROM evaluation_logs ORDER BY id DESC LIMIT 1"
    )
    return tuple(log)


async def test_list_milestones(client):
    milestones = (await client.get(BASE, headers=auth(ALEX))).json()
    assert [m["id"] for m in milestones] == [1, 2, 3, 4]
    assert milestones[0] == {
        "id": 1,
        "title": "Topic Selection & Approval",
        "details": "Decide on the Cold War era and get Mr. Davis to approve it.",
        "date": "Mar 11",
        "status": "completed",
        "assignee": "Everyone",
        "submission": {
            "fileName": "Topic_Proposal_SpaceRace.pdf",
            "submittedAt": "Mar 11, 4:30 PM",
            "fileUrl": None,
        },
    }
    assert milestones[1]["submission"] is None


async def test_completing_a_milestone_updates_progress_and_history(client, conn):
    res = await client.patch(f"{BASE}/2", json={"status": "completed"}, headers=auth(ALEX))
    assert res.json() == {"success": True, "progress": 50}
    assert await conn.fetchval("SELECT progress FROM projects WHERE id = 101") == 50
    assert await _last_log(conn) == (1, 'Completed milestone "Gather Primary Sources"', "milestone_completed")

    # Other status changes do not add history
    logs_before = await conn.fetchval("SELECT COUNT(*) FROM evaluation_logs")
    res = await client.patch(f"{BASE}/2", json={"status": "in-progress"}, headers=auth(ALEX))
    assert res.json() == {"success": True, "progress": 25}
    assert await conn.fetchval("SELECT COUNT(*) FROM evaluation_logs") == logs_before


async def test_partial_update_only_changes_fields_that_were_sent(client):
    res = await client.patch(
        f"{BASE}/3", json={"title": "Draft Intro", "date": "Mar 30", "details": None}, headers=auth(ALEX)
    )
    assert res.json() == {"success": True, "progress": 25}
    milestone = (await client.get(BASE, headers=auth(ALEX))).json()[2]
    assert (milestone["title"], milestone["date"], milestone["details"], milestone["status"]) == (
        "Draft Intro",
        "Mar 30",
        None,
        "delayed",
    )

    assert (await client.patch(f"{BASE}/3", json={}, headers=auth(ALEX))).json() == {
        "success": True,
        "progress": 25,
    }


async def test_update_validation(client):
    cases = [
        (f"{BASE}/2", {"status": "finished"}, 400, "Invalid milestone status"),
        (f"{BASE}/2", {"title": " "}, 400, "Milestone title is required"),
        (f"{BASE}/2", {"date": None}, 400, "Milestone date is required"),
        (f"{BASE}/999", {"status": "completed"}, 404, "Milestone not found"),
    ]
    for url, body, status, error in cases:
        res = await client.patch(url, json=body, headers=auth(ALEX))
        assert (res.status_code, res.json()) == (status, {"error": error})


async def test_milestone_of_another_project_cannot_be_changed_through_this_one(client, conn):
    res = await client.patch(
        "/api/projects/102/milestones/2", json={"status": "completed"}, headers=auth(ALEX)
    )
    assert res.status_code == 404
    assert await conn.fetchval("SELECT status FROM milestones WHERE id = 2") == "in-progress"


async def test_submit_work(client, conn):
    body = {"fileName": "Sources.pdf", "fileUrl": "https://drive.google.com/file/d/abc"}
    res = await client.post(f"{BASE}/2/submit", json=body, headers=auth(ALEX))
    data = res.json()
    assert data == {**body, "success": True, "submittedAt": data["submittedAt"], "progress": 50}
    assert data["submittedAt"].startswith(f"{short_date()}, ") and data["submittedAt"][-2:] in ("AM", "PM")

    milestone = (await client.get(BASE, headers=auth(ALEX))).json()[1]
    assert milestone["status"] == "completed"
    assert milestone["submission"] == {
        "fileName": "Sources.pdf",
        "submittedAt": data["submittedAt"],
        "fileUrl": "https://drive.google.com/file/d/abc",
    }
    assert await _last_log(conn) == (
        1,
        'Submitted work for "Gather Primary Sources": Sources.pdf',
        "submission",
    )


async def test_submit_without_a_file_uses_defaults(client, conn):
    res = await client.post(f"{BASE}/4/submit", json={}, headers=auth(ALEX))
    assert res.status_code == 200
    milestone = (await client.get(BASE, headers=auth(ALEX))).json()[3]
    assert (
        milestone["submission"]["fileName"] == "Submission.pdf" and milestone["submission"]["fileUrl"] is None
    )
    assert (await _last_log(conn))[1] == 'Submitted work for "Create Presentation Slides": Document'
