# ARETÉ — ARCHITECTURE

## Vue d'ensemble

```
UTILISATEUR → DAIMŌN → CONTEXT ENGINE → ARETÉ CORE → { ENTITIES, RELATIONS, SEARCH, GRAPH }
```

Le CORE est le socle relationnel. Knowledge n'est qu'un `entity_type` parmi d'autres.
Daimōn (IA) est une couche au-dessus, non propriétaire des données.

## Backend (`/app/backend`)

```
server.py            # routing, auth, validation, appels aux services
ai_service.py        # Daimōn (OpenAI GPT-5.4) — résumé/suggestions/expansion/chat
core/
  db.py              # handle Mongo partagé + helpers (now_iso, new_id, slugify)
  entities.py        # registre Entity + CRUD générique (mapping type→collection)
  relations.py       # service Relation générique (Entity↔Entity typées, bidir)
  context.py         # Context Engine déterministe (BFS relations)
  search.py          # recherche universelle multi-types
  graph.py           # graphe local scalable (BFS) + graphe knowledge (compat)
```

## Modèle Entity

Abstraction commune, **pas une table unique**. Chaque `entity_type` → sa collection :

| entity_type | collection |
|---|---|
| knowledge | `pages` |
| telos | `telos` |
| goal | `goals` |
| project | `projects` |
| task | `tasks` |
| journal | `journal` |
| book | `books` |
| source | `sources` |
| person | `people` |
| note | `notes` |

Champs communs : `id, entity_type, title, slug, status, archived, created_at, updated_at, created_by, updated_by` + champs spécifiques par type.

Extensible : ajouter un `entity_type` = ajouter une entrée dans `ENTITY_COLLECTIONS`.

## Modèle Relation (collection `relations`)

```
{ id, user_id, source_type, source_id, target_type, target_id,
  relation_type, metadata, created_at, created_by }
```

`relation_type` connus (extensibles) : references, part_of, contains, depends_on,
prerequisite_of, has_goal, has_project, has_task, concerns, records, belongs_to,
attached_to, derived_from, inspired_by, supports, contradicts, related_to…

Bidirectionnel via requête inverse (pas de double stockage). `inverse()` fournit
le libellé de la perspective inverse (ex. `references` ↔ `referenced_by`).

**IDs stables** : les relations utilisent les IDs, jamais les titres. Renommer une
entité ne casse aucune relation.

## Wiki-links `[[Titre]]`

1. parse du contenu knowledge
2. résolution vers une Entity knowledge (création d'un *stub* si absente)
3. persistance d'une relation `knowledge --references--> knowledge`
4. backlink = relation entrante (résolue à la volée)

## Context Engine (déterministe)

`get_entity_context(type, id, depth=3)` → entity, outgoing, backlinks,
related_entities + buckets (goals, projects, tasks, knowledge, books, sources,
journal_entries, telos, notes, people), recent_activity.
BFS bidirectionnel sur les relations → remonte la hiérarchie
Task → Project → Goal → Telos, etc.

`build_text_context()` → contexte textuel compact utilisé par Daimōn (grounding).

## Recherche universelle

`/api/search/universal?q=…&types=…` → résultats multi-collections, triés par
pertinence (titre exact > préfixe > sous-chaîne), avec compteurs par type.

## Graphe

- `/api/graph` (sans params) → graphe knowledge complet (compat tab Graphe)
- `/api/graph?entity_type&entity_id&depth&limit&relation_type` → graphe **local**
  scalable par BFS (jamais tout l'univers utilisateur).

## API (principaux endpoints)

Knowledge (existant, préservé) : `/api/pages*`, `/api/pages/{id}/backlinks|outlinks`
Entities : `/api/entities/{type}` (GET/POST), `/api/entities/{type}/{id}` (GET/PUT/DELETE),
`…/relations`, `…/backlinks`, `…/outlinks`, `…/context`
Relations : `POST /api/relations`, `GET /api/relations`, `GET/DELETE /api/relations/{id}`, `GET /api/relation-types`
Search : `/api/search` (knowledge, compat), `/api/search/universal`
Graph : `/api/graph`
Daimōn : `/api/ai/summarize|suggest-links|expand|chat|status`

## Sécurité / multi-utilisateur

Toutes les requêtes (entities, relations, search, graph, context) sont filtrées
par `user_id`. Clés API (OpenAI/Emergent) uniquement côté backend (`.env`).

## Migration

`_migrate_links_to_relations()` au démarrage : idempotent, convertit `links`
(legacy) → `relations`. La collection `links` est **conservée** pour réversibilité.
