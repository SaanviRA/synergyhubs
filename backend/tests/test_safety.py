"""The safety check on workspace chat, and the teacher review queue."""

import pytest

from app import notifications
from app.main import app
from app.moderation import RulesOnly, Verdict

from .conftest import ALEX, MR_DAVIS, MRS_SMITH, PROJECT, SARAH, auth

HOOK = "https://discord.com/api/webhooks/111/admin-token"


# A word in the message picks the fake model's verdict
FAKE_ACTIONS = {"[review]": "review", "[block]": "block", "[escalate]": "escalate"}


class FakeModerator:
    """Verdicts chosen by a word in the message, instead of the model."""

    version = "fake-1"

    def moderate(self, text):
        for word, action in FAKE_ACTIONS.items():
            if word in text:
                return Verdict(action, ["insult"], {"insult": 0.9})
        return Verdict("allow", [], {"insult": 0.01})


@pytest.fixture
def fake_model(client):
    app.state.moderator = FakeModerator()


@pytest.fixture
def sent(monkeypatch):
    messages = []

    async def fake_send(url, content):
        messages.append((url, content))

    monkeypatch.setattr(notifications, "send", fake_send)
    return messages


async def _workspace(client):
    res = await client.post(
        f"/api/projects/{PROJECT}/workspaces",
        json={"title": "Essay draft", "type": "drive", "url": "https://drive.google.com/x"},
        headers=auth(ALEX),
    )
    return res.json()["id"]


async def _post(client, ws, text, user=ALEX, confirmed=False):
    return await client.post(
        f"/api/workspaces/{ws}/messages", json={"text": text, "confirmed": confirmed}, headers=auth(user)
    )


async def _texts(client, ws, user):
    res = await client.get(f"/api/workspaces/{ws}/messages", headers=auth(user))
    return [(m["text"], m["status"]) for m in res.json()]


async def _flags(client, user):
    res = await client.get("/api/safety/flags", headers=auth(user))
    assert res.status_code == 200
    return res.json()


async def test_allowed_messages_are_posted_without_a_flag(client, conn, fake_model):
    ws = await _workspace(client)
    res = await _post(client, ws, "I rewrote the intro")
    assert (res.json()["text"], res.json()["status"], res.json()["support"]) == (
        "I rewrote the intro",
        "visible",
        False,
    )
    assert await conn.fetchval("SELECT COUNT(*) FROM moderation_flags") == 0


async def test_review_asks_the_writer_first_then_posts_and_flags(client, conn, fake_model):
    ws = await _workspace(client)
    res = await _post(client, ws, "that was dumb [review]")
    assert res.json() == {"nudge": True}
    assert await _texts(client, ws, SARAH) == []

    res = await _post(client, ws, "that was dumb [review]", confirmed=True)
    assert res.json()["status"] == "visible"
    assert await _texts(client, ws, SARAH) == [("that was dumb [review]", "visible")]
    flag = await conn.fetchrow("SELECT action, categories, scores, model_version FROM moderation_flags")
    assert (flag["action"], flag["categories"], flag["model_version"]) == ("review", ["insult"], "fake-1")


async def test_blocked_messages_are_held_and_seen_only_by_the_writer(client, conn, fake_model):
    ws = await _workspace(client)
    res = await _post(client, ws, "you are awful [block]")
    assert res.json()["status"] == "held"

    assert await _texts(client, ws, ALEX) == [("you are awful [block]", "held")]
    assert await _texts(client, ws, SARAH) == []
    # A held message does not count as unread for anyone else
    unread = await client.get(f"/api/projects/{PROJECT}/workspaces/unread", headers=auth(SARAH))
    assert unread.json() == {"total": 0}


async def test_rules_alone_catch_self_harm_without_the_model(client, conn, sent):
    """Without the model, the rule layer still runs."""
    await conn.execute("UPDATE users SET is_admin = TRUE WHERE id = $1", MRS_SMITH["id"])
    await conn.execute(
        "INSERT INTO admin_webhooks (user_id, webhook_url, events) VALUES ($1, $2, ARRAY['user_added'])",
        MRS_SMITH["id"],
        HOOK,
    )
    ws = await _workspace(client)

    # The writer may be at risk: held, and admins hear about it whatever events they picked
    res = await _post(client, ws, "i want to die, nobody cares")
    assert (res.json()["status"], res.json()["support"]) == ("held", True)
    assert await conn.fetchval("SELECT action FROM moderation_flags") == "escalate"
    assert len(sent) == 1
    url, content = sent[0]
    assert url == HOOK
    assert "Urgent safety alert" in content and "AP US History / Cold War Perspectives" in content
    assert "class teacher" in content
    # Never the student or the message
    assert "Alex" not in content and "die" not in content

    # Telling someone to hurt themselves is held for review
    assert (await _post(client, ws, "ur so ugly, kys")).json()["status"] == "held"

    # The topic coming up is posted without a nudge, and a teacher glances at it
    res = await _post(client, ws, "We read about suicide prevention in health class")
    assert res.json()["status"] == "visible"
    assert [f["action"] for f in await _flags(client, MR_DAVIS)] == ["escalate", "block", "review"]
    assert len(sent) == 1


async def test_class_teachers_review_flags(client, conn, fake_model):
    ws = await _workspace(client)
    await _post(client, ws, "See you at lunch", user=SARAH)
    await _post(client, ws, "you are awful [block]")

    # Students, and teachers of other classes, do not review class 1
    assert await _flags(client, SARAH) == []
    assert await _flags(client, MRS_SMITH) == []
    res = await client.post("/api/safety/flags/1/review", json={"decision": "approved"}, headers=auth(SARAH))
    assert res.status_code == 404

    [flag] = await _flags(client, MR_DAVIS)
    assert flag["action"] == "block"
    assert flag["message"] == {
        "id": flag["message"]["id"],
        "author": "Alex M.",
        "text": "you are awful [block]",
        "status": "held",
    }
    assert (flag["className"], flag["projectName"], flag["workspaceTitle"]) == (
        "AP US History",
        "Cold War Perspectives",
        "Essay draft",
    )
    assert [(c["author"], c["text"]) for c in flag["context"]] == [("Sarah K.", "See you at lunch")]
    assert flag["otherFlags"] == 0

    base = f"/api/safety/flags/{flag['id']}/review"
    res = await client.post(base, json={"decision": "maybe"}, headers=auth(MR_DAVIS))
    assert res.status_code == 400
    res = await client.post(base, json={"decision": "approved"}, headers=auth(MR_DAVIS))
    assert res.json() == {"success": True, "status": "visible"}
    assert ("you are awful [block]", "visible") in await _texts(client, ws, SARAH)
    assert await _flags(client, MR_DAVIS) == []

    res = await client.post(base, json={"decision": "removed"}, headers=auth(MR_DAVIS))
    assert (res.status_code, res.json()) == (409, {"error": "This message has already been reviewed"})


async def test_removed_messages_stay_hidden_and_repeat_flags_are_counted(client, conn, fake_model):
    ws = await _workspace(client)
    await _post(client, ws, "first [block]")
    await _post(client, ws, "second [block]")

    first, second = await _flags(client, MR_DAVIS)
    assert (first["otherFlags"], second["otherFlags"]) == (1, 1)

    res = await client.post(
        f"/api/safety/flags/{first['id']}/review", json={"decision": "removed"}, headers=auth(MR_DAVIS)
    )
    assert res.json()["status"] == "removed"
    assert await _texts(client, ws, SARAH) == []
    assert ("first [block]", "removed") in await _texts(client, ws, ALEX)


async def test_admins_review_classes_without_a_teacher(client, conn, fake_model):
    # Alex creates a class: Alex owns it but is a student, so Alex does not review it
    class_id = (
        await client.post("/api/classes", json={"className": "Study Group"}, headers=auth(ALEX))
    ).json()["class"]["id"]
    project = await client.post(
        f"/api/classes/{class_id}/projects",
        json={"name": "Poster", "status": "present", "color": "from-blue-500 to-indigo-600", "hue": "blue"},
        headers=auth(ALEX),
    )
    ws = await client.post(
        f"/api/projects/{project.json()['id']}/workspaces",
        json={"title": "Plan", "type": "other", "url": "#"},
        headers=auth(ALEX),
    )
    await _post(client, ws.json()["id"], "nasty [block]")

    assert await _flags(client, ALEX) == []
    assert await _flags(client, MR_DAVIS) == []
    await conn.execute("UPDATE users SET is_admin = TRUE WHERE id = $1", MRS_SMITH["id"])
    assert [f["className"] for f in await _flags(client, MRS_SMITH)] == ["Study Group"]


async def test_reviewed_flags_and_removed_messages_are_deleted_after_180_days(client, conn, fake_model):
    ws = await _workspace(client)
    await _post(client, ws, "kept [block]")
    await _post(client, ws, "gone [block]")
    kept, gone = await _flags(client, MR_DAVIS)
    for flag, decision in ((kept, "approved"), (gone, "removed")):
        await client.post(
            f"/api/safety/flags/{flag['id']}/review", json={"decision": decision}, headers=auth(MR_DAVIS)
        )

    await conn.execute("UPDATE moderation_flags SET reviewed_at = CURRENT_TIMESTAMP - INTERVAL '181 days'")
    await _flags(client, MR_DAVIS)
    assert await conn.fetchval("SELECT COUNT(*) FROM moderation_flags") == 0
    # The approved message is ordinary chat now; the removed one is gone
    assert await _texts(client, ws, ALEX) == [("kept [block]", "visible")]


@pytest.mark.parametrize(
    "text",
    [
        "you shouldn't be here",
        "you don't belong here",
        "nobody wants you in this group, just quit",
        "no one likes you",
        "get out of our group",
        "why are you even here",
        "n0body likes you",
        "nadie te quiere",
        "personne ne veut de toi",
        "niemand mag dich",
    ],
)
def test_rules_catch_telling_someone_they_are_not_wanted(text):
    # The model scores these as harmless; the writer is asked to think again, never held
    assert RulesOnly().moderate(text).action == "review"
    assert "exclusion" in RulesOnly().moderate(text).categories


@pytest.mark.parametrize(
    "text",
    [
        "is this allowed",
        "nobody is here yet",
        "you should be here by 3",
        "why are you here so early?",
        "we don't want you to stay up late finishing this",
        "nobody wants you to redo it",
        "get out of the doc when you're done so I can edit",
    ],
)
def test_exclusion_rules_leave_ordinary_chat_alone(text):
    assert RulesOnly().moderate(text).action == "allow"
