"""
ARETÉ Core Backend
- JWT email/password auth
- Knowledge entities (Pages, Links, Tags, Activity)
- Bidirectional wiki-links, backlinks, global search, graph
All routes are prefixed with /api
"""
from __future__ import annotations

import os
import re
import uuid
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from starlette.middleware.cors import CORSMiddleware

import ai_service
from core.db import client, db
from core import entities as entity_service
from core import relations as relation_service
from core import context as context_service
from core import search as search_service
from core import graph as graph_service

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ.get("JWT_SECRET", "arete-dev-secret-change-in-prod-64chars-minimum-length-required")
JWT_ALGO = "HS256"
JWT_EXPIRES_HOURS = 24 * 30  # 30 days

app = FastAPI(title="ARETÉ Core")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s")
log = logging.getLogger("arete")

WIKI_LINK_RE = re.compile(r"\[\[([^\[\]\n]+?)\]\]")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRES_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def slugify(title: str) -> str:
    s = re.sub(r"[^\w\s-]", "", title.lower()).strip()
    s = re.sub(r"[\s_-]+", "-", s)
    return s or "untitled"


async def get_current_user(cred: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if not cred or not cred.credentials:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(cred.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


async def log_activity(user_id: str, action: str, entity_type: str, entity_id: str, meta: dict | None = None):
    await db.activity.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "meta": meta or {},
        "created_at": now_iso(),
    })


async def resolve_links_and_update(user_id: str, page_id: str, page_title: str, content: str):
    """Extract [[wiki links]] from content, auto-create referenced knowledge
    pages as stubs if missing, and persist typed Entity->Entity relations
    (knowledge --references--> knowledge). Backlinks resolve via relations."""
    targets = list({m.group(1).strip() for m in WIKI_LINK_RE.finditer(content or "") if m.group(1).strip()})

    resolved: List[dict] = []
    for title in targets:
        existing = await db.pages.find_one(
            {"user_id": user_id, "title_lower": title.lower()}, {"_id": 0}
        )
        if not existing:
            stub_id = str(uuid.uuid4())
            doc = {
                "id": stub_id,
                "user_id": user_id,
                "entity_type": "knowledge",
                "title": title,
                "title_lower": title.lower(),
                "slug": slugify(title),
                "content": "",
                "summary": "",
                "tags": [],
                "status": "stub",
                "archived": False,
                "icon": None,
                "cover": None,
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }
            await db.pages.insert_one(doc)
            await log_activity(user_id, "auto_create", "knowledge", stub_id, {"reason": "wiki-link stub", "from": page_id})
            resolved.append(doc)
        else:
            resolved.append(existing)

    # Rebuild the "references" relations originating from this knowledge page.
    await relation_service.delete_outgoing_of_type(user_id, "knowledge", page_id, "references")
    for t in resolved:
        await relation_service.create_relation(
            user_id, "knowledge", page_id, "knowledge", t["id"], "references"
        )


def clean_doc(d: dict | None) -> dict | None:
    if d is None:
        return None
    d.pop("_id", None)
    return d


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: Optional[str] = None
    created_at: str


class AuthOut(BaseModel):
    token: str
    user: UserOut


class PageIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    content: str = ""
    summary: Optional[str] = ""
    tags: List[str] = []
    status: Optional[str] = "draft"
    icon: Optional[str] = None
    cover: Optional[str] = None


class PageUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    summary: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = None
    icon: Optional[str] = None
    cover: Optional[str] = None


class PageOut(BaseModel):
    id: str
    title: str
    slug: str
    content: str
    summary: str
    tags: List[str]
    status: str
    icon: Optional[str] = None
    cover: Optional[str] = None
    created_at: str
    updated_at: str


# ---------------------------------------------------------------------------
# Health & root
# ---------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"app": "ARETÉ Core", "status": "ok"}


@api.get("/health")
async def health():
    await db.command("ping")
    return {"ok": True, "time": now_iso()}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@api.post("/auth/register", response_model=AuthOut, status_code=201)
async def register(body: RegisterIn):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Email already registered")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": email,
        "name": body.name or email.split("@")[0],
        "password_hash": hash_password(body.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    token = create_token(user_id)
    return AuthOut(
        token=token,
        user=UserOut(id=user_id, email=email, name=doc["name"], created_at=doc["created_at"]),
    )


@api.post("/auth/login", response_model=AuthOut)
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Incorrect email or password")
    token = create_token(user["id"])
    return AuthOut(
        token=token,
        user=UserOut(id=user["id"], email=user["email"], name=user.get("name"), created_at=user["created_at"]),
    )


@api.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return UserOut(id=user["id"], email=user["email"], name=user.get("name"), created_at=user["created_at"])


# ---------------------------------------------------------------------------
# Pages (Knowledge)
# ---------------------------------------------------------------------------
@api.get("/pages", response_model=List[PageOut])
async def list_pages(
    q: Optional[str] = None,
    tag: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = 200,
    user: dict = Depends(get_current_user),
):
    query: Dict[str, Any] = {"user_id": user["id"]}
    if q:
        query["title_lower"] = {"$regex": re.escape(q.lower())}
    if tag:
        query["tags"] = tag
    if status_filter:
        query["status"] = status_filter
    cursor = db.pages.find(query, {"_id": 0, "user_id": 0, "title_lower": 0}).sort("updated_at", -1).limit(limit)
    return [PageOut(**p) async for p in cursor]


@api.post("/pages", response_model=PageOut, status_code=201)
async def create_page(body: PageIn, user: dict = Depends(get_current_user)):
    # Reuse an existing "stub" page if same title exists
    existing = await db.pages.find_one({"user_id": user["id"], "title_lower": body.title.lower()})
    if existing and existing.get("status") != "stub":
        raise HTTPException(409, "A page with this title already exists")

    page_id = existing["id"] if existing else str(uuid.uuid4())
    doc = {
        "id": page_id,
        "user_id": user["id"],
        "title": body.title,
        "title_lower": body.title.lower(),
        "slug": slugify(body.title),
        "content": body.content or "",
        "summary": body.summary or "",
        "tags": body.tags or [],
        "status": body.status or "draft",
        "icon": body.icon,
        "cover": body.cover,
        "created_at": existing["created_at"] if existing else now_iso(),
        "updated_at": now_iso(),
    }
    if existing:
        await db.pages.update_one({"id": page_id, "user_id": user["id"]}, {"$set": doc})
    else:
        await db.pages.insert_one(doc)

    await resolve_links_and_update(user["id"], page_id, doc["title"], doc["content"])
    await log_activity(user["id"], "create" if not existing else "update", "page", page_id, {"title": doc["title"]})
    return PageOut(**{k: v for k, v in doc.items() if k in PageOut.model_fields})


@api.get("/pages/{page_id}", response_model=PageOut)
async def get_page(page_id: str, user: dict = Depends(get_current_user)):
    page = await db.pages.find_one({"id": page_id, "user_id": user["id"]}, {"_id": 0, "user_id": 0, "title_lower": 0})
    if not page:
        raise HTTPException(404, "Page not found")
    return PageOut(**page)


@api.get("/pages/by-title/{title}", response_model=PageOut)
async def get_page_by_title(title: str, user: dict = Depends(get_current_user)):
    page = await db.pages.find_one(
        {"user_id": user["id"], "title_lower": title.lower()},
        {"_id": 0, "user_id": 0, "title_lower": 0},
    )
    if not page:
        raise HTTPException(404, "Page not found")
    return PageOut(**page)


@api.put("/pages/{page_id}", response_model=PageOut)
async def update_page(page_id: str, body: PageUpdate, user: dict = Depends(get_current_user)):
    page = await db.pages.find_one({"id": page_id, "user_id": user["id"]})
    if not page:
        raise HTTPException(404, "Page not found")
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if "title" in updates:
        updates["title_lower"] = updates["title"].lower()
        updates["slug"] = slugify(updates["title"])
    # If the page was a stub and content is being added, promote it
    if page.get("status") == "stub" and updates.get("content"):
        updates.setdefault("status", "draft")
    updates["updated_at"] = now_iso()
    await db.pages.update_one({"id": page_id, "user_id": user["id"]}, {"$set": updates})

    new_page = await db.pages.find_one({"id": page_id, "user_id": user["id"]})
    if "content" in updates or "title" in updates:
        # Relations use stable IDs, so a title change needs no relation rewrite.
        await resolve_links_and_update(user["id"], page_id, new_page["title"], new_page.get("content", ""))
    await log_activity(user["id"], "update", "knowledge", page_id, {"title": new_page["title"]})
    new_page.pop("_id", None); new_page.pop("user_id", None); new_page.pop("title_lower", None)
    return PageOut(**new_page)


@api.delete("/pages/{page_id}")
async def delete_page(page_id: str, user: dict = Depends(get_current_user)):
    page = await db.pages.find_one({"id": page_id, "user_id": user["id"]})
    if not page:
        raise HTTPException(404, "Page not found")
    await db.pages.delete_one({"id": page_id, "user_id": user["id"]})
    # Cascade delete relations touching this knowledge entity
    await db.relations.delete_many(
        {"user_id": user["id"], "$or": [
            {"source_type": "knowledge", "source_id": page_id},
            {"target_type": "knowledge", "target_id": page_id},
        ]}
    )
    # Legacy links cleanup (kept for reversibility)
    await db.links.delete_many({"user_id": user["id"], "$or": [{"source_id": page_id}, {"target_id": page_id}]})
    await log_activity(user["id"], "delete", "knowledge", page_id, {"title": page.get("title")})
    return {"ok": True}


async def _resolve_relation_rows(user_id: str, rels: list, side: str) -> list:
    """Turn relation docs into legacy-compatible {source_id, source_title, target_id, target_title, relation} rows."""
    out = []
    for r in rels:
        other_type = r["source_type"] if side == "source" else r["target_type"]
        other_id = r["source_id"] if side == "source" else r["target_id"]
        ent = await entity_service.get_entity(other_type, other_id, user_id)
        title = ent["title"] if ent else "(supprimé)"
        row = {
            "id": r["id"],
            "relation": r["relation_type"],
            "relation_type": r["relation_type"],
            "source_id": r["source_id"],
            "target_id": r["target_id"],
            "source_type": r["source_type"],
            "target_type": r["target_type"],
            "created_at": r.get("created_at"),
        }
        if side == "source":
            row["source_title"] = title
            row["source_entity_type"] = other_type
        else:
            row["target_title"] = title
            row["target_entity_type"] = other_type
        out.append(row)
    return out


@api.get("/pages/{page_id}/backlinks")
async def backlinks(page_id: str, user: dict = Depends(get_current_user)):
    rels = await relation_service.get_incoming(user["id"], "knowledge", page_id)
    return await _resolve_relation_rows(user["id"], rels, "source")


@api.get("/pages/{page_id}/outlinks")
async def outlinks(page_id: str, user: dict = Depends(get_current_user)):
    rels = await relation_service.get_outgoing(user["id"], "knowledge", page_id)
    return await _resolve_relation_rows(user["id"], rels, "target")


# ---------------------------------------------------------------------------
# Tags, search, graph, activity
# ---------------------------------------------------------------------------
@api.get("/tags")
async def list_tags(user: dict = Depends(get_current_user)):
    pipeline = [
        {"$match": {"user_id": user["id"]}},
        {"$unwind": "$tags"},
        {"$group": {"_id": "$tags", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    result = []
    async for row in db.pages.aggregate(pipeline):
        result.append({"tag": row["_id"], "count": row["count"]})
    return result


@api.get("/search")
async def global_search(q: str = Query(..., min_length=1), user: dict = Depends(get_current_user)):
    ql = q.lower()
    pages_cursor = db.pages.find(
        {
            "user_id": user["id"],
            "$or": [
                {"title_lower": {"$regex": re.escape(ql)}},
                {"content": {"$regex": re.escape(q), "$options": "i"}},
                {"tags": {"$regex": re.escape(ql)}},
            ],
        },
        {"_id": 0, "user_id": 0, "title_lower": 0},
    ).limit(30)
    pages = [p async for p in pages_cursor]
    return {"pages": pages}


@api.get("/graph")
async def graph(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    depth: int = 2,
    limit: int = 120,
    relation_type: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    # Local scalable graph when a seed entity is provided.
    if entity_type and entity_id:
        return await graph_service.local_graph(
            user["id"], entity_type, entity_id, depth=depth, limit=limit, relation_type=relation_type
        )
    # Backward-compatible full knowledge graph (existing Graphe tab).
    return await graph_service.knowledge_graph(user["id"])


@api.get("/activity")
async def activity(limit: int = 50, user: dict = Depends(get_current_user)):
    cursor = db.activity.find(
        {"user_id": user["id"]}, {"_id": 0, "user_id": 0}
    ).sort("created_at", -1).limit(limit)
    return [a async for a in cursor]


@api.get("/stats")
async def stats(user: dict = Depends(get_current_user)):
    pages_count = await db.pages.count_documents({"user_id": user["id"], "status": {"$ne": "stub"}})
    stubs_count = await db.pages.count_documents({"user_id": user["id"], "status": "stub"})
    links_count = await db.relations.count_documents({"user_id": user["id"]})
    tag_pipeline = [
        {"$match": {"user_id": user["id"]}},
        {"$unwind": "$tags"},
        {"$group": {"_id": "$tags"}},
        {"$count": "total"},
    ]
    tag_total = 0
    async for row in db.pages.aggregate(tag_pipeline):
        tag_total = row.get("total", 0)
    counts = {}
    for et in ("goal", "project", "task", "telos", "journal"):
        counts[et] = await db[entity_service.collection_for(et)].count_documents(
            {"user_id": user["id"], "archived": {"$ne": True}}
        )
    return {
        "pages": pages_count,
        "stubs": stubs_count,
        "links": links_count,
        "tags": tag_total,
        "goals": counts["goal"],
        "projects": counts["project"],
        "tasks": counts["task"],
        "telos": counts["telos"],
        "journal": counts["journal"],
    }


# ---------------------------------------------------------------------------
# ARETÉ CORE — generic Entities, Relations, Context, Universal Search
# ---------------------------------------------------------------------------
class EntityIn(BaseModel):
    title: str = Field(min_length=1, max_length=400)
    description: Optional[str] = None
    content: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    progress: Optional[float] = None
    deadline: Optional[str] = None
    due_date: Optional[str] = None
    start_date: Optional[str] = None
    date: Optional[str] = None
    estimated_minutes: Optional[int] = None
    actual_minutes: Optional[int] = None
    mood: Optional[str] = None
    author: Optional[str] = None
    vision: Optional[str] = None
    principles: Optional[str] = None
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None


class EntityUpdate(EntityIn):
    title: Optional[str] = None


class RelationIn(BaseModel):
    source_type: str
    source_id: str
    target_type: str
    target_id: str
    relation_type: str = "related_to"
    metadata: Optional[Dict[str, Any]] = None


def _check_type(entity_type: str):
    if not entity_service.is_valid_type(entity_type):
        raise HTTPException(400, f"Type d'entité inconnu: {entity_type}")


# ---- Generic entity CRUD (knowledge keeps its own /pages endpoints) --------
@api.get("/entities/{entity_type}")
async def list_entities_ep(
    entity_type: str,
    q: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    user: dict = Depends(get_current_user),
):
    _check_type(entity_type)
    return await entity_service.list_entities(entity_type, user["id"], q=q, status=status_filter)


@api.post("/entities/{entity_type}", status_code=201)
async def create_entity_ep(entity_type: str, body: EntityIn, user: dict = Depends(get_current_user)):
    _check_type(entity_type)
    if entity_type not in entity_service.GENERIC_TYPES:
        raise HTTPException(400, "Utilisez /pages pour les entités knowledge.")
    data = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    return await entity_service.create_entity(entity_type, user["id"], data)


@api.get("/entities/{entity_type}/{entity_id}")
async def get_entity_ep(entity_type: str, entity_id: str, user: dict = Depends(get_current_user)):
    _check_type(entity_type)
    ent = await entity_service.get_entity(entity_type, entity_id, user["id"], full=True)
    if not ent:
        raise HTTPException(404, "Entité introuvable")
    return ent


@api.put("/entities/{entity_type}/{entity_id}")
async def update_entity_ep(entity_type: str, entity_id: str, body: EntityUpdate, user: dict = Depends(get_current_user)):
    _check_type(entity_type)
    patch = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    ent = await entity_service.update_entity(entity_type, entity_id, user["id"], patch)
    if not ent:
        raise HTTPException(404, "Entité introuvable")
    return ent


@api.delete("/entities/{entity_type}/{entity_id}")
async def delete_entity_ep(entity_type: str, entity_id: str, user: dict = Depends(get_current_user)):
    _check_type(entity_type)
    ok = await entity_service.delete_entity(entity_type, entity_id, user["id"])
    if not ok:
        raise HTTPException(404, "Entité introuvable")
    return {"ok": True}


@api.get("/entities/{entity_type}/{entity_id}/relations")
async def entity_relations_ep(entity_type: str, entity_id: str, user: dict = Depends(get_current_user)):
    _check_type(entity_type)
    out = await relation_service.get_outgoing(user["id"], entity_type, entity_id)
    inc = await relation_service.get_incoming(user["id"], entity_type, entity_id)
    return {"outgoing": out, "incoming": inc}


@api.get("/entities/{entity_type}/{entity_id}/backlinks")
async def entity_backlinks_ep(entity_type: str, entity_id: str, user: dict = Depends(get_current_user)):
    _check_type(entity_type)
    rels = await relation_service.get_incoming(user["id"], entity_type, entity_id)
    return await _resolve_relation_rows(user["id"], rels, "source")


@api.get("/entities/{entity_type}/{entity_id}/outlinks")
async def entity_outlinks_ep(entity_type: str, entity_id: str, user: dict = Depends(get_current_user)):
    _check_type(entity_type)
    rels = await relation_service.get_outgoing(user["id"], entity_type, entity_id)
    return await _resolve_relation_rows(user["id"], rels, "target")


@api.get("/entities/{entity_type}/{entity_id}/context")
async def entity_context_ep(
    entity_type: str, entity_id: str, depth: int = 3, user: dict = Depends(get_current_user)
):
    _check_type(entity_type)
    ctx = await context_service.get_entity_context(entity_type, entity_id, user["id"], depth=depth)
    if not ctx:
        raise HTTPException(404, "Entité introuvable")
    return ctx


# ---- Relations -------------------------------------------------------------
@api.post("/relations", status_code=201)
async def create_relation_ep(body: RelationIn, user: dict = Depends(get_current_user)):
    _check_type(body.source_type)
    _check_type(body.target_type)
    if not await entity_service.entity_exists(body.source_type, body.source_id, user["id"]):
        raise HTTPException(404, "Entité source introuvable")
    if not await entity_service.entity_exists(body.target_type, body.target_id, user["id"]):
        raise HTTPException(404, "Entité cible introuvable")
    try:
        rel = await relation_service.create_relation(
            user["id"], body.source_type, body.source_id, body.target_type, body.target_id,
            body.relation_type, body.metadata,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    await log_activity(user["id"], "relate", body.source_type, body.source_id,
                       {"relation_type": body.relation_type, "target": body.target_id})
    return rel


@api.get("/relations")
async def query_relations_ep(
    source_type: Optional[str] = None,
    source_id: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    relation_type: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    return await relation_service.query(user["id"], {
        "source_type": source_type, "source_id": source_id,
        "target_type": target_type, "target_id": target_id,
        "relation_type": relation_type,
    })


@api.get("/relations/{relation_id}")
async def get_relation_ep(relation_id: str, user: dict = Depends(get_current_user)):
    rel = await relation_service.get_relation(user["id"], relation_id)
    if not rel:
        raise HTTPException(404, "Relation introuvable")
    return rel


@api.delete("/relations/{relation_id}")
async def delete_relation_ep(relation_id: str, user: dict = Depends(get_current_user)):
    ok = await relation_service.delete_relation(user["id"], relation_id)
    if not ok:
        raise HTTPException(404, "Relation introuvable")
    return {"ok": True}


@api.get("/relation-types")
async def relation_types_ep(user: dict = Depends(get_current_user)):
    return {"types": sorted(relation_service.KNOWN_RELATION_TYPES)}


# ---- Universal search ------------------------------------------------------
@api.get("/search/universal")
async def universal_search_ep(
    q: str = Query(..., min_length=1),
    types: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    type_list = [t.strip() for t in types.split(",")] if types else None
    return await search_service.universal_search(user["id"], q, types=type_list)



# ---------------------------------------------------------------------------
# Daimōn — AI layer (OpenAI GPT-5.4). Decoupled from CORE.
# ---------------------------------------------------------------------------
class SummarizeIn(BaseModel):
    page_id: str
    save: bool = True


class SuggestLinksIn(BaseModel):
    page_id: str


class ExpandIn(BaseModel):
    prompt: str
    page_id: Optional[str] = None


class ChatIn(BaseModel):
    message: str
    session_id: Optional[str] = None


@api.get("/ai/status")
async def ai_status(user: dict = Depends(get_current_user)):
    return {"enabled": bool(ai_service._api_key()), "model": ai_service.MODEL_NAME}


@api.post("/ai/summarize")
async def ai_summarize(body: SummarizeIn, user: dict = Depends(get_current_user)):
    page = await db.pages.find_one({"id": body.page_id, "user_id": user["id"]})
    if not page:
        raise HTTPException(404, "Page not found")
    if not (page.get("content") or "").strip():
        raise HTTPException(400, "La page est vide, rien à résumer.")
    try:
        summary = await ai_service.summarize_page(page["title"], page.get("content", ""))
    except ai_service.AIUnavailable as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        log.exception("ai_summarize failed")
        raise HTTPException(502, f"Erreur du modèle IA: {e}")
    if body.save and summary:
        await db.pages.update_one(
            {"id": body.page_id, "user_id": user["id"]},
            {"$set": {"summary": summary, "updated_at": now_iso()}},
        )
    return {"summary": summary}


@api.post("/ai/suggest-links")
async def ai_suggest_links(body: SuggestLinksIn, user: dict = Depends(get_current_user)):
    page = await db.pages.find_one({"id": body.page_id, "user_id": user["id"]})
    if not page:
        raise HTTPException(404, "Page not found")
    # Candidate titles = all other non-stub pages of this user
    cursor = db.pages.find(
        {"user_id": user["id"], "id": {"$ne": body.page_id}},
        {"_id": 0, "title": 1, "status": 1},
    ).limit(200)
    candidates = [p["title"] async for p in cursor]
    if not candidates:
        return {"suggestions": []}
    # Exclude titles already linked from this page
    existing = set()
    async for l in db.links.find({"user_id": user["id"], "source_id": body.page_id}, {"_id": 0, "target_title": 1}):
        existing.add(l["target_title"].lower())
    try:
        suggested = await ai_service.suggest_links(page["title"], page.get("content", ""), candidates)
    except ai_service.AIUnavailable as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        log.exception("ai_suggest_links failed")
        raise HTTPException(502, f"Erreur du modèle IA: {e}")
    suggested = [s for s in suggested if s.lower() not in existing]
    return {"suggestions": suggested}


@api.post("/ai/expand")
async def ai_expand(body: ExpandIn, user: dict = Depends(get_current_user)):
    existing_content = ""
    if body.page_id:
        page = await db.pages.find_one({"id": body.page_id, "user_id": user["id"]})
        if page:
            existing_content = page.get("content", "")
    if not body.prompt.strip():
        raise HTTPException(400, "Prompt vide.")
    try:
        text = await ai_service.expand_idea(body.prompt, existing_content)
    except ai_service.AIUnavailable as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        log.exception("ai_expand failed")
        raise HTTPException(502, f"Erreur du modèle IA: {e}")
    return {"text": text}


@api.post("/ai/chat")
async def ai_chat(body: ChatIn, user: dict = Depends(get_current_user)):
    if not body.message.strip():
        raise HTTPException(400, "Message vide.")
    session_id = body.session_id or str(uuid.uuid4())

    # Grounding context now comes from the CORE Context Engine (all entity types,
    # not just knowledge). Daimōn stays a layer ON TOP of the CORE.
    knowledge_context = await context_service.build_text_context(user["id"])

    # Load recent history for this session
    history = []
    async for m in db.ai_messages.find(
        {"user_id": user["id"], "session_id": session_id}, {"_id": 0, "role": 1, "content": 1}
    ).sort("created_at", 1).limit(20):
        history.append(m)

    try:
        answer = await ai_service.chat_daimon(body.message, knowledge_context, history, session_id)
    except ai_service.AIUnavailable as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        log.exception("ai_chat failed")
        raise HTTPException(502, f"Erreur du modèle IA: {e}")

    # Persist both messages
    ts = now_iso()
    await db.ai_messages.insert_many([
        {"id": str(uuid.uuid4()), "user_id": user["id"], "session_id": session_id,
         "role": "user", "content": body.message, "created_at": ts},
        {"id": str(uuid.uuid4()), "user_id": user["id"], "session_id": session_id,
         "role": "assistant", "content": answer, "created_at": now_iso()},
    ])
    return {"answer": answer, "session_id": session_id}


@api.get("/ai/chat/history")
async def ai_chat_history(session_id: str, user: dict = Depends(get_current_user)):
    cursor = db.ai_messages.find(
        {"user_id": user["id"], "session_id": session_id}, {"_id": 0, "user_id": 0}
    ).sort("created_at", 1).limit(200)
    return [m async for m in cursor]


# ---------------------------------------------------------------------------
# App wiring
# ---------------------------------------------------------------------------
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.pages.create_index([("user_id", 1), ("title_lower", 1)])
    await db.pages.create_index([("user_id", 1), ("updated_at", -1)])
    await db.links.create_index([("user_id", 1), ("source_id", 1)])
    await db.links.create_index([("user_id", 1), ("target_id", 1)])
    await db.activity.create_index([("user_id", 1), ("created_at", -1)])
    await db.ai_messages.create_index([("user_id", 1), ("session_id", 1), ("created_at", 1)])
    # Relations (CORE) indexes
    await db.relations.create_index([("user_id", 1), ("source_type", 1), ("source_id", 1)])
    await db.relations.create_index([("user_id", 1), ("target_type", 1), ("target_id", 1)])
    await db.relations.create_index([("user_id", 1), ("relation_type", 1)])
    # Entity collection indexes
    for coll in ("goals", "projects", "tasks", "journal", "telos", "books", "sources", "notes", "people"):
        await db[coll].create_index([("user_id", 1), ("updated_at", -1)])
        await db[coll].create_index([("user_id", 1), ("title", 1)])
    await _migrate_links_to_relations()
    log.info("ARETÉ Core started; indices ready.")


async def _migrate_links_to_relations():
    """Idempotent migration: legacy `links` (knowledge->knowledge references)
    become generic `relations`. The `links` collection is preserved untouched
    for reversibility."""
    migrated = 0
    async for l in db.links.find({}):
        exists = await db.relations.find_one({
            "user_id": l["user_id"],
            "source_type": "knowledge",
            "source_id": l["source_id"],
            "target_type": "knowledge",
            "target_id": l["target_id"],
            "relation_type": "references",
        })
        if exists:
            continue
        await db.relations.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": l["user_id"],
            "source_type": "knowledge",
            "source_id": l["source_id"],
            "target_type": "knowledge",
            "target_id": l["target_id"],
            "relation_type": "references",
            "metadata": {"migrated_from": "links"},
            "created_at": l.get("created_at", now_iso()),
            "created_by": l["user_id"],
        })
        migrated += 1
    if migrated:
        log.info(f"Migrated {migrated} legacy link(s) to relations.")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
