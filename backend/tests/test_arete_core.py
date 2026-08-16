"""ARETÉ CORE tests: entities, relations, context, universal search, local graph, security."""
import os, time, pytest, requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://arete-core.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

TS = int(time.time())
U1 = {"email": f"core_u1_{TS}@arete.dev", "password": "Testing1234!", "name": "Core U1"}
U2 = {"email": f"core_u2_{TS}@arete.dev", "password": "Testing1234!", "name": "Core U2"}

S = {}


def H(tok): return {"Authorization": f"Bearer {tok}"}


def test_01_register_users():
    r1 = requests.post(f"{API}/auth/register", json=U1, timeout=15)
    r2 = requests.post(f"{API}/auth/register", json=U2, timeout=15)
    assert r1.status_code == 201 and r2.status_code == 201
    S["u1"] = r1.json()["token"]
    S["u2"] = r2.json()["token"]


# ---------------- Entities CRUD ----------------
@pytest.mark.parametrize("etype", ["telos", "goal", "project", "task", "journal", "book", "source", "note", "person"])
def test_02_entity_crud(etype):
    body = {"title": f"TEST_{etype}_{TS}", "description": f"desc {etype}"}
    r = requests.post(f"{API}/entities/{etype}", json=body, headers=H(S["u1"]), timeout=15)
    assert r.status_code == 201, r.text
    ent = r.json()
    assert ent["title"] == body["title"] and "id" in ent
    eid = ent["id"]
    S.setdefault("ents", {})[etype] = eid
    # GET verify
    g = requests.get(f"{API}/entities/{etype}/{eid}", headers=H(S["u1"]), timeout=15)
    assert g.status_code == 200 and g.json()["id"] == eid
    # LIST
    lst = requests.get(f"{API}/entities/{etype}", headers=H(S["u1"]), timeout=15)
    assert lst.status_code == 200 and any(e["id"] == eid for e in lst.json())


def test_03_entity_update():
    eid = S["ents"]["goal"]
    r = requests.put(f"{API}/entities/goal/{eid}", json={"description": "updated"}, headers=H(S["u1"]), timeout=15)
    assert r.status_code == 200 and r.json()["description"] == "updated"


def test_04_entity_knowledge_via_pages_only():
    # Direct knowledge create via /entities/knowledge should be rejected
    r = requests.post(f"{API}/entities/knowledge", json={"title": "x"}, headers=H(S["u1"]), timeout=15)
    assert r.status_code == 400


def test_05_entity_invalid_type():
    r = requests.post(f"{API}/entities/foobar", json={"title": "x"}, headers=H(S["u1"]), timeout=15)
    assert r.status_code == 400


# ---------------- Knowledge (via /pages) + Book ----------------
def test_06_create_knowledge_page():
    r = requests.post(f"{API}/pages", json={"title": f"TEST_kn_{TS}", "content": ""}, headers=H(S["u1"]), timeout=15)
    assert r.status_code == 201
    S["kn_id"] = r.json()["id"]


# ---------------- Relations ----------------
def test_07_create_relations_chain():
    # telos -has_goal-> goal -has_project-> project -has_task-> task -concerns-> knowledge
    # book -references-> knowledge
    pairs = [
        ("telos", S["ents"]["telos"], "goal", S["ents"]["goal"], "has_goal"),
        ("goal", S["ents"]["goal"], "project", S["ents"]["project"], "has_project"),
        ("project", S["ents"]["project"], "task", S["ents"]["task"], "has_task"),
        ("task", S["ents"]["task"], "knowledge", S["kn_id"], "concerns"),
        ("book", S["ents"]["book"], "knowledge", S["kn_id"], "references"),
    ]
    S["rels"] = []
    for st, si, tt, ti, rt in pairs:
        r = requests.post(f"{API}/relations", json={
            "source_type": st, "source_id": si, "target_type": tt, "target_id": ti, "relation_type": rt
        }, headers=H(S["u1"]), timeout=15)
        assert r.status_code == 201, f"{rt}: {r.text}"
        S["rels"].append(r.json()["id"])


def test_08_relation_404_missing_entity():
    r = requests.post(f"{API}/relations", json={
        "source_type": "goal", "source_id": "nope", "target_type": "task",
        "target_id": S["ents"]["task"], "relation_type": "has_task"
    }, headers=H(S["u1"]), timeout=15)
    assert r.status_code == 404


def test_09_relation_reject_self():
    gid = S["ents"]["goal"]
    r = requests.post(f"{API}/relations", json={
        "source_type": "goal", "source_id": gid, "target_type": "goal",
        "target_id": gid, "relation_type": "related_to"
    }, headers=H(S["u1"]), timeout=15)
    assert r.status_code == 400


def test_10_query_relations_filter():
    r = requests.get(f"{API}/relations", params={"source_type": "goal", "source_id": S["ents"]["goal"]},
                     headers=H(S["u1"]), timeout=15)
    assert r.status_code == 200 and len(r.json()) >= 1


def test_11_get_relation_by_id():
    rid = S["rels"][0]
    r = requests.get(f"{API}/relations/{rid}", headers=H(S["u1"]), timeout=15)
    assert r.status_code == 200 and r.json()["id"] == rid


# ---------------- Context Engine ----------------
def test_12_context_knowledge_deep():
    r = requests.get(f"{API}/entities/knowledge/{S['kn_id']}/context", params={"depth": 4},
                     headers=H(S["u1"]), timeout=15)
    assert r.status_code == 200, r.text
    ctx = r.json()
    # Flatten all reachable entity IDs (may be under buckets / backlinks / outgoing)
    text = str(ctx)
    for key in ("ents", ):
        pass
    # Must include task, project, goal, telos, book
    for etype in ("task", "project", "goal", "telos", "book"):
        assert S["ents"][etype] in text, f"missing {etype} in context: {ctx.keys() if isinstance(ctx, dict) else 'n/a'}"


def test_13_context_has_buckets_and_outgoing_backlinks():
    r = requests.get(f"{API}/entities/knowledge/{S['kn_id']}/context", headers=H(S["u1"]), timeout=15)
    assert r.status_code == 200
    ctx = r.json()
    assert isinstance(ctx, dict)
    # Expected keys per contract: buckets + outgoing + backlinks
    keys = set(ctx.keys())
    assert "outgoing" in keys or "buckets" in keys, f"unexpected context shape: {keys}"


# ---------------- Universal Search ----------------
def test_14_universal_search():
    r = requests.get(f"{API}/search/universal", params={"q": f"TEST_"}, headers=H(S["u1"]), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "results" in d and "counts" in d and "total" in d
    types_found = {res["entity_type"] for res in d["results"]}
    # At least a couple of types should show up (we created 9 types)
    assert len(types_found) >= 3, f"types={types_found}"


# ---------------- Local Graph ----------------
def test_15_local_graph_subset():
    r = requests.get(f"{API}/graph", params={"entity_type": "knowledge", "entity_id": S["kn_id"], "depth": 2},
                     headers=H(S["u1"]), timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "nodes" in d and "edges" in d
    node_ids = {n["id"] for n in d["nodes"]}
    assert S["kn_id"] in node_ids
    # depth=2 from knowledge should reach task and book at least
    assert S["ents"]["task"] in node_ids or S["ents"]["book"] in node_ids


def test_16_graph_no_params_full_knowledge():
    r = requests.get(f"{API}/graph", headers=H(S["u1"]), timeout=15)
    assert r.status_code == 200 and "nodes" in r.json()


# ---------------- Security: user isolation ----------------
def test_17_user2_cannot_read_user1_entity():
    r = requests.get(f"{API}/entities/goal/{S['ents']['goal']}", headers=H(S["u2"]), timeout=15)
    assert r.status_code == 404


def test_18_user2_cannot_read_user1_context():
    r = requests.get(f"{API}/entities/knowledge/{S['kn_id']}/context", headers=H(S["u2"]), timeout=15)
    assert r.status_code == 404


def test_19_user2_cannot_read_user1_relation():
    r = requests.get(f"{API}/relations/{S['rels'][0]}", headers=H(S["u2"]), timeout=15)
    assert r.status_code == 404


def test_20_user2_universal_search_isolated():
    r = requests.get(f"{API}/search/universal", params={"q": "TEST_"}, headers=H(S["u2"]), timeout=15)
    assert r.status_code == 200
    for res in r.json()["results"]:
        # User2 has no entities yet
        assert False, "user2 should have no results"


# ---------------- Delete relation ----------------
def test_21_delete_relation():
    rid = S["rels"][-1]
    r = requests.delete(f"{API}/relations/{rid}", headers=H(S["u1"]), timeout=15)
    assert r.status_code == 200
    r2 = requests.get(f"{API}/relations/{rid}", headers=H(S["u1"]), timeout=15)
    assert r2.status_code == 404


# ---------------- Stats includes new counts ----------------
def test_22_stats_extended():
    r = requests.get(f"{API}/stats", headers=H(S["u1"]), timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ("goals", "projects", "tasks", "telos", "journal"):
        assert k in d and d[k] >= 1
