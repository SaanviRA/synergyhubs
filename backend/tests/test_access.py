"""The security fixes: every endpoint needs a token, and project data needs membership."""

import pytest

from .conftest import ALEX, MRS_SMITH, PROJECT, auth

PROTECTED = [
    ("GET", "/api/users/me"),
    ("PUT", "/api/users/me"),
    ("GET", "/api/classes"),
    ("POST", "/api/classes"),
    ("POST", "/api/classes/join"),
    ("POST", "/api/classes/1/projects"),
    ("GET", f"/api/projects/{PROJECT}"),
    ("POST", f"/api/projects/{PROJECT}/visit"),
    ("PUT", f"/api/projects/{PROJECT}/class"),
    ("GET", f"/api/projects/{PROJECT}/student-history"),
    ("GET", f"/api/projects/{PROJECT}/team"),
    ("POST", f"/api/projects/{PROJECT}/team/invite"),
    ("POST", f"/api/projects/{PROJECT}/team/role"),
    ("DELETE", f"/api/projects/{PROJECT}/team/role"),
    ("POST", f"/api/projects/{PROJECT}/team/update"),
    ("GET", f"/api/projects/{PROJECT}/logs"),
    ("POST", f"/api/projects/{PROJECT}/logs"),
    ("DELETE", f"/api/projects/{PROJECT}/logs/1"),
    ("GET", f"/api/projects/{PROJECT}/milestones"),
    ("PATCH", f"/api/projects/{PROJECT}/milestones/1"),
    ("POST", f"/api/projects/{PROJECT}/milestones/1/submit"),
    ("GET", f"/api/projects/{PROJECT}/resources"),
    ("POST", f"/api/projects/{PROJECT}/resources"),
    ("DELETE", "/api/resources/1"),
    ("GET", f"/api/projects/{PROJECT}/workspaces"),
    ("POST", f"/api/projects/{PROJECT}/workspaces"),
    ("DELETE", "/api/workspaces/1"),
]

# Requests an authenticated user with no link to class 1 / project 101 must not be able to make
PROJECT_SCOPED = [
    ("GET", f"/api/projects/{PROJECT}", None),
    ("POST", f"/api/projects/{PROJECT}/visit", None),
    ("PUT", f"/api/projects/{PROJECT}/class", {"classId": 2}),
    ("GET", f"/api/projects/{PROJECT}/student-history", None),
    ("GET", f"/api/projects/{PROJECT}/team", None),
    ("POST", f"/api/projects/{PROJECT}/team/invite", {"email": "x@example.com"}),
    ("POST", f"/api/projects/{PROJECT}/team/role", {"userId": 1, "role": "Boss"}),
    ("DELETE", f"/api/projects/{PROJECT}/team/role", {"userId": 1, "role": "Researcher"}),
    ("POST", f"/api/projects/{PROJECT}/team/update", {"text": "hi"}),
    ("GET", f"/api/projects/{PROJECT}/logs", None),
    ("POST", f"/api/projects/{PROJECT}/logs", {"text": "hi"}),
    ("DELETE", f"/api/projects/{PROJECT}/logs/1", None),
    ("GET", f"/api/projects/{PROJECT}/milestones", None),
    ("PATCH", f"/api/projects/{PROJECT}/milestones/1", {"status": "pending"}),
    ("POST", f"/api/projects/{PROJECT}/milestones/1/submit", {"fileName": "x.pdf"}),
    ("GET", f"/api/projects/{PROJECT}/resources", None),
    ("POST", f"/api/projects/{PROJECT}/resources", {"title": "x", "type": "link", "url": "#"}),
    ("DELETE", "/api/resources/1", None),
    ("GET", f"/api/projects/{PROJECT}/workspaces", None),
    ("POST", f"/api/projects/{PROJECT}/workspaces", {"title": "x", "type": "other", "url": "#"}),
]


@pytest.mark.parametrize(("method", "path"), PROTECTED)
async def test_requests_without_a_token_are_rejected(client, method, path):
    res = await client.request(method, path)
    assert (res.status_code, res.json()) == (401, {"error": "Authentication required"})


@pytest.mark.parametrize(("method", "path"), PROTECTED)
async def test_requests_with_a_bad_token_are_rejected(client, method, path):
    res = await client.request(method, path, headers={"Authorization": "Bearer not-a-token"})
    assert (res.status_code, res.json()) == (403, {"error": "Invalid or expired authentication token"})


@pytest.mark.parametrize(("method", "path", "body"), PROJECT_SCOPED)
async def test_non_members_cannot_touch_a_project(client, conn, outsider, method, path, body):
    before = await _snapshot(conn)
    res = await client.request(method, path, json=body, headers=outsider)
    assert (res.status_code, res.json()) == (403, {"error": "You do not have access to this project"})
    assert await _snapshot(conn) == before


@pytest.mark.parametrize(("method", "path", "body"), PROJECT_SCOPED)
async def test_teacher_of_another_class_cannot_touch_a_project(client, method, path, body):
    res = await client.request(method, path, json=body, headers=auth(MRS_SMITH))
    assert res.status_code == 403


async def test_unknown_project_is_404(client):
    res = await client.get("/api/projects/99999/team", headers=auth(ALEX))
    assert (res.status_code, res.json()) == (404, {"error": "Project not found"})


async def test_non_numeric_ids_are_a_400(client):
    res = await client.get("/api/projects/abc/team", headers=auth(ALEX))
    assert (res.status_code, res.json()) == (400, {"error": "Invalid request"})


async def _snapshot(conn):
    return await conn.fetchrow(
        """SELECT (SELECT COUNT(*) FROM users) AS users,
                  (SELECT COUNT(*) FROM project_members) AS members,
                  (SELECT COUNT(*) FROM evaluation_logs) AS logs,
                  (SELECT COUNT(*) FROM resources) AS resources,
                  (SELECT COUNT(*) FROM workspaces) AS workspaces,
                  (SELECT string_agg(status, ',' ORDER BY id) FROM milestones) AS milestones,
                  (SELECT string_agg(array_to_string(roles, '|'), ',' ORDER BY user_id) FROM project_members) AS roles"""
    )
