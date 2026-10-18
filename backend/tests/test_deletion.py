from .conftest import ALEX, MR_DAVIS, PROJECT, SARAH, auth


async def class_ids(client, headers) -> list:
    return [cls["id"] for cls in (await client.get("/api/classes", headers=headers)).json()]


async def project_ids(client, headers) -> list[int]:
    classes = (await client.get("/api/classes", headers=headers)).json()
    return [p["id"] for cls in classes for p in cls["projects"]]


async def create_class_with_project(client, headers) -> tuple[int, int]:
    class_id = (await client.post("/api/classes", json={"className": "Study Group"}, headers=headers)).json()[
        "class"
    ]["id"]
    project = await client.post(
        f"/api/classes/{class_id}/projects",
        json={"name": "Poster", "status": "present", "color": "from-blue-500 to-indigo-600", "hue": "blue"},
        headers=headers,
    )
    return class_id, project.json()["id"]


async def test_deleting_a_project_only_removes_it_for_that_student(client, conn):
    res = await client.delete(f"/api/projects/{PROJECT}", headers=auth(ALEX))
    assert (res.status_code, res.json()) == (200, {"success": True})

    assert PROJECT not in await project_ids(client, auth(ALEX))
    res = await client.get(f"/api/projects/{PROJECT}", headers=auth(ALEX))
    assert (res.status_code, res.json()) == (403, {"error": "You do not have access to this project"})
    # Being in the class does not bring it back on a visit
    assert (await client.post(f"/api/projects/{PROJECT}/visit", headers=auth(ALEX))).status_code == 403

    assert PROJECT in await project_ids(client, auth(SARAH))
    team = (await client.get(f"/api/projects/{PROJECT}/team", headers=auth(SARAH))).json()
    assert [m["id"] for m in team] == [2, 3]


async def test_teachers_cannot_delete_projects_or_classes(client, conn):
    res = await client.delete(f"/api/projects/{PROJECT}", headers=auth(MR_DAVIS))
    assert (res.status_code, res.json()) == (403, {"error": "Only students can delete projects"})
    res = await client.delete("/api/classes/1", headers=auth(MR_DAVIS))
    assert (res.status_code, res.json()) == (403, {"error": "Only students can delete classes"})


async def test_cannot_delete_a_class_or_project_you_are_not_in(client, outsider):
    res = await client.delete("/api/classes/1", headers=outsider)
    assert (res.status_code, res.json()) == (403, {"error": "You are not a member of this class"})
    assert (await client.delete(f"/api/projects/{PROJECT}", headers=outsider)).status_code == 403


async def test_project_is_erased_once_nobody_has_it(client, conn):
    class_id, project_id = await create_class_with_project(client, auth(ALEX))

    await client.delete(f"/api/projects/{project_id}", headers=auth(ALEX))
    assert not await conn.fetchval("SELECT 1 FROM projects WHERE id = $1", project_id)
    # The class stays: Alex is still in it
    assert class_id in await class_ids(client, auth(ALEX))


async def test_deleting_a_class_leaves_it_for_classmates(client, conn):
    res = await client.delete("/api/classes/1", headers=auth(ALEX))
    assert (res.status_code, res.json()) == (200, {"success": True})

    assert 1 not in await class_ids(client, auth(ALEX))
    assert not set(await project_ids(client, auth(ALEX))) & {101, 102, 103}
    assert 1 in await class_ids(client, auth(SARAH))
    assert {101, 102, 103} <= set(await project_ids(client, auth(SARAH)))


async def test_shared_project_outlives_its_deleted_class_until_shared_users_delete_it(client, conn, outsider):
    class_id, project_id = await create_class_with_project(client, auth(ALEX))
    await client.post(
        f"/api/projects/{project_id}/team/invite", json={"email": "olive@example.com"}, headers=auth(ALEX)
    )

    await client.delete(f"/api/classes/{class_id}", headers=auth(ALEX))
    assert class_id not in await class_ids(client, auth(ALEX))
    assert project_id not in await project_ids(client, auth(ALEX))

    # Olive still has it, under "Shared"
    classes = (await client.get("/api/classes", headers=outsider)).json()
    assert [(cls["id"], [p["id"] for p in cls["projects"]]) for cls in classes] == [("shared", [project_id])]
    assert (await client.get(f"/api/projects/{project_id}", headers=outsider)).status_code == 200

    await client.delete(f"/api/projects/{project_id}", headers=outsider)
    assert not await conn.fetchval("SELECT 1 FROM projects WHERE id = $1", project_id)
    assert not await conn.fetchval("SELECT 1 FROM classes WHERE id = $1", class_id)


async def test_deleting_a_class_deletes_shared_projects_filed_under_it(client, conn, outsider):
    await client.post(
        f"/api/projects/{PROJECT}/team/invite", json={"email": "olive@example.com"}, headers=auth(ALEX)
    )
    class_id = (await client.post("/api/classes", json={"className": "Mine"}, headers=outsider)).json()[
        "class"
    ]["id"]
    await client.put(f"/api/projects/{PROJECT}/class", json={"classId": class_id}, headers=outsider)

    await client.delete(f"/api/classes/{class_id}", headers=outsider)
    assert await project_ids(client, outsider) == []
    assert not await conn.fetchval("SELECT 1 FROM classes WHERE id = $1", class_id)
    # Everyone else still has the project
    assert PROJECT in await project_ids(client, auth(SARAH))


async def test_rejoining_a_class_or_being_invited_again_brings_projects_back(client):
    await client.delete("/api/classes/1", headers=auth(ALEX))
    await client.post("/api/classes/join", json={"joinCode": "8XYZ-2PLQ"}, headers=auth(ALEX))
    assert {101, 102, 103} <= set(await project_ids(client, auth(ALEX)))

    await client.delete(f"/api/projects/{PROJECT}", headers=auth(ALEX))
    await client.post(
        f"/api/projects/{PROJECT}/team/invite", json={"email": "alex@school.edu"}, headers=auth(SARAH)
    )
    assert PROJECT in await project_ids(client, auth(ALEX))
