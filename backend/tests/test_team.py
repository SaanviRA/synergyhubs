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


async def test_status_update_is_public_and_not_logged(client, conn):
    logs_before = await conn.fetchval("SELECT COUNT(*) FROM evaluation_logs")
    res = await client.post(f"{BASE}/team/update", json={"text": "Slides are done"}, headers=auth(ALEX))
    assert res.json() == {"success": True}

    team = (await client.get(f"{BASE}/team", headers=auth(SARAH))).json()
    assert team[0]["activeLog"] == "Slides are done"
    # Updates and the evaluation log are separate
    assert await conn.fetchval("SELECT COUNT(*) FROM evaluation_logs") == logs_before

    res = await client.post(f"{BASE}/team/update", json={"text": " "}, headers=auth(ALEX))
    assert (res.status_code, res.json()) == (400, {"error": "Text is required"})


async def test_work_log_lifecycle(client):
    res = await client.post(f"{BASE}/logs", json={"text": "Read chapter 4"}, headers=auth(ALEX))
    new_log = res.json()
    assert new_log == {"id": new_log["id"], "text": "Read chapter 4", "date": short_date()}

    logs = (await client.get(f"{BASE}/logs", headers=auth(ALEX))).json()
    # Alex's seeded status update (log 4) is not part of the evaluation log
    assert [log["id"] for log in logs] == [new_log["id"], 3]
    assert set(logs[0]) == {"id", "text", "date", "created_at", "type"}
    assert logs[0]["type"] == "work_log" and logs[0]["created_at"].endswith("Z")
    # Logging work does not post a status update
    team = (await client.get(f"{BASE}/team", headers=auth(ALEX))).json()
    assert team[0]["activeLog"] == "Found 3 primary sources on JFK."

    # Another student cannot delete it; the owner can
    await client.delete(f"{BASE}/logs/{new_log['id']}", headers=auth(SARAH))
    assert len((await client.get(f"{BASE}/logs", headers=auth(ALEX))).json()) == 2
    assert (await client.delete(f"{BASE}/logs/{new_log['id']}", headers=auth(ALEX))).json() == {
        "success": True
    }
    assert [log["id"] for log in (await client.get(f"{BASE}/logs", headers=auth(ALEX))).json()] == [3]


async def test_students_only_see_their_own_logs(client):
    own = await client.get(f"{BASE}/logs", params={"userId": ALEX["id"]}, headers=auth(ALEX))
    assert [log["id"] for log in own.json()] == [3]

    res = await client.get(f"{BASE}/logs", params={"userId": SARAH["id"]}, headers=auth(ALEX))
    assert (res.status_code, res.json()) == (403, {"error": "You can only view your own logs"})


async def test_teacher_sees_all_logs_or_one_students(client):
    logs = (await client.get(f"{BASE}/logs", headers=auth(MR_DAVIS))).json()
    assert [log["id"] for log in logs] == [5, 3, 2, 1]
    assert set(logs[0]) == {"id", "text", "date", "created_at", "userId", "type", "userName", "avatar"}
    assert (logs[0]["userId"], logs[0]["userName"], logs[0]["avatar"]) == (2, "Sarah K.", "SK")

    one = await client.get(f"{BASE}/logs", params={"userId": SARAH["id"]}, headers=auth(MR_DAVIS))
    assert [log["id"] for log in one.json()] == [5]


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


async def test_move_project_rules(client, outsider):
    await client.post(f"{BASE}/team/invite", json={"email": "olive@example.com"}, headers=auth(ALEX))

    res = await client.put(f"{BASE}/class", json={"classId": 2}, headers=outsider)
    assert (res.status_code, res.json()) == (403, {"error": "You are not a member of that class"})
    assert (await client.put(f"{BASE}/class", json={"classId": 2}, headers=auth(MRS_SMITH))).status_code == 403


async def test_class_members_can_move_a_class_project_for_themselves(client, conn):
    def layout(classes):
        return {c["id"]: [(p["id"], p.get("shared", False)) for p in c["projects"]] for c in classes}

    res = await client.put(f"{BASE}/class", json={"classId": 2}, headers=auth(ALEX))
    assert (res.status_code, res.json()) == (200, {"success": True, "classId": 2})
    assert layout((await client.get("/api/classes", headers=auth(ALEX))).json()) == {
        1: [(102, False), (103, False)],
        2: [(101, False), (201, False), (202, False)],
    }
    # Classmates still see it in class 1, and it is still class 1's project
    assert layout((await client.get("/api/classes", headers=auth(SARAH))).json())[1] == [
        (101, False),
        (102, False),
        (103, False),
    ]
    assert (await client.get(f"/api/projects/{PROJECT}", headers=auth(ALEX))).json()["classId"] == 1

    # Moving it to its own class (or null) puts it back
    for back in (1, None):
        await client.put(f"{BASE}/class", json={"classId": 2}, headers=auth(ALEX))
        res = await client.put(f"{BASE}/class", json={"classId": back}, headers=auth(ALEX))
        assert res.json() == {"success": True, "classId": back}
        assert layout((await client.get("/api/classes", headers=auth(ALEX))).json())[1][0] == (101, False)
        assert not await conn.fetchval("SELECT 1 FROM project_placements WHERE user_id = $1", ALEX["id"])


async def test_members_can_remove_teammates_but_not_the_owner(client, conn):
    # A class owner can be on the team too (a student who created the class is added automatically)
    await conn.execute("INSERT INTO project_members (project_id, user_id) VALUES (101, $1)", MR_DAVIS["id"])
    team = (await client.get(f"{BASE}/team", headers=auth(ALEX))).json()
    assert [(m["id"], m["isOwner"]) for m in team] == [(1, False), (2, False), (3, False), (4, True)]

    res = await client.delete(f"{BASE}/team/{MR_DAVIS['id']}", headers=auth(ALEX))
    assert (res.status_code, res.json()) == (403, {"error": "The project owner cannot be removed"})

    res = await client.delete(f"{BASE}/team/{SARAH['id']}", headers=auth(ALEX))
    assert (res.status_code, res.json()) == (200, {"success": True})
    assert [m["id"] for m in (await client.get(f"{BASE}/team", headers=auth(ALEX))).json()] == [1, 3, 4]
    res = await client.delete(f"{BASE}/team/{SARAH['id']}", headers=auth(ALEX))
    assert (res.status_code, res.json()) == (404, {"error": "That person is not on this team"})


async def test_removed_classmates_stay_off_the_team_until_invited_again(client, conn):
    await client.delete(f"{BASE}/team/{SARAH['id']}", headers=auth(ALEX))
    # Sarah is still in the class, so she can open the project, but that does not rejoin her
    assert (await client.post(f"{BASE}/visit", headers=auth(SARAH))).status_code == 200
    assert await _roles(conn, SARAH["id"]) is None

    await client.post(f"{BASE}/team/invite", json={"email": SARAH["email"]}, headers=auth(ALEX))
    await client.post(f"{BASE}/visit", headers=auth(SARAH))
    assert await conn.fetchval(
        "SELECT visit_count FROM project_members WHERE project_id = 101 AND user_id = $1", SARAH["id"]
    ) == 1


async def test_removed_invitees_lose_access(client, outsider):
    await client.post(f"{BASE}/team/invite", json={"email": "olive@example.com"}, headers=auth(ALEX))
    olive = (await client.get(f"{BASE}/team", headers=auth(ALEX))).json()[-1]["id"]
    await client.delete(f"{BASE}/team/{olive}", headers=auth(SARAH))
    assert (await client.get(f"{BASE}/team", headers=outsider)).status_code == 403
    assert (await client.delete(f"{BASE}/team/{ALEX['id']}", headers=outsider)).status_code == 403
