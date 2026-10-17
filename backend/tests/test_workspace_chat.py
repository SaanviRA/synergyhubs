import pytest

from .conftest import ALEX, MR_DAVIS, MRS_SMITH, PROJECT, SARAH, auth


async def _workspace(client, title="Essay draft"):
    res = await client.post(
        f"/api/projects/{PROJECT}/workspaces",
        json={"title": title, "type": "drive", "url": "https://drive.google.com/x"},
        headers=auth(ALEX),
    )
    return res.json()["id"]


async def _post(client, workspace_id, text, user=ALEX):
    return await client.post(
        f"/api/workspaces/{workspace_id}/messages", json={"text": text}, headers=auth(user)
    )


async def _messages(client, workspace_id, user=ALEX, after=None):
    params = {"after": after} if after is not None else None
    res = await client.get(f"/api/workspaces/{workspace_id}/messages", params=params, headers=auth(user))
    return res.json()


async def test_members_chat_about_a_workspace(client):
    ws = await _workspace(client)
    assert await _messages(client, ws) == []

    first = (await _post(client, ws, "  I rewrote the intro  ")).json()
    assert first["text"] == "I rewrote the intro"
    assert (first["author"], first["avatar"], first["mine"]) == ("Alex M.", "AM", True)
    await _post(client, ws, "Looks good, I'll fix the citations", user=SARAH)
    await _post(client, ws, "Please add a conclusion", user=MR_DAVIS)

    as_sarah = await _messages(client, ws, user=SARAH)
    assert [(m["author"], m["text"], m["mine"]) for m in as_sarah] == [
        ("Alex M.", "I rewrote the intro", False),
        ("Sarah K.", "Looks good, I'll fix the citations", True),
        ("Mr. Davis", "Please add a conclusion", False),
    ]
    newer = await _messages(client, ws, after=first["id"])
    assert [m["author"] for m in newer] == ["Sarah K.", "Mr. Davis"]


async def test_each_workspace_has_its_own_conversation(client):
    essay, slides = await _workspace(client, "Essay"), await _workspace(client, "Slides")
    await _post(client, essay, "About the essay")
    await _post(client, slides, "About the slides")
    assert [m["text"] for m in await _messages(client, essay)] == ["About the essay"]
    assert [m["text"] for m in await _messages(client, slides)] == ["About the slides"]


async def test_deleting_a_workspace_deletes_its_chat(client, conn):
    ws = await _workspace(client)
    await _post(client, ws, "hello")
    await client.delete(f"/api/workspaces/{ws}", headers=auth(ALEX))
    assert await conn.fetchval("SELECT COUNT(*) FROM workspace_messages") == 0
    res = await client.get(f"/api/workspaces/{ws}/messages", headers=auth(ALEX))
    assert (res.status_code, res.json()) == (404, {"error": "Workspace not found"})


async def test_deleted_authors_keep_their_name(client, conn):
    ws = await _workspace(client)
    await _post(client, ws, "bye", user=SARAH)
    await conn.execute("DELETE FROM users WHERE id = $1", SARAH["id"])
    [message] = await _messages(client, ws)
    assert (message["author"], message["avatar"], message["mine"]) == ("Sarah K.", "SK", False)


@pytest.mark.parametrize("text", [None, "", "   ", "x" * 2001])
async def test_empty_or_long_messages_are_refused(client, conn, text):
    ws = await _workspace(client)
    res = await _post(client, ws, text)
    assert res.status_code == 400
    assert await conn.fetchval("SELECT COUNT(*) FROM workspace_messages") == 0


async def test_outsiders_cannot_read_or_post(client, conn, outsider):
    ws = await _workspace(client)
    await _post(client, ws, "secret plans")
    for headers in (outsider, auth(MRS_SMITH)):
        res = await client.get(f"/api/workspaces/{ws}/messages", headers=headers)
        assert res.status_code == 403
        res = await client.post(f"/api/workspaces/{ws}/messages", json={"text": "hi"}, headers=headers)
        assert res.status_code == 403
    assert await conn.fetchval("SELECT COUNT(*) FROM workspace_messages") == 1


async def test_chat_needs_a_token(client):
    assert (await client.get("/api/workspaces/1/messages")).status_code == 401
    assert (await client.post("/api/workspaces/1/messages", json={"text": "hi"})).status_code == 401
