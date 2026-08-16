"""
Generic Relation service — the relational backbone of ARETÉ CORE.
Relations are Entity -> Entity, typed, user-scoped, queryable in both directions.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from core.db import db, now_iso, new_id

# Known relation types + their inverse label (for the reverse perspective).
INVERSE_RELATION: Dict[str, str] = {
    "references": "referenced_by",
    "part_of": "contains",
    "contains": "part_of",
    "depends_on": "prerequisite_of",
    "prerequisite_of": "depends_on",
    "has_goal": "goal_of",
    "has_project": "project_of",
    "has_task": "task_of",
    "concerns": "concerned_by",
    "records": "recorded_in",
    "belongs_to": "owns",
    "attached_to": "has_attachment",
    "derived_from": "source_of",
    "inspired_by": "inspiration_for",
    "supports": "supported_by",
    "contradicts": "contradicted_by",
    "related_to": "related_to",
}
# Fill reverse direction for symmetric lookups
for _k, _v in list(INVERSE_RELATION.items()):
    INVERSE_RELATION.setdefault(_v, _k)

KNOWN_RELATION_TYPES = set(INVERSE_RELATION.keys())


def inverse(relation_type: str) -> str:
    return INVERSE_RELATION.get(relation_type, f"inbound_{relation_type}")


def _clean(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return None
    doc.pop("_id", None)
    doc.pop("user_id", None)
    return doc


async def create_relation(
    user_id: str,
    source_type: str,
    source_id: str,
    target_type: str,
    target_id: str,
    relation_type: str = "related_to",
    metadata: Optional[dict] = None,
    dedupe: bool = True,
) -> dict:
    if not relation_type or not isinstance(relation_type, str):
        raise ValueError("relation_type required")
    if source_type == target_type and source_id == target_id:
        raise ValueError("Cannot relate an entity to itself")
    if dedupe:
        existing = await db.relations.find_one(
            {
                "user_id": user_id,
                "source_type": source_type,
                "source_id": source_id,
                "target_type": target_type,
                "target_id": target_id,
                "relation_type": relation_type,
            }
        )
        if existing:
            return _clean(existing)
    doc = {
        "id": new_id(),
        "user_id": user_id,
        "source_type": source_type,
        "source_id": source_id,
        "target_type": target_type,
        "target_id": target_id,
        "relation_type": relation_type,
        "metadata": metadata or {},
        "created_at": now_iso(),
        "created_by": user_id,
    }
    await db.relations.insert_one(dict(doc))
    return doc


async def delete_relation(user_id: str, relation_id: str) -> bool:
    res = await db.relations.delete_one({"id": relation_id, "user_id": user_id})
    return res.deleted_count > 0


async def delete_outgoing_of_type(
    user_id: str, source_type: str, source_id: str, relation_type: str
) -> int:
    res = await db.relations.delete_many(
        {
            "user_id": user_id,
            "source_type": source_type,
            "source_id": source_id,
            "relation_type": relation_type,
        }
    )
    return res.deleted_count


async def get_relation(user_id: str, relation_id: str) -> Optional[dict]:
    return _clean(await db.relations.find_one({"id": relation_id, "user_id": user_id}))


async def get_outgoing(
    user_id: str, source_type: str, source_id: str, relation_type: Optional[str] = None
) -> List[dict]:
    q: Dict[str, Any] = {"user_id": user_id, "source_type": source_type, "source_id": source_id}
    if relation_type:
        q["relation_type"] = relation_type
    return [_clean(d) async for d in db.relations.find(q).sort("created_at", -1)]


async def get_incoming(
    user_id: str, target_type: str, target_id: str, relation_type: Optional[str] = None
) -> List[dict]:
    q: Dict[str, Any] = {"user_id": user_id, "target_type": target_type, "target_id": target_id}
    if relation_type:
        q["relation_type"] = relation_type
    return [_clean(d) async for d in db.relations.find(q).sort("created_at", -1)]


async def query(user_id: str, filters: Dict[str, Any]) -> List[dict]:
    q: Dict[str, Any] = {"user_id": user_id}
    for k in ("source_type", "source_id", "target_type", "target_id", "relation_type"):
        if filters.get(k):
            q[k] = filters[k]
    return [_clean(d) async for d in db.relations.find(q).sort("created_at", -1).limit(500)]


async def neighbors(
    user_id: str, entity_type: str, entity_id: str
) -> List[Tuple[str, str, str, str]]:
    """Return neighbor tuples (other_type, other_id, relation_type, direction)."""
    out: List[Tuple[str, str, str, str]] = []
    async for r in db.relations.find(
        {"user_id": user_id, "source_type": entity_type, "source_id": entity_id}
    ):
        out.append((r["target_type"], r["target_id"], r["relation_type"], "out"))
    async for r in db.relations.find(
        {"user_id": user_id, "target_type": entity_type, "target_id": entity_id}
    ):
        out.append((r["source_type"], r["source_id"], r["relation_type"], "in"))
    return out
