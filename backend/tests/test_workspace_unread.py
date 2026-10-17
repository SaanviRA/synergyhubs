from .conftest import ALEX, MR_DAVIS, PROJECT, SARAH, auth


async def _workspace(client, title):
    res = await client.post(
        f"/api/projects/{PROJECT}/workspaces",
        json={"title": title, "type": "drive", "url": "https://docs.google.com/document/d/x"},
        headers=auth(ALEX),
    )
    return res.json()["id"]


async def _post(client, workspace_id, user, text="hi"):
    await client.post(f"/api/workspaces/{workspace_id}/messages", json={"text": text}, headers=auth(user))


async def _unread(client, user):
    workspaces = (await client.get(f"/api/projects/{PROJECT}/workspaces", headers=auth(user))).json()
    total = (await client.get(f"/api/projects/{PROJECT}/workspaces/unread", headers=auth(user))).json()
    return {w["title"]: w["unread"] for w in workspaces}, total["total"]


async def test_unread_counts_per_workspace_and_in_total(client):
    essay, slides = await _workspace(client, "Essay"), await _workspace(client, "Slides")
    assert await _unread(client, SARAH) == ({"Essay": 0, "Slides": 0}, 0)

    await _post(client, essay, ALEX)
    await _post(client, essay, MR_DAVIS)
    await _post(client, slides, ALEX)
    # Your own messages are never unread
    assert await _unread(client, ALEX) == ({"Essay": 1, "Slides": 0}, 1)
    assert await _unread(client, SARAH) == ({"Essay": 2, "Slides": 1}, 3)

    # Opening a chat reads it, for that person only
    await client.get(f"/api/workspaces/{essay}/messages", headers=auth(SARAH))
    assert await _unread(client, SARAH) == ({"Essay": 0, "Slides": 1}, 1)
    assert await _unread(client, MR_DAVIS) == ({"Essay": 1, "Slides": 1}, 2)

    await _post(client, essay, ALEX, "one more")
    assert await _unread(client, SARAH) == ({"Essay": 1, "Slides": 1}, 2)


async def test_polling_marks_new_messages_read_without_going_back(client):
    ws = await _workspace(client, "Essay")
    await _post(client, ws, ALEX)
    first = (await client.get(f"/api/workspaces/{ws}/messages", headers=auth(SARAH))).json()
    await _post(client, ws, ALEX)
    # An empty poll past the newest message changes nothing
    await client.get(f"/api/workspaces/{ws}/messages", params={"after": 10**6}, headers=auth(SARAH))
    assert (await _unread(client, SARAH))[1] == 1
    await client.get(f"/api/workspaces/{ws}/messages", params={"after": first[0]["id"]}, headers=auth(SARAH))
    assert (await _unread(client, SARAH))[1] == 0


async def test_unread_total_needs_project_access(client, outsider):
    res = await client.get(f"/api/projects/{PROJECT}/workspaces/unread", headers=outsider)
    assert res.status_code == 403
