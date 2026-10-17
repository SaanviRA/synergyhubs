import pytest

from .conftest import ALEX, MR_DAVIS, MRS_SMITH, PROJECT, auth


async def _workspace(client):
    res = await client.post(
        f"/api/projects/{PROJECT}/workspaces",
        json={"title": "Google Doc", "type": "drive", "url": "https://docs.google.com/document/d/abc/edit"},
        headers=auth(ALEX),
    )
    return res.json()["id"]


async def _rename(client, workspace_id, title, headers):
    return await client.patch(f"/api/workspaces/{workspace_id}", json={"title": title}, headers=headers)


async def test_members_and_teachers_can_rename(client):
    ws = await _workspace(client)
    res = await _rename(client, ws, "  Essay draft  ", auth(ALEX))
    assert (res.status_code, res.json()["title"]) == (200, "Essay draft")
    await _rename(client, ws, "Final essay", auth(MR_DAVIS))
    res = await client.get(f"/api/projects/{PROJECT}/workspaces", headers=auth(ALEX))
    assert [w["title"] for w in res.json()] == ["Final essay"]


@pytest.mark.parametrize("title", [None, "", "   ", "x" * 201])
async def test_blank_or_long_titles_are_refused(client, conn, title):
    ws = await _workspace(client)
    assert (await _rename(client, ws, title, auth(ALEX))).status_code == 400
    assert await conn.fetchval("SELECT title FROM workspaces WHERE id = $1", ws) == "Google Doc"


async def test_outsiders_cannot_rename(client, conn, outsider):
    ws = await _workspace(client)
    for headers in (outsider, auth(MRS_SMITH)):
        assert (await _rename(client, ws, "Hijacked", headers)).status_code == 403
    assert await conn.fetchval("SELECT title FROM workspaces WHERE id = $1", ws) == "Google Doc"
    assert (await _rename(client, 999999, "Nope", auth(ALEX))).status_code == 404
