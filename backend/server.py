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

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

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
    """Extract [[wiki links]] from content, upsert link records, and auto-create referenced pages if missing."""
    targets = list({m.group(1).strip() for m in WIKI_LINK_RE.finditer(content or "") if m.group(1).strip()})

    # Ensure target pages exist (create stub if missing so backlinks resolve)
    resolved: List[dict] = []
    for title in targets:
        existing = await db.pages.find_one(
            {"user_id": user_id, "title_lower": title.lower()}, {"_id": 0}
        )
        if not existing:
            new_id = str(uuid.uuid4())
            doc = {
                "id": new_id,
                "user_id": user_id,
                "title": title,
                "title_lower": title.lower(),
                "slug": slugify(title),
                "content": "",
                "summary": "",
                "tags": [],
                "status": "stub",
                "icon": None,
                "cover": None,
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }
            await db.pages.insert_one(doc)
            await log_activity(user_id, "auto_create", "page", new_id, {"reason": "wiki-link stub", "from": page_id})
            resolved.append(doc)
        else:
            resolved.append(existing)

    # Remove any existing links from this page then re-insert
    await db.links.delete_many({"user_id": user_id, "source_id": page_id})
    if resolved:
        await db.links.insert_many([
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "source_id": page_id,
                "source_title": page_title,
                "target_id": t["id"],
                "target_title": t["title"],
                "relation": "references",
                "created_at": now_iso(),
            }
            for t in resolved
        ])


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
        # Also update link records where this page is the target if title changed
        if "title" in updates:
            await db.links.update_many(
                {"user_id": user["id"], "target_id": page_id},
                {"$set": {"target_title": updates["title"]}},
            )
            await db.links.update_many(
                {"user_id": user["id"], "source_id": page_id},
                {"$set": {"source_title": updates["title"]}},
            )
        await resolve_links_and_update(user["id"], page_id, new_page["title"], new_page.get("content", ""))
    await log_activity(user["id"], "update", "page", page_id, {"title": new_page["title"]})
    new_page.pop("_id", None); new_page.pop("user_id", None); new_page.pop("title_lower", None)
    return PageOut(**new_page)


@api.delete("/pages/{page_id}")
async def delete_page(page_id: str, user: dict = Depends(get_current_user)):
    page = await db.pages.find_one({"id": page_id, "user_id": user["id"]})
    if not page:
        raise HTTPException(404, "Page not found")
    await db.pages.delete_one({"id": page_id, "user_id": user["id"]})
    await db.links.delete_many({"user_id": user["id"], "$or": [{"source_id": page_id}, {"target_id": page_id}]})
    await log_activity(user["id"], "delete", "page", page_id, {"title": page.get("title")})
    return {"ok": True}


@api.get("/pages/{page_id}/backlinks")
async def backlinks(page_id: str, user: dict = Depends(get_current_user)):
    cursor = db.links.find(
        {"user_id": user["id"], "target_id": page_id}, {"_id": 0, "user_id": 0}
    ).sort("created_at", -1)
    return [l async for l in cursor]


@api.get("/pages/{page_id}/outlinks")
async def outlinks(page_id: str, user: dict = Depends(get_current_user)):
    cursor = db.links.find(
        {"user_id": user["id"], "source_id": page_id}, {"_id": 0, "user_id": 0}
    ).sort("created_at", -1)
    return [l async for l in cursor]


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
async def graph(user: dict = Depends(get_current_user)):
    pages_cursor = db.pages.find({"user_id": user["id"]}, {"_id": 0, "id": 1, "title": 1, "status": 1, "tags": 1})
    nodes = [{"id": p["id"], "label": p["title"], "status": p.get("status", "draft")} async for p in pages_cursor]
    links_cursor = db.links.find({"user_id": user["id"]}, {"_id": 0, "source_id": 1, "target_id": 1, "relation": 1})
    edges = [
        {"source": l["source_id"], "target": l["target_id"], "relation": l.get("relation", "references")}
        async for l in links_cursor
    ]
    return {"nodes": nodes, "edges": edges}


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
    links_count = await db.links.count_documents({"user_id": user["id"]})
    tag_pipeline = [
        {"$match": {"user_id": user["id"]}},
        {"$unwind": "$tags"},
        {"$group": {"_id": "$tags"}},
        {"$count": "total"},
    ]
    tag_total = 0
    async for row in db.pages.aggregate(tag_pipeline):
        tag_total = row.get("total", 0)
    return {
        "pages": pages_count,
        "stubs": stubs_count,
        "links": links_count,
        "tags": tag_total,
    }


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
    log.info("ARETÉ Core started; indices ready.")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
