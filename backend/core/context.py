"""
ARETÉ Context Engine — deterministic (NOT an LLM).
Gathers the relevant context around an Entity by traversing relations.
"""
from __future__ import annotations

from collections import deque
from typing import Any, Dict, List, Optional

from core import entities, relations
from core.db import db


async def get_entity_context(
    entity_type: str, entity_id: str, user_id: str, depth: int = 3, max_nodes: int = 80
) -> Optional[Dict[str, Any]]:
    entity = await entities.get_entity(entity_type, entity_id, user_id, full=True)
    if not entity:
        return None

    # Direct relations (both directions), with resolved entities
    outgoing = await relations.get_outgoing(user_id, entity_type, entity_id)
    incoming = await relations.get_incoming(user_id, entity_type, entity_id)

    async def resolve_side(rel: dict, side: str) -> Optional[dict]:
        t = rel[f"{side}_type"]
        i = rel[f"{side}_id"]
        ent = await entities.get_entity(t, i, user_id)
        if not ent:
            return None
        return {"relation_id": rel["id"], "relation_type": rel["relation_type"], "entity": ent}

    outgoing_resolved = [x for x in [await resolve_side(r, "target") for r in outgoing] if x]
    incoming_resolved = [x for x in [await resolve_side(r, "source") for r in incoming] if x]

    # BFS to collect the connected sub-graph (typed), for bucketing.
    visited = {(entity_type, entity_id)}
    queue: deque = deque([(entity_type, entity_id, 0)])
    collected: List[dict] = []
    while queue and len(visited) < max_nodes:
        et, ei, d = queue.popleft()
        if d >= depth:
            continue
        for (ot, oi, rtype, direction) in await relations.neighbors(user_id, et, ei):
            key = (ot, oi)
            if key in visited:
                continue
            visited.add(key)
            ent = await entities.get_entity(ot, oi, user_id)
            if ent:
                collected.append({"entity": ent, "via": rtype, "direction": direction, "depth": d + 1})
                queue.append((ot, oi, d + 1))

    # Bucket connected entities by type
    buckets: Dict[str, List[dict]] = {
        "goals": [],
        "projects": [],
        "tasks": [],
        "knowledge": [],
        "books": [],
        "sources": [],
        "journal_entries": [],
        "telos": [],
        "notes": [],
        "people": [],
    }
    type_to_bucket = {
        "goal": "goals",
        "project": "projects",
        "task": "tasks",
        "knowledge": "knowledge",
        "book": "books",
        "source": "sources",
        "journal": "journal_entries",
        "telos": "telos",
        "note": "notes",
        "person": "people",
    }
    for c in collected:
        b = type_to_bucket.get(c["entity"]["entity_type"])
        if b:
            buckets[b].append(c["entity"])

    # Recent activity for this entity
    recent_activity = [
        {k: v for k, v in a.items() if k not in ("_id", "user_id")}
        async for a in db.activity.find(
            {"user_id": user_id, "entity_id": entity_id}, {"_id": 0, "user_id": 0}
        ).sort("created_at", -1).limit(10)
    ]

    return {
        "entity": entity,
        "outgoing": outgoing_resolved,
        "backlinks": incoming_resolved,
        "related_entities": [c["entity"] for c in collected],
        **buckets,
        "recent_activity": recent_activity,
    }


async def build_text_context(user_id: str, limit_per_type: int = 8) -> str:
    """A compact textual context of the user's system, for Daimōn grounding."""
    lines: List[str] = []
    for et, label in [
        ("telos", "TELOS"),
        ("goal", "OBJECTIFS"),
        ("project", "PROJETS"),
        ("task", "TÂCHES"),
        ("knowledge", "CONNAISSANCES"),
    ]:
        items = await entities.list_entities(et, user_id, limit=limit_per_type)
        if not items:
            continue
        lines.append(f"## {label}")
        for it in items:
            snippet = (it.get("summary") or "").strip().replace("\n", " ")
            if len(snippet) > 160:
                snippet = snippet[:160] + "…"
            lines.append(f"- [[{it['title']}]]{(': ' + snippet) if snippet else ''}")
    return "\n".join(lines)
