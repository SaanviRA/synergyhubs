import re

from .conftest import ALEX, MR_DAVIS, MRS_SMITH, auth


async def test_profile_read_and_update(client):
    me = await client.get("/api/users/me", headers=auth(ALEX))
    assert me.json() == {
        "id": 1,
        "name": "Alex M.",
        "email": "alex@school.edu",
        "avatar": "AM",
        "role": "student",
        "is_me": False,
    }

    res = await client.put(
        "/api/users/me", json={"name": " Alex Morgan ", "email": "ALEX@new.edu"}, headers=auth(ALEX)
    )
    assert res.status_code == 200
    assert res.json()["name"] == "Alex Morgan" and res.json()["email"] == "alex@new.edu"

    res = await client.put("/api/users/me", json={"name": "Alex"}, headers=auth(ALEX))
    assert (res.status_code, res.json()) == (400, {"error": "Name and email are required"})


async def test_profile_email_cannot_collide_with_another_account(client):
    res = await client.put(
        "/api/users/me", json={"name": "Alex", "email": "sarah@school.edu"}, headers=auth(ALEX)
    )
    assert (res.status_code, res.json()) == (409, {"error": "An account with this email already exists"})


async def test_deleted_user_token_gets_404(client):
    res = await client.get("/api/users/me", headers=auth({"id": 99999, "name": "Ghost", "email": "g@x.co"}))
    assert (res.status_code, res.json()) == (404, {"error": "User not found"})


async def test_list_classes_only_returns_the_callers_classes(client, outsider):
    res = await client.get("/api/classes", headers=auth(ALEX))
    classes = res.json()
    assert [c["name"] for c in classes] == ["AP US History", "Biology 101"]
    assert classes[0] == {
        "id": 1,
        "name": "AP US History",
        "teacher": "Mr. Davis",
        "joinCode": "8XYZ-2PLQ",
        "color": "from-blue-500 to-indigo-600",
        "members": 4,
        "projects": classes[0]["projects"],
    }
    assert classes[0]["projects"][0] == {
        "id": 101,
        "name": "Cold War Perspectives",
        "status": "present",
        "progress": 25,
        "color": "from-blue-500 to-indigo-600",
        "hue": "blue",
    }
    assert [p["id"] for p in classes[1]["projects"]] == [201, 202]

    assert [c["id"] for c in (await client.get("/api/classes", headers=auth(MRS_SMITH))).json()] == [2]
    assert (await client.get("/api/classes", headers=outsider)).json() == []


async def test_join_class_by_code(client, conn, outsider):
    res = await client.post("/api/classes/join", json={"joinCode": " 8xyz-2plq "}, headers=outsider)
    assert (res.status_code, res.json()) == (200, {"success": True, "classId": 1, "name": "AP US History"})

    classes = (await client.get("/api/classes", headers=outsider)).json()
    assert [c["id"] for c in classes] == [1] and classes[0]["members"] == 5

    # Joining also drops the student into the class's first project
    member = await conn.fetchrow(
        """SELECT pm.roles, pm.active_log FROM project_members pm JOIN users u ON u.id = pm.user_id
           WHERE pm.project_id = 101 AND u.email = 'olive@example.com'"""
    )
    assert dict(member) == {"roles": ["Collaborator"], "active_log": "Just joined the project!"}

    # Joining twice is a no-op
    await client.post("/api/classes/join", json={"joinCode": "8XYZ-2PLQ"}, headers=outsider)
    assert (await client.get("/api/classes", headers=outsider)).json()[0]["members"] == 5


async def test_join_class_errors(client, outsider):
    res = await client.post("/api/classes/join", json={}, headers=outsider)
    assert (res.status_code, res.json()) == (400, {"error": "Join code is required"})
    res = await client.post("/api/classes/join", json={"joinCode": "0000-0000"}, headers=outsider)
    assert (res.status_code, res.json()) == (404, {"error": "Class not found with that invite code"})


async def test_teacher_creates_class(client):
    res = await client.post("/api/classes", json={"className": "  Physics  "}, headers=auth(MR_DAVIS))
    assert res.status_code == 200
    created = res.json()["class"]
    assert res.json()["success"] is True and created["name"] == "Physics"
    assert re.fullmatch(r"\d[A-Z]{3}-\d[A-Z]{3}", created["joinCode"])

    mine = (await client.get("/api/classes", headers=auth(MR_DAVIS))).json()
    new = next(c for c in mine if c["id"] == created["id"])
    assert new["teacher"] == "Mr. Davis" and new["members"] == 1 and new["projects"] == []


async def test_create_class_rules(client):
    res = await client.post("/api/classes", json={"className": "Hack"}, headers=auth(ALEX))
    assert (res.status_code, res.json()) == (403, {"error": "Only teachers can create classes"})
    res = await client.post("/api/classes", json={"className": "   "}, headers=auth(MR_DAVIS))
    assert (res.status_code, res.json()) == (400, {"error": "Class name is required"})


PROJECT_BODY = {
    "name": " Space Race ",
    "status": "future",
    "color": "from-rose-500 to-pink-600",
    "hue": "rose",
    "timeline": [
        {"title": " Kickoff ", "details": " Pick teams ", "date": "Apr 2"},
        {"title": "Final report"},
        {"title": "   ", "date": "ignored"},
    ],
}


async def test_teacher_creates_project_with_timeline(client, conn):
    res = await client.post("/api/classes/1/projects", json=PROJECT_BODY, headers=auth(MR_DAVIS))
    assert res.status_code == 201
    project = res.json()
    assert project == {
        "id": project["id"],
        "name": "Space Race",
        "status": "future",
        "progress": 0,
        "color": "from-rose-500 to-pink-600",
        "hue": "rose",
    }

    milestones = (
        await client.get(f"/api/projects/{project['id']}/milestones", headers=auth(MR_DAVIS))
    ).json()
    assert [(m["title"], m["details"], m["date"], m["status"], m["assignee"]) for m in milestones] == [
        ("Kickoff", "Pick teams", "Apr 2", "pending", "Everyone"),
        ("Final report", None, "TBD", "pending", "Everyone"),
    ]

    # Every student in the class is added to the project; the teacher is not
    members = await conn.fetch(
        "SELECT user_id FROM project_members WHERE project_id = $1 ORDER BY 1", project["id"]
    )
    assert [m["user_id"] for m in members] == [1, 2, 3]


async def test_create_project_rules(client):
    cases = [
        (MR_DAVIS, {**PROJECT_BODY, "name": " "}, 400, "Project name is required"),
        (MR_DAVIS, {**PROJECT_BODY, "status": "done"}, 400, "Invalid project status"),
        (MR_DAVIS, {**PROJECT_BODY, "hue": ""}, 400, "Color and hue are required"),
        (ALEX, PROJECT_BODY, 403, "Only teachers can create projects"),
        (MRS_SMITH, PROJECT_BODY, 403, "You are not a member of this class"),
    ]
    for user, body, status, error in cases:
        res = await client.post("/api/classes/1/projects", json=body, headers=auth(user))
        assert (res.status_code, res.json()) == (status, {"error": error})
