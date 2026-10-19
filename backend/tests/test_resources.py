import pytest

from app.utils import today_label

from .conftest import ALEX, MR_DAVIS, PROJECT, auth

CASES = [
    (
        "resources",
        "resource",
        "uploader",
        {"title": "NASA archive", "type": "link", "url": "https://nasa.gov"},
    ),
    (
        "workspaces",
        "workspace",
        "creator",
        {"title": "Design board", "type": "canva", "url": "https://canva.com/x"},
    ),
]


@pytest.mark.parametrize(("plural", "single", "owner", "body"), CASES)
async def test_create_list_delete(client, plural, single, owner, body):
    base = f"/api/projects/{PROJECT}/{plural}"
    before = (await client.get(base, headers=auth(ALEX))).json()

    res = await client.post(base, json=body, headers=auth(ALEX))
    assert res.status_code == 200
    created = res.json()
    # The owner name comes from the token, never from the request
    expected = {**body, "id": created["id"], owner: "Alex M.", "date": today_label()}
    # Workspaces also carry the caller's unread chat count
    assert created == ({**expected, "unread": 0} if plural == "workspaces" else expected)

    listed = (await client.get(base, headers=auth(ALEX))).json()
    assert listed == [created, *before]

    # Any member of the class can remove it, including the teacher
    res = await client.delete(f"/api/{plural}/{created['id']}", headers=auth(MR_DAVIS))
    assert res.json() == {"success": True}
    assert (await client.get(base, headers=auth(ALEX))).json() == before

    # Deleting something that is already gone still succeeds
    assert (await client.delete(f"/api/{plural}/{created['id']}", headers=auth(ALEX))).json() == {
        "success": True
    }


@pytest.mark.parametrize(("plural", "single", "owner", "body"), CASES)
async def test_validation(client, plural, single, owner, body):
    base = f"/api/projects/{PROJECT}/{plural}"
    res = await client.post(base, json={**body, "title": " "}, headers=auth(ALEX))
    assert (res.status_code, res.json()) == (400, {"error": "Title is required"})
    res = await client.post(base, json={**body, "type": "malware"}, headers=auth(ALEX))
    assert (res.status_code, res.json()) == (400, {"error": f"Invalid {single} type"})


async def test_seeded_resources_shape(client):
    resources = (await client.get(f"/api/projects/{PROJECT}/resources", headers=auth(ALEX))).json()
    assert [r["id"] for r in resources] == [4, 3, 2, 1]
    assert resources[-1] == {
        "id": 1,
        "title": "Project Rubric",
        "type": "doc",
        "url": "#",
        "uploader": "Mr. Davis",
        "date": "Mar 10",
    }


async def test_outsider_cannot_delete_a_workspace(client, conn, outsider):
    created = (
        await client.post(
            f"/api/projects/{PROJECT}/workspaces",
            json={"title": "Repo", "type": "other", "url": "#"},
            headers=auth(ALEX),
        )
    ).json()
    res = await client.delete(f"/api/workspaces/{created['id']}", headers=outsider)
    assert res.status_code == 403
    assert await conn.fetchval("SELECT COUNT(*) FROM workspaces WHERE id = $1", created["id"]) == 1


async def test_workspaces_can_only_be_added_on_offered_platforms(client):
    base = f"/api/projects/{PROJECT}/workspaces"
    for platform in ("drive", "canva", "microsoft", "other"):
        body = {"title": platform, "type": platform, "url": "https://example.com"}
        assert (await client.post(base, json=body, headers=auth(ALEX))).status_code == 200

    # No longer offered
    for platform in ("figma", "miro", "github"):
        res = await client.post(base, json={"title": "x", "type": platform, "url": "#"}, headers=auth(ALEX))
        assert (res.status_code, res.json()) == (400, {"error": "Invalid workspace type"})
