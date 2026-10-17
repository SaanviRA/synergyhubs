import re

from .conftest import ALEX, MR_DAVIS, PROJECT, SARAH, auth

ISO_Z = re.compile(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z")


async def test_get_project_recalculates_progress_from_milestones(client, conn):
    res = await client.get(f"/api/projects/{PROJECT}", headers=auth(ALEX))
    # 1 of 4 seeded milestones is completed
    assert res.json() == {
        "id": 101,
        "classId": 1,
        "name": "Cold War Perspectives",
        "status": "present",
        "progress": 25,
        "color": "from-blue-500 to-indigo-600",
        "hue": "blue",
    }
    assert await conn.fetchval("SELECT progress FROM projects WHERE id = 101") == 25


async def test_project_without_milestones_reports_zero_and_keeps_stored_progress(client, conn):
    res = await client.get("/api/projects/202", headers=auth(ALEX))
    assert res.json()["progress"] == 0
    assert await conn.fetchval("SELECT progress FROM projects WHERE id = 202") == 100


async def test_visit_increments_for_members_and_enrols_class_members(client, conn):
    assert (await client.post(f"/api/projects/{PROJECT}/visit", headers=auth(ALEX))).json() == {
        "success": True
    }
    row = await conn.fetchrow(
        "SELECT has_visited, visit_count FROM project_members WHERE project_id = 101 AND user_id = 1"
    )
    assert dict(row) == {"has_visited": True, "visit_count": 6}

    # Alex is in class 2 but not yet a member of project 201
    for expected_count in (1, 2):
        await client.post("/api/projects/201/visit", headers=auth(ALEX))
        row = await conn.fetchrow("SELECT * FROM project_members WHERE project_id = 201 AND user_id = 1")
        assert (row["roles"], row["active_log"], row["has_visited"], row["visit_count"]) == (
            ["Member"],
            "Joined project workspace",
            True,
            expected_count,
        )


async def test_team_marks_the_caller_as_me(client):
    team = (await client.get(f"/api/projects/{PROJECT}/team", headers=auth(SARAH))).json()
    assert [m["id"] for m in team] == [1, 2, 3]
    assert [m["isMe"] for m in team] == [False, True, False]
    alex = team[0]
    assert ISO_Z.fullmatch(alex.pop("lastVisitedAt"))
    assert alex == {
        "id": 1,
        "name": "Alex M.",
        "email": "alex@school.edu",
        "avatar": "AM",
        "is_me": False,
        "isMe": False,
        "roles": ["Researcher"],
        "activeLog": "Found 3 primary sources on JFK.",
        "hasVisited": True,
        "visitCount": 5,
        "isOwner": False,
    }


async def test_student_history_is_teacher_only(client):
    res = await client.get(f"/api/projects/{PROJECT}/student-history", headers=auth(ALEX))
    assert (res.status_code, res.json()) == (403, {"error": "Only teachers can view student history"})

    history = (await client.get(f"/api/projects/{PROJECT}/student-history", headers=auth(MR_DAVIS))).json()
    # Most recently active student first
    assert [s["name"] for s in history] == ["You", "Alex M.", "Sarah K."]
    alex = history[1]
    assert ISO_Z.fullmatch(alex["lastVisitedAt"])
    assert (alex["roles"], alex["hasVisited"], alex["visitCount"]) == (["Researcher"], True, 5)
    assert [(u["id"], u["type"], u["date"]) for u in alex["updates"]] == [
        (4, "status_update", "Mar 17"),
        (3, "work_log", "Mar 15"),
    ]
    assert alex["updates"][0]["text"] == "Organized primary sources folder with citation tags."
    assert ISO_Z.fullmatch(alex["updates"][0]["createdAt"])


async def test_rerunning_the_migration_does_not_reset_visit_tracking(database):
    """Regression: the Node server marked every member as visited on each restart."""
    from app.migrate import run_migration

    await database.execute(
        "INSERT INTO project_members (project_id, user_id, roles, has_visited, visit_count) VALUES (201, 1, '{}', FALSE, 0)"
    )
    try:
        await run_migration(database)
        row = await database.fetchrow(
            "SELECT has_visited, visit_count FROM project_members WHERE project_id = 201 AND user_id = 1"
        )
        assert dict(row) == {"has_visited": False, "visit_count": 0}
    finally:
        await database.execute("DELETE FROM project_members WHERE project_id = 201 AND user_id = 1")
