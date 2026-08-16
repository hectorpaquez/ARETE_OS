"""Scalable local graph — BFS from a seed entity with depth/limit/filters."""
from __future__ import annotations

from collections import deque
from typing import Any, Dict, List, Optional

from core import entities, relations


async def local_graph(
    user_id: str,
    entity_type: str,
    entity_id: str,
    depth: int = 2,
    limit: int = 120,
    relation_type: Optional[str] = None,
    type_filter: Optional[List[str]] = None,
) -> Dict[str, Any]:
    seed = await entities.get_entity(entity_type, entity_id, user_id)
    if not seed:
        return {"nodes": [], "edges": []}

    nodes: Dict[str, dict] = {}
    edges: List[dict] = []
    seen_edges = set()

    def add_node(ent: dict):
        if ent and ent["id"] not in nodes and len(nodes) < limit:
            nodes[ent["id"]] = {
                "id": ent["id"],
                "label": ent["title"],
                "entity_type": ent["entity_type"],
                "status": ent.get("status"),
            }

    add_node(seed)
    queue: deque = deque([(entity_type, entity_id, 0)])
    visited = {(entity_type, entity_id)}

    while queue and len(nodes) < limit:
        et, ei, d = queue.popleft()
        if d >= depth:
            continue
        for (ot, oi, rtype, direction) in await relations.neighbors(user_id, et, ei):
            if relation_type and rtype != relation_type:
                continue
            if type_filter and ot not in type_filter:
                continue
            ent = await entities.get_entity(ot, oi, user_id)
            if not ent:
                continue
            add_node(ent)
            src, tgt = (ei, oi) if direction == "out" else (oi, ei)
            ekey = (src, tgt, rtype)
            if ekey not in seen_edges and src in nodes and tgt in nodes:
                seen_edges.add(ekey)
                edges.append({"source": src, "target": tgt, "relation": rtype})
            if (ot, oi) not in visited:
                visited.add((ot, oi))
                queue.append((ot, oi, d + 1))

    return {"nodes": list(nodes.values()), "edges": edges}


async def knowledge_graph(user_id: str, limit: int = 300) -> Dict[str, Any]:
    """Backward-compatible full knowledge graph (used by the existing Graphe tab)."""
    from core.db import db

    nodes = []
    async for p in db.pages.find(
        {"user_id": user_id}, {"_id": 0, "id": 1, "title": 1, "status": 1}
    ).limit(limit):
        nodes.append({"id": p["id"], "label": p["title"], "entity_type": "knowledge", "status": p.get("status", "draft")})
    node_ids = {n["id"] for n in nodes}
    edges = []
    async for r in db.relations.find(
        {"user_id": user_id, "source_type": "knowledge", "target_type": "knowledge"}
    ):
        if r["source_id"] in node_ids and r["target_id"] in node_ids:
            edges.append({"source": r["source_id"], "target": r["target_id"], "relation": r["relation_type"]})
    return {"nodes": nodes, "edges": edges}
