from app.utils import short_date

from .conftest import ALEX, MR_DAVIS, MRS_SMITH, PROJECT, SARAH, auth

BASE = f"/api/projects/{PROJECT}"


async def _roles(conn, user_id):
    return await conn.fetchval(
        "SELECT roles FROM project_members WHERE project_id = 101 AND user_id = $1", user_id
    )


async def test_invite_creates_user_and_adds_them_to_the_project_only(client, conn):
    res = await client.post(
        f"{BASE}/team/invite", json={"email": " Robin.Hood@Example.com "}, headers=auth(ALEX)
    )
    assert res.status_code == 200
    member = res.json()["member"]
    assert res.json() == {
        "success": True,
        "member": {
            "id": member["id"],
            "name": "robin.hood",
            "avatar": "RO",
            "roles": [],
            "activeLog": "Just joined the project!",
        },
    }
    assert not await conn.fetchval("SELECT 1 FROM class_members WHERE user_id = $1", member["id"])
    team = (await client.get(f"{BASE}/team", headers=auth(ALEX))).json()
    assert team[-1]["email"] == "robin.hood@example.com"

    # Inviting an existing member changes nothing
    again = await client.post(f"{BASE}/team/invite", json={"email": "sarah@school.edu"}, headers=auth(ALEX))
    assert again.json()["member"]["id"] == 2
    assert len((await client.get(f"{BASE}/team", headers=auth(ALEX))).json()) == 4
    assert await _roles(conn, 2) == ["Editor"]

    res = await client.post(f"{BASE}/team/invite", json={"email": "  "}, headers=auth(ALEX))
    assert (res.status_code, res.json()) == (400, {"error": "Email is required"})


async def test_add_and_remove_roles(client, conn):
    for _ in range(2):  # adding the same role twice does not duplicate it
        res = await client.post(
            f"{BASE}/team/role", json={"userId": 1, "role": "Designer"}, headers=auth(SARAH)
        )
        assert res.json() == {"success": True}
    assert await _roles(conn, 1) == ["Researcher", "Designer"]

    res = await client.request(
        "DELETE", f"{BASE}/team/role", json={"userId": 1, "role": "Researcher"}, headers=auth(SARAH)
    )
    assert res.json() == {"success": True}
    assert await _roles(conn, 1) == ["Designer"]

    res = await client.post(f"{BASE}/team/role", json={"role": "Designer"}, headers=auth(SARAH))
    assert (res.status_code, res.json()) == (400, {"error": "userId and role are required"})


async def test_status_update_is_public_and_logged(client, conn):
    res = await client.post(f"{BASE}/team/update", json={"text": "Slides are done"}, headers=auth(ALEX))
    assert res.json() == {"success": True}

    team = (await client.get(f"{BASE}/team", headers=auth(SARAH))).json()
    assert team[0]["activeLog"] == "Slides are done"
    log = await conn.fetchrow("SELECT * FROM evaluation_logs ORDER BY id DESC LIMIT 1")
    assert (log["user_id"], log["log_text"], log["date"], log["log_type"]) == (
        1,
        "Slides are done",
        short_date(),
        "status_update",
    )

    res = await client.post(f"{BASE}/team/update", json={"text": " "}, headers=auth(ALEX))
    assert (res.status_code, res.json()) == (400, {"error": "Text is required"})


async def test_work_log_lifecycle(client):
    res = await client.post(f"{BASE}/logs", json={"text": "Read chapter 4"}, headers=auth(ALEX))
    new_log = res.json()
    assert new_log == {"id": new_log["id"], "text": "Read chapter 4", "date": short_date()}

    logs = (await client.get(f"{BASE}/logs", headers=auth(ALEX))).json()
    assert [log["id"] for log in logs] == [new_log["id"], 4, 3]
    assert set(logs[0]) == {"id", "text", "date", "created_at", "type"}
    assert logs[0]["type"] == "work_log" and logs[0]["created_at"].endswith("Z")
    assert (await client.get(f"{BASE}/team", headers=auth(ALEX))).json()[0]["activeLog"] == "Read chapter 4"

    # Another student cannot delete it; the owner can
    await client.delete(f"{BASE}/logs/{new_log['id']}", headers=auth(SARAH))
    assert len((await client.get(f"{BASE}/logs", headers=auth(ALEX))).json()) == 3
    assert (await client.delete(f"{BASE}/logs/{new_log['id']}", headers=auth(ALEX))).json() == {
        "success": True
    }
    assert [log["id"] for log in (await client.get(f"{BASE}/logs", headers=auth(ALEX))).json()] == [4, 3]


async def test_students_only_see_their_own_logs(client):
    own = await client.get(f"{BASE}/logs", params={"userId": ALEX["id"]}, headers=auth(ALEX))
    assert [log["id"] for log in own.json()] == [4, 3]

    res = await client.get(f"{BASE}/logs", params={"userId": SARAH["id"]}, headers=auth(ALEX))
    assert (res.status_code, res.json()) == (403, {"error": "You can only view your own logs"})


async def test_teacher_sees_all_logs_or_one_students(client):
    logs = (await client.get(f"{BASE}/logs", headers=auth(MR_DAVIS))).json()
    assert [log["id"] for log in logs] == [6, 5, 4, 3, 2, 1]
    assert set(logs[0]) == {"id", "text", "date", "created_at", "userId", "type", "userName", "avatar"}
    assert (logs[0]["userId"], logs[0]["userName"], logs[0]["avatar"]) == (2, "Sarah K.", "SK")

    one = await client.get(f"{BASE}/logs", params={"userId": SARAH["id"]}, headers=auth(MR_DAVIS))
    assert [log["id"] for log in one.json()] == [6, 5]


async def test_invited_student_sees_the_project_under_shared_and_can_move_it(client, outsider):
    res = await client.post(f"{BASE}/team/invite", json={"email": "olive@example.com"}, headers=auth(ALEX))
    assert res.status_code == 200

    # Only the one project is shared, not the rest of class 1
    classes = (await client.get("/api/classes", headers=outsider)).json()
    assert classes == [
        {
            "id": "shared",
            "name": "Shared",
            "teacher": "",
            "joinCode": None,
            "color": "from-slate-500 to-slate-700",
            "role": "student",
            "members": 0,
            "shared": True,
            "projects": [
                {
                    "id": 101,
                    "name": "Cold War Perspectives",
                    "status": "present",
                    "progress": 25,
                    "color": "from-blue-500 to-indigo-600",
                    "hue": "blue",
                    "shared": True,
                }
            ],
        }
    ]
    assert (await client.get(f"{BASE}/team", headers=outsider)).status_code == 200
    assert (await client.get("/api/projects/102", headers=outsider)).status_code == 403
    # The class itself is unchanged for its members
    assert (await client.get("/api/classes", headers=auth(ALEX))).json()[0]["members"] == 4

    # Move it into a class of their own: "Shared" empties and disappears
    own = (await client.post("/api/classes", json={"className": "My Stuff"}, headers=outsider)).json()["class"]
    res = await client.put(f"{BASE}/class", json={"classId": own["id"]}, headers=outsider)
    assert (res.status_code, res.json()) == (200, {"success": True, "classId": own["id"]})
    classes = (await client.get("/api/classes", headers=outsider)).json()
    assert [(c["id"], [(p["id"], p["shared"]) for p in c["projects"]]) for c in classes] == [
        (own["id"], [(101, True)])
    ]
    # It is still class 1's project for everyone else
    assert [p["id"] for p in (await client.get("/api/classes", headers=auth(ALEX))).json()[0]["projects"]] == [
        101,
        102,
        103,
    ]
    assert (await client.get(f"/api/projects/{PROJECT}", headers=outsider)).json()["classId"] == 1

    # And back to "Shared"
    res = await client.put(f"{BASE}/class", json={"classId": None}, headers=outsider)
    assert res.json() == {"success": True, "classId": None}
    assert [c["id"] for c in (await client.get("/api/classes", headers=outsider)).json()] == [own["id"], "shared"]


async def test_move_shared_project_rules(client, outsider):
    await client.post(f"{BASE}/team/invite", json={"email": "olive@example.com"}, headers=auth(ALEX))

    res = await client.put(f"{BASE}/class", json={"classId": 2}, headers=outsider)
    assert (res.status_code, res.json()) == (403, {"error": "You are not a member of that class"})

    # Members of the project's own class cannot re-file it
    res = await client.put(f"{BASE}/class", json={"classId": 2}, headers=auth(ALEX))
    assert (res.status_code, res.json()) == (400, {"error": "Only projects shared with you can be moved"})
    assert (await client.put(f"{BASE}/class", json={"classId": 2}, headers=auth(MRS_SMITH))).status_code == 403
