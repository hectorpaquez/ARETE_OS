"""
Entity registry — the common abstraction over ARETÉ's specialized collections.

Entity = common abstraction (NOT a single table). Each entity_type maps to its
own MongoDB collection, but every one is addressable as an Entity by the CORE.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from core.db import db, now_iso, new_id, slugify

# entity_type -> collection name
ENTITY_COLLECTIONS: Dict[str, str] = {
    "knowledge": "pages",       # existing knowledge pages
    "telos": "telos",
    "goal": "goals",
    "project": "projects",
    "task": "tasks",
    "journal": "journal",
    "book": "books",
    "source": "sources",
    "person": "people",
    "note": "notes",
}

# Types managed by the generic entity CRUD (knowledge keeps its own endpoints).
GENERIC_TYPES = {"telos", "goal", "project", "task", "journal", "book", "source", "person", "note"}

VALID_TYPES = set(ENTITY_COLLECTIONS.keys())


def collection_for(entity_type: str) -> Optional[str]:
    return ENTITY_COLLECTIONS.get(entity_type)


def is_valid_type(entity_type: str) -> bool:
    return entity_type in VALID_TYPES


def normalize(entity_type: str, doc: Optional[dict]) -> Optional[dict]:
    """Return a normalized, lightweight Entity view (safe to expose)."""
    if not doc:
        return None
    return {
        "id": doc.get("id"),
        "entity_type": entity_type,
        "title": doc.get("title") or doc.get("name") or "Sans titre",
        "slug": doc.get("slug"),
        "status": doc.get("status"),
        "archived": doc.get("archived", False),
        "summary": doc.get("summary") or "",
        "updated_at": doc.get("updated_at"),
        "created_at": doc.get("created_at"),
    }


def clean_full(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return None
    doc.pop("_id", None)
    doc.pop("user_id", None)
    doc.pop("title_lower", None)
    return doc


async def get_entity(entity_type: str, entity_id: str, user_id: str, full: bool = False) -> Optional[dict]:
    coll = collection_for(entity_type)
    if not coll:
        return None
    doc = await db[coll].find_one({"id": entity_id, "user_id": user_id})
    if not doc:
        return None
    if full:
        d = dict(doc)
        d.pop("_id", None)
        d.pop("user_id", None)
        d.pop("title_lower", None)
        d["entity_type"] = entity_type
        return d
    return normalize(entity_type, doc)


async def entity_exists(entity_type: str, entity_id: str, user_id: str) -> bool:
    coll = collection_for(entity_type)
    if not coll:
        return False
    return (await db[coll].count_documents({"id": entity_id, "user_id": user_id}, limit=1)) > 0


async def list_entities(
    entity_type: str, user_id: str, q: Optional[str] = None, status: Optional[str] = None, limit: int = 200
) -> List[dict]:
    coll = collection_for(entity_type)
    if not coll:
        return []
    query: Dict[str, Any] = {"user_id": user_id, "archived": {"$ne": True}}
    if q:
        query["title"] = {"$regex": _escape(q), "$options": "i"}
    if status:
        query["status"] = status
    cursor = db[coll].find(query).sort("updated_at", -1).limit(limit)
    return [normalize(entity_type, d) async for d in cursor]


async def create_entity(entity_type: str, user_id: str, data: dict) -> dict:
    coll = collection_for(entity_type)
    if not coll:
        raise ValueError(f"Unknown entity_type: {entity_type}")
    eid = new_id()
    title = (data.get("title") or "Sans titre").strip()
    doc: Dict[str, Any] = {
        "id": eid,
        "user_id": user_id,
        "entity_type": entity_type,
        "title": title,
        "slug": slugify(title),
        "status": data.get("status") or _default_status(entity_type),
        "archived": False,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "created_by": user_id,
        "updated_by": user_id,
    }
    # merge type-specific fields (excluding protected keys)
    for k, v in data.items():
        if k not in ("id", "user_id", "created_at", "created_by", "entity_type"):
            doc[k] = v
    await db[coll].insert_one(doc)
    await _log(user_id, "create", entity_type, eid, {"title": title})
    d = dict(doc)
    d.pop("_id", None)
    d.pop("user_id", None)
    return d


async def update_entity(entity_type: str, entity_id: str, user_id: str, patch: dict) -> Optional[dict]:
    coll = collection_for(entity_type)
    if not coll:
        return None
    updates = {k: v for k, v in patch.items() if v is not None and k not in ("id", "user_id", "entity_type")}
    if "title" in updates:
        updates["slug"] = slugify(updates["title"])
    updates["updated_at"] = now_iso()
    updates["updated_by"] = user_id
    res = await db[coll].update_one({"id": entity_id, "user_id": user_id}, {"$set": updates})
    if res.matched_count == 0:
        return None
    await _log(user_id, "update", entity_type, entity_id, {"title": updates.get("title")})
    return await get_entity(entity_type, entity_id, user_id, full=True)


async def delete_entity(entity_type: str, entity_id: str, user_id: str) -> bool:
    coll = collection_for(entity_type)
    if not coll:
        return False
    res = await db[coll].delete_one({"id": entity_id, "user_id": user_id})
    if res.deleted_count == 0:
        return False
    # Cascade: remove relations touching this entity
    await db.relations.delete_many(
        {
            "user_id": user_id,
            "$or": [
                {"source_type": entity_type, "source_id": entity_id},
                {"target_type": entity_type, "target_id": entity_id},
            ],
        }
    )
    await _log(user_id, "delete", entity_type, entity_id, {})
    return True


def _default_status(entity_type: str) -> str:
    return {
        "task": "todo",
        "project": "active",
        "goal": "active",
        "telos": "active",
        "journal": "logged",
    }.get(entity_type, "draft")


def _escape(s: str) -> str:
    import re as _re
    return _re.escape(s)


async def _log(user_id: str, action: str, entity_type: str, entity_id: str, meta: dict):
    await db.activity.insert_one(
        {
            "id": new_id(),
            "user_id": user_id,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "meta": meta or {},
            "created_at": now_iso(),
        }
    )
