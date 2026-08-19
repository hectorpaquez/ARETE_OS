# ARETÉ — PRD (V1: CORE + Connaissances)

## Vision
ARETÉ est un système personnel unifié de connaissance, d'organisation, de progression et d'action. La V1 pose la fondation : CORE (auth, entités, relations, recherche, historique) + Connaissances (pages, liens bidirectionnels, backlinks, tags, graphe).

## Implémenté
- V1 CORE + Connaissances (auth, pages, wiki-links, backlinks, recherche, command palette, graphe, tags, activité, stats)
- Éditeur de blocs façon Wikipédia (titres, citations, listes, code, séparateurs, inline bold/italic/code + toolbar)
- **Daimōn — couche IA OpenAI GPT-5.4 (2026-08-16)** : module `ai_service.py` découplé du CORE. 4 fonctions :
  1. **Résumé de page** (`POST /api/ai/summarize`) — sauve dans `page.summary`
  2. **Suggestions de liens** (`POST /api/ai/suggest-links`) — propose des `[[titres]]` existants pertinents, insérables en un tap
  3. **Expansion / rédaction** (`POST /api/ai/expand`) — développe une idée en Markdown ARETÉ
  4. **Chat Daimōn** (`POST /api/ai/chat`) — ancré RAG-lite sur les pages de l'utilisateur, historique persistant (`ai_messages`), cite en `[[liens]]`
  - Clé : préfère la clé OpenAI de l'utilisateur (`OPENAI_API_KEY`), bascule automatiquement sur `EMERGENT_LLM_KEY` en cas de quota/auth insuffisant. Nouvel onglet **Daimōn** dans la nav.

## Implémenté
- V1 CORE + Connaissances + éditeur de blocs + Daimōn (GPT-5.4)
- **Refactor ARETÉ CORE** : entités génériques, relations typées bidirectionnelles, Context Engine, recherche universelle, graphe local, migration links→relations (49/49 tests backend)
- **Piliers/Académies + Journal + Dashboard enrichi (2026-08-19)** : type `pillar` (5 piliers seedés, reliés au CORE), écrans Académies (index + détail), Journal quotidien à métriques (sommeil/énergie/deep work/lecture/méditation/sport/3 victoires), Dashboard avec accès rapides + devise
- **Page Suivi `/tracking` (2026-08-19)** : types `workout`/`study`, endpoint `/api/tracking` agrégé, sparklines 14 j (react-native-svg), sessions sport/étude avec ajout, indicateurs hebdo/mensuels (placeholders), carte Apple Santé (build natif requis, architecture prête)

## Scope V1
- **Authentification** : email + mot de passe (JWT, bcrypt, expo-secure-store)
- **Knowledge Pages** : CRUD complet avec titre, contenu, tags, statut
- **Wiki-links `[[Titre]]`** : parsées côté serveur, création automatique d'ébauches (stubs) pour cibles manquantes, backlinks bidirectionnels persistés
- **Backlinks Panel** : chaque page affiche toutes les pages qui la référencent
- **Global Search** : titres, contenu, tags
- **Command Palette** : overlay glass, création rapide + navigation + recherche instantanée
- **Graphe de connaissances** : SVG force-simple, nœuds cliquables ouvrent la page
- **Quick Capture** : depuis le Dashboard
- **Activity History** : chaque création/modification/suppression est loguée
- **Tags transversaux** : chips filtrables sur l'écran Connaissances
- **Stats** : compteurs pages/liens/tags/ébauches sur le Dashboard

## Design
- Palette obsidian `#0C0C0E` + or antique `#C8A97E`
- Typo : serif éditoriale pour titres (Georgia fallback), body sans-serif
- Aucune carte générique, edge-to-edge + dividers 1px
- Tabs bottom : Accueil · Connaissances · Graphe · Réglages
- FAB flottant = command palette

## Architecture backend
- FastAPI + Motor (async MongoDB) — routes préfixées `/api`
- Collections : `users`, `pages`, `links`, `activity`
- JWT HS256 30 jours
- Toutes les entités sont scoped `user_id`

## Non-scope V1 (phases futures)
- Objectifs / Telos / Projets / Tâches (Phase 3)
- Académies / Journal / Habitudes (Phase 4)
- Bibliothèque / Carrière (Phase 5)
- HealthKit (Phase 6)
- Context Engine avancé, Daimōn (IA) (Phase 7-8)

## Future-proofing
- Le schéma `links` supporte des relations typées (`references`, `depends_on`, `part_of`, ...) — préparé pour KnowledgeRelation
- L'`activity` log servira au futur Context Engine
- Les pages ont des champs `icon`, `cover`, `status` prêts pour Journal/Book/Project rebranding
