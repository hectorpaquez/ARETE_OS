# ARETÉ CORE — ROADMAP

## Fait (refactoring CORE V1)
- [x] Package `core/` (db, entities, relations, context, search, graph)
- [x] Collection générique `relations` (Entity↔Entity typées, bidirectionnelles)
- [x] Migration idempotente `links` → `relations` (links conservée)
- [x] Wiki-links réécrits sur relations (backlinks compatibles)
- [x] Entités Telos / Goal / Project / Task / JournalEntry (+ book/source/note/person)
- [x] Context Engine déterministe (scénario Algèbre linéaire validé)
- [x] Recherche universelle multi-types
- [x] Graphe local scalable (depth/limit/filter)
- [x] Daimōn grounding via Context Engine
- [x] UI : onglet Organisation, panneau Contexte sur Knowledge, recherche universelle

## Prochaines étapes recommandées
- [ ] Suppression définitive de la collection `links` après période d'observation
- [ ] Relations typées éditables depuis l'UI Knowledge (pas seulement references)
- [ ] Vue graphe local dans l'écran d'entité (actuellement liste de contexte)
- [ ] Pagination des listes d'entités et du graphe pour > 10 000 entités
- [ ] Dashboard : tâches importantes / projets actifs / objectifs (via CORE)
- [ ] Quartier Général orienté action
- [ ] Académies (regroupements d'entités par domaine)
- [ ] Bibliothèque enrichie (livres → citations, progression)
- [ ] Export JSON / Markdown / CSV
- [ ] Couche d'intégration (Apple Health/Calendar/Reminders) — entités externes
- [ ] Daimōn : `get_entity_context()` par entité ouverte (contexte ciblé), mémoire multi-sessions

## Dette technique
- `links` encore présente (volontairement, pour réversibilité)
- Validation des `relation_type` permissive (accepte types inconnus, par extensibilité)
- Graphe local charge les entités une par une (N+1) — acceptable à petite échelle,
  à batcher si volumétrie élevée
