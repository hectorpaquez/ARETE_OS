"""
Security fix regression tests for ARETÉ:
- SEC-001: JWT_SECRET must be env-loaded (no fallback), forged tokens signed with
  the OLD hardcoded secret must be rejected. Normal auth must still work.
- SEC-002: AI endpoint errors must return a generic French message with no raw
  exception text (Traceback/Exception/API key).
- Regression: Multi-tenant isolation + core flows (pages/entities/relations/
  context/search/tracking/pillars).
"""
from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"

OLD_HARDCODED_SECRET = "arete-dev-secret-change-in-prod-64chars-minimum-length-required"
GENERIC_AI_ERROR = "Le service IA est momentanément indisponible. Réessayez."


# ----------------------- Fixtures -----------------------
def _register(prefix: str) -> dict:
    email = f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@arete.dev"
    r = requests.post(
        f"{BASE_URL}/auth/register",
        json={"email": email, "password": "Testing1234!", "name": prefix},
        timeout=15,
    )
    assert r.status_code == 201, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    return {"email": email, "token": data["token"], "user": data["user"]}


@pytest.fixture(scope="module")
def user_a():
    return _register("A")


@pytest.fixture(scope="module")
def user_b():
    return _register("B")


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ============================================================
# SEC-001: JWT secret hardening
# ============================================================
class TestSec001JwtSecret:
    def test_forged_token_with_old_hardcoded_secret_rejected(self, user_a):
        """A token signed with the OLD hardcoded secret must NOT be accepted."""
        payload = {
            "sub": user_a["user"]["id"],
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        }
        forged = jwt.encode(payload, OLD_HARDCODED_SECRET, algorithm="HS256")
        r = requests.get(f"{BASE_URL}/auth/me", headers=_auth(forged), timeout=10)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"

    def test_forged_random_sub_with_old_secret_rejected(self):
        payload = {
            "sub": str(uuid.uuid4()),
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        }
        forged = jwt.encode(payload, OLD_HARDCODED_SECRET, algorithm="HS256")
        r = requests.get(f"{BASE_URL}/auth/me", headers=_auth(forged), timeout=10)
        assert r.status_code == 401

    def test_no_auth_header_returns_401(self):
        r = requests.get(f"{BASE_URL}/auth/me", timeout=10)
        assert r.status_code == 401

    def test_random_garbage_bearer_returns_401(self):
        r = requests.get(
            f"{BASE_URL}/auth/me",
            headers=_auth("this.is.not-a-valid-jwt-abcdef"),
            timeout=10,
        )
        assert r.status_code == 401

    def test_real_register_login_me_flow_works(self):
        email = f"TEST_flow_{uuid.uuid4().hex[:8]}@arete.dev"
        pwd = "Testing1234!"
        r = requests.post(
            f"{BASE_URL}/auth/register",
            json={"email": email, "password": pwd, "name": "Flow"},
            timeout=15,
        )
        assert r.status_code == 201
        token1 = r.json()["token"]

        r2 = requests.get(f"{BASE_URL}/auth/me", headers=_auth(token1), timeout=10)
        assert r2.status_code == 200
        assert r2.json()["email"].lower() == email.lower()

        r3 = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": email, "password": pwd},
            timeout=15,
        )
        assert r3.status_code == 200, r3.text
        token2 = r3.json()["token"]

        r4 = requests.get(f"{BASE_URL}/auth/me", headers=_auth(token2), timeout=10)
        assert r4.status_code == 200
        assert r4.json()["email"].lower() == email.lower()


# ============================================================
# SEC-002: AI error messages sanitized
# ============================================================
class TestSec002AiErrorSanitization:
    def test_summarize_success_or_generic_error(self, user_a):
        """Create a page then call /ai/summarize. If it fails, error must be sanitized."""
        # Create page with content
        r = requests.post(
            f"{BASE_URL}/pages",
            headers=_auth(user_a["token"]),
            json={
                "title": f"TEST_AI_Page_{uuid.uuid4().hex[:6]}",
                "content": "Aristotle developed the concept of areté (excellence). "
                           "It refers to the fulfillment of one's highest purpose. "
                           "The Stoics later expanded this into their own ethics.",
            },
            timeout=15,
        )
        assert r.status_code == 201, r.text
        page_id = r.json()["id"]

        r2 = requests.post(
            f"{BASE_URL}/ai/summarize",
            headers=_auth(user_a["token"]),
            json={"page_id": page_id, "save": False},
            timeout=90,
        )
        if r2.status_code == 200:
            body = r2.json()
            assert "summary" in body
            assert isinstance(body["summary"], str)
        elif r2.status_code in (502, 503):
            body = r2.json()
            detail = str(body.get("detail", ""))
            # Sanitized: no traceback / raw exception text / api key leakage
            forbidden = ["Traceback", "Exception", "openai", "OpenAI", "sk-", "APIError", "asyncio"]
            for f in forbidden:
                assert f not in detail, f"Error leaked '{f}': {detail}"
            if r2.status_code == 502:
                assert detail == GENERIC_AI_ERROR, f"Expected generic msg, got: {detail}"
        else:
            pytest.fail(f"Unexpected status {r2.status_code}: {r2.text}")


# ============================================================
# REGRESSION: Multi-tenant isolation
# ============================================================
class TestRegressionTenantIsolation:
    def test_user_b_cannot_access_user_a_page(self, user_a, user_b):
        # A creates a page
        r = requests.post(
            f"{BASE_URL}/pages",
            headers=_auth(user_a["token"]),
            json={"title": f"TEST_A_page_{uuid.uuid4().hex[:6]}", "content": "secret A"},
            timeout=15,
        )
        assert r.status_code == 201
        page_id = r.json()["id"]

        rb = requests.get(f"{BASE_URL}/pages/{page_id}", headers=_auth(user_b["token"]), timeout=10)
        assert rb.status_code == 404, f"Tenant leak! got {rb.status_code}: {rb.text}"

    def test_user_b_cannot_access_user_a_goal(self, user_a, user_b):
        r = requests.post(
            f"{BASE_URL}/entities/goal",
            headers=_auth(user_a["token"]),
            json={"title": f"TEST_A_goal_{uuid.uuid4().hex[:6]}", "description": "confidential"},
            timeout=15,
        )
        assert r.status_code == 201, r.text
        goal_id = r.json()["id"]

        rb = requests.get(
            f"{BASE_URL}/entities/goal/{goal_id}",
            headers=_auth(user_b["token"]),
            timeout=10,
        )
        assert rb.status_code in (401, 404), f"Tenant leak: {rb.status_code} {rb.text}"

    def test_user_b_cannot_get_user_a_knowledge_context(self, user_a, user_b):
        # Create a knowledge page for A
        r = requests.post(
            f"{BASE_URL}/pages",
            headers=_auth(user_a["token"]),
            json={"title": f"TEST_A_ctx_{uuid.uuid4().hex[:6]}", "content": "sensitive A ctx"},
            timeout=15,
        )
        assert r.status_code == 201
        page_id = r.json()["id"]
        rb = requests.get(
            f"{BASE_URL}/entities/knowledge/{page_id}/context",
            headers=_auth(user_b["token"]),
            timeout=10,
        )
        assert rb.status_code in (401, 404)


# ============================================================
# REGRESSION: Core flows still work
# ============================================================
class TestRegressionCoreFlows:
    def test_wiki_link_and_backlinks(self, user_a):
        h = _auth(user_a["token"])
        target_title = f"TEST_Target_{uuid.uuid4().hex[:6]}"
        source_title = f"TEST_Source_{uuid.uuid4().hex[:6]}"
        # Create source page that links to target via [[wiki link]]
        r = requests.post(
            f"{BASE_URL}/pages",
            headers=h,
            json={"title": source_title, "content": f"See also [[{target_title}]] for details."},
            timeout=15,
        )
        assert r.status_code == 201, r.text
        src_id = r.json()["id"]

        # Target page should be auto-created as stub
        rt = requests.get(f"{BASE_URL}/pages/by-title/{target_title}", headers=h, timeout=10)
        assert rt.status_code == 200
        target_id = rt.json()["id"]

        # Backlinks on target should include source
        rb = requests.get(f"{BASE_URL}/pages/{target_id}/backlinks", headers=h, timeout=10)
        assert rb.status_code == 200
        rows = rb.json()
        assert any(r.get("source_id") == src_id for r in rows), f"No backlink from src: {rows}"

    def test_entities_goal_project_task_and_relation(self, user_a):
        h = _auth(user_a["token"])

        # Create goal
        rg = requests.post(
            f"{BASE_URL}/entities/goal",
            headers=h,
            json={"title": f"TEST_Goal_{uuid.uuid4().hex[:5]}", "description": "grow"},
            timeout=15,
        )
        assert rg.status_code == 201, rg.text
        goal = rg.json()

        # Create project
        rp = requests.post(
            f"{BASE_URL}/entities/project",
            headers=h,
            json={"title": f"TEST_Proj_{uuid.uuid4().hex[:5]}"},
            timeout=15,
        )
        assert rp.status_code == 201
        proj = rp.json()

        # Create task
        rt = requests.post(
            f"{BASE_URL}/entities/task",
            headers=h,
            json={"title": f"TEST_Task_{uuid.uuid4().hex[:5]}"},
            timeout=15,
        )
        assert rt.status_code == 201
        task = rt.json()

        # Relation goal has_project project
        rr = requests.post(
            f"{BASE_URL}/relations",
            headers=h,
            json={
                "source_type": "goal", "source_id": goal["id"],
                "target_type": "project", "target_id": proj["id"],
                "relation_type": "has_project",
            },
            timeout=15,
        )
        assert rr.status_code == 201, rr.text

        # Context on goal returns something
        rc = requests.get(
            f"{BASE_URL}/entities/goal/{goal['id']}/context",
            headers=h,
            timeout=15,
        )
        assert rc.status_code == 200
        assert isinstance(rc.json(), dict)

    def test_universal_search(self, user_a):
        h = _auth(user_a["token"])
        rs = requests.get(f"{BASE_URL}/search/universal?q=TEST", headers=h, timeout=15)
        assert rs.status_code == 200
        assert isinstance(rs.json(), (dict, list))

    def test_tracking(self, user_a):
        h = _auth(user_a["token"])
        r = requests.get(f"{BASE_URL}/tracking?days=14", headers=h, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "journals" in data
        assert "workouts" in data
        assert "studies" in data

    def test_pillars(self, user_a):
        h = _auth(user_a["token"])
        r = requests.get(f"{BASE_URL}/pillars", headers=h, timeout=15)
        assert r.status_code == 200
        pillars = r.json()
        assert isinstance(pillars, list)
        assert len(pillars) == 5
        slugs = {p.get("slug") for p in pillars}
        assert {"maitre-de-soi", "guerrier", "savant", "strategiste", "chef"}.issubset(slugs)
