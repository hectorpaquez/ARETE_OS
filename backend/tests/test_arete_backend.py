"""ARETÉ backend regression tests"""
import os, time, uuid, pytest, requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://arete-core.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

TS = int(time.time())
U1 = {"email": f"tester_{TS}@arete.dev", "password": "Testing1234!", "name": "Tester One"}
U2 = {"email": f"tester2_{TS}@arete.dev", "password": "Testing1234!", "name": "Tester Two"}

state = {}


def auth_headers(tok): return {"Authorization": f"Bearer {tok}"}


def test_01_health():
    r = requests.get(f"{API}/health", timeout=15)
    assert r.status_code == 200 and r.json().get("ok") is True


def test_02_register_user1():
    r = requests.post(f"{API}/auth/register", json=U1, timeout=15)
    assert r.status_code == 201, r.text
    data = r.json()
    assert "token" in data and data["user"]["email"] == U1["email"]
    state["u1_token"] = data["token"]
    state["u1_id"] = data["user"]["id"]


def test_03_register_user2():
    r = requests.post(f"{API}/auth/register", json=U2, timeout=15)
    assert r.status_code == 201
    state["u2_token"] = r.json()["token"]


def test_04_login_wrong_pwd():
    r = requests.post(f"{API}/auth/login", json={"email": U1["email"], "password": "wrong!!"}, timeout=15)
    assert r.status_code == 401


def test_05_login_ok():
    r = requests.post(f"{API}/auth/login", json={"email": U1["email"], "password": U1["password"]}, timeout=15)
    assert r.status_code == 200 and "token" in r.json()


def test_06_me():
    r = requests.get(f"{API}/auth/me", headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200 and r.json()["email"] == U1["email"]


def test_07_no_token_401():
    r = requests.get(f"{API}/pages", timeout=15)
    assert r.status_code in (401, 403)


def test_08_create_page_with_wikilinks():
    body = {"title": f"Alpha_{TS}", "content": "See [[Beta_{}]] and [[Gamma_{}]].".format(TS, TS), "tags": ["test", "core"]}
    r = requests.post(f"{API}/pages", json=body, headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 201, r.text
    d = r.json()
    state["alpha_id"] = d["id"]
    assert d["title"] == body["title"]
    assert d["tags"] == ["test", "core"]


def test_09_stubs_auto_created():
    r = requests.get(f"{API}/pages", headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    titles = {p["title"]: p for p in r.json()}
    beta = titles.get(f"Beta_{TS}")
    assert beta is not None and beta["status"] == "stub"
    state["beta_id"] = beta["id"]


def test_10_by_title_case_insensitive():
    r = requests.get(f"{API}/pages/by-title/beta_{TS}", headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200 and r.json()["id"] == state["beta_id"]


def test_11_backlinks():
    r = requests.get(f"{API}/pages/{state['beta_id']}/backlinks", headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    links = r.json()
    assert any(l["source_id"] == state["alpha_id"] for l in links)


def test_12_update_title_propagates_links():
    new_title = f"AlphaRenamed_{TS}"
    r = requests.put(f"{API}/pages/{state['alpha_id']}", json={"title": new_title},
                     headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200 and r.json()["title"] == new_title
    r2 = requests.get(f"{API}/pages/{state['beta_id']}/backlinks", headers=auth_headers(state["u1_token"]), timeout=15)
    assert any(l.get("source_title") == new_title for l in r2.json())


def test_13_tags():
    r = requests.get(f"{API}/tags", headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    tags = {t["tag"]: t["count"] for t in r.json()}
    assert "test" in tags


def test_14_search():
    r = requests.get(f"{API}/search", params={"q": f"Beta_{TS}"}, headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    pages = r.json()["pages"]
    assert any(p["id"] == state["beta_id"] for p in pages)


def test_15_graph():
    r = requests.get(f"{API}/graph", headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "nodes" in d and "edges" in d
    assert any(n["id"] == state["alpha_id"] for n in d["nodes"])
    assert any(e["source"] == state["alpha_id"] and e["target"] == state["beta_id"] for e in d["edges"])


def test_16_activity():
    r = requests.get(f"{API}/activity", headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    acts = r.json()
    assert any(a["action"] in ("create", "update") for a in acts)


def test_17_stats():
    r = requests.get(f"{API}/stats", headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ("pages", "stubs", "links", "tags"):
        assert k in d and isinstance(d[k], int)
    assert d["stubs"] >= 2 and d["links"] >= 2


def test_18_user_scoped():
    r = requests.get(f"{API}/pages", headers=auth_headers(state["u2_token"]), timeout=15)
    assert r.status_code == 200
    ids = {p["id"] for p in r.json()}
    assert state["alpha_id"] not in ids


def test_19_delete_page():
    r = requests.delete(f"{API}/pages/{state['alpha_id']}", headers=auth_headers(state["u1_token"]), timeout=15)
    assert r.status_code == 200
    r2 = requests.get(f"{API}/pages/{state['alpha_id']}", headers=auth_headers(state["u1_token"]), timeout=15)
    assert r2.status_code == 404
    r3 = requests.get(f"{API}/pages/{state['beta_id']}/backlinks", headers=auth_headers(state["u1_token"]), timeout=15)
    assert not any(l["source_id"] == state["alpha_id"] for l in r3.json())
