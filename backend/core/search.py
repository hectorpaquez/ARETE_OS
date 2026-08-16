"""Universal search across all ARETÉ entity types."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from core.db import db
from core.entities import ENTITY_COLLECTIONS, normalize


async def universal_search(
    user_id: str, q: str, types: Optional[List[str]] = None, limit_per_type: int = 12
) -> Dict[str, Any]:
    rx = re.escape(q)
    target_types = types or list(ENTITY_COLLECTIONS.keys())
    results: List[dict] = []
    counts: Dict[str, int] = {}

    for et in target_types:
        coll = ENTITY_COLLECTIONS.get(et)
        if not coll:
            continue
        # Search title + summary + content (if present)
        query: Dict[str, Any] = {
            "user_id": user_id,
            "archived": {"$ne": True},
            "$or": [
                {"title": {"$regex": rx, "$options": "i"}},
                {"summary": {"$regex": rx, "$options": "i"}},
                {"content": {"$regex": rx, "$options": "i"}},
                {"description": {"$regex": rx, "$options": "i"}},
                {"tags": {"$regex": rx.lower(), "$options": "i"}},
            ],
        }
        cursor = db[coll].find(query).sort("updated_at", -1).limit(limit_per_type)
        found = [normalize(et, d) async for d in cursor]
        if found:
            counts[et] = len(found)
            results.extend(found)

    # Prioritize exact / prefix title matches
    ql = q.lower()

    def score(item: dict) -> int:
        t = (item.get("title") or "").lower()
        if t == ql:
            return 0
        if t.startswith(ql):
            return 1
        if ql in t:
            return 2
        return 3

    results.sort(key=score)
    return {"results": results[: limit_per_type * len(target_types)], "counts": counts, "total": len(results)}
