"""
ARETÉ — Daimōn AI layer (OpenAI GPT-5.4 via emergentintegrations).
Deliberately decoupled from CORE: this module only reads knowledge context
and produces suggestions/summaries/text. It never mutates CORE relations.
"""
from __future__ import annotations

import os
import re
import uuid
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv(Path(__file__).parent / ".env")

MODEL_PROVIDER = "openai"
MODEL_NAME = "gpt-5.4"


class AIUnavailable(Exception):
    pass


def _api_key() -> str:
    # Prefer the user's own OpenAI key; fall back to the Emergent universal key.
    return os.environ.get("OPENAI_API_KEY", "") or os.environ.get("EMERGENT_LLM_KEY", "")


def _fallback_key() -> str:
    return os.environ.get("EMERGENT_LLM_KEY", "")


def _is_quota_error(err: Exception) -> bool:
    msg = str(err).lower()
    return any(
        k in msg
        for k in ("quota", "ratelimit", "rate limit", "insufficient", "billing", "401", "invalid_api_key", "authentication")
    )


async def _call(api_key: str, system_message: str, user_text: str, session_id: str | None) -> str:
    chat = LlmChat(
        api_key=api_key,
        session_id=session_id or str(uuid.uuid4()),
        system_message=system_message,
    ).with_model(MODEL_PROVIDER, MODEL_NAME)
    reply = await chat.send_message(UserMessage(text=user_text))
    if isinstance(reply, str):
        return reply.strip()
    return str(getattr(reply, "text", getattr(reply, "content", reply))).strip()


async def _run(system_message: str, user_text: str, session_id: str | None = None) -> str:
    primary = os.environ.get("OPENAI_API_KEY", "")
    fallback = _fallback_key()
    key = primary or fallback
    if not key:
        raise AIUnavailable("Aucune clé IA configurée sur le serveur.")
    try:
        return await _call(key, system_message, user_text, session_id)
    except Exception as e:
        # If the user's own OpenAI key failed (quota/auth) and we have an
        # Emergent universal key different from it, retry transparently.
        if key == primary and fallback and fallback != primary and _is_quota_error(e):
            return await _call(fallback, system_message, user_text, session_id)
        raise


def _truncate(text: str, limit: int = 1200) -> str:
    text = text or ""
    return text if len(text) <= limit else text[:limit] + "…"


# --------------------------------------------------------------------------
# 1. Summarize a page
# --------------------------------------------------------------------------
async def summarize_page(title: str, content: str) -> str:
    system = (
        "Tu es Daimōn, l'assistant de connaissance d'ARETÉ. "
        "Tu résumes des pages de connaissance de façon dense, neutre et intellectuelle, "
        "en français. Style encyclopédique et précis, sans fioritures."
    )
    user = (
        f"Résume la page suivante en 2 à 3 phrases (max ~60 mots). "
        f"Ne recopie pas le titre. Réponds uniquement par le résumé, sans préambule.\n\n"
        f"# {title}\n\n{_truncate(content, 4000)}"
    )
    return await _run(system, user)


# --------------------------------------------------------------------------
# 2. Suggest wiki-link connections
# --------------------------------------------------------------------------
async def suggest_links(
    title: str, content: str, candidate_titles: List[str]
) -> List[str]:
    system = (
        "Tu es Daimōn, moteur de connexion de connaissances pour ARETÉ. "
        "À partir d'une page et d'une liste de titres de pages EXISTANTES, tu identifies "
        "lesquelles sont pertinentes à relier. Tu ne proposes QUE des titres présents dans la liste fournie. "
        "Réponds uniquement par les titres pertinents, un par ligne, sans numérotation ni commentaire. "
        "Si aucun n'est pertinent, réponds 'AUCUN'."
    )
    cand = "\n".join(f"- {t}" for t in candidate_titles[:120])
    user = (
        f"PAGE COURANTE:\n# {title}\n{_truncate(content, 2500)}\n\n"
        f"TITRES DE PAGES EXISTANTES:\n{cand}\n\n"
        f"Quelles pages existantes sont pertinentes à relier depuis la page courante ? "
        f"Maximum 8. Un titre par ligne, exactement tel qu'écrit dans la liste."
    )
    raw = await _run(system, user)
    if not raw or raw.strip().upper().startswith("AUCUN"):
        return []
    valid = {t.lower(): t for t in candidate_titles}
    out: List[str] = []
    for line in raw.splitlines():
        cleaned = re.sub(r"^[\s\-\*•\d\.\)]+", "", line).strip().strip("[]")
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in valid and valid[key] not in out and valid[key].lower() != title.lower():
            out.append(valid[key])
    return out[:8]


# --------------------------------------------------------------------------
# 3. Expand a short idea into structured markdown
# --------------------------------------------------------------------------
async def expand_idea(prompt: str, existing_content: str = "") -> str:
    system = (
        "Tu es Daimōn, rédacteur intellectuel d'ARETÉ. Tu développes des idées en notes "
        "structurées en français, au format Markdown ARETÉ : titres de section avec ##, "
        "listes avec -, citations avec >, et liens internes au format [[Titre]] quand c'est pertinent. "
        "Style clair, dense, encyclopédique. Pas de blabla introductif."
    )
    ctx = f"\n\nCONTENU EXISTANT (à prolonger, ne pas répéter):\n{_truncate(existing_content, 2000)}" if existing_content else ""
    user = (
        f"Développe l'idée suivante en une note structurée en Markdown "
        f"(utilise ## pour les sections, - pour les listes, [[…]] pour les liens internes).{ctx}\n\n"
        f"IDÉE: {prompt}"
    )
    return await _run(system, user)


# --------------------------------------------------------------------------
# 4. Chat grounded on the user's knowledge base
# --------------------------------------------------------------------------
async def chat_daimon(
    message: str,
    knowledge_context: str,
    history: List[dict],
    session_id: str,
) -> str:
    system = (
        "Tu es Daimōn, l'intelligence d'ARETÉ — un système personnel de connaissance. "
        "Tu réponds en français, avec calme, maîtrise, profondeur et précision. "
        "Tu t'appuies EN PRIORITÉ sur les connaissances de l'utilisateur fournies ci-dessous. "
        "Quand tu cites une page de l'utilisateur, référence-la au format [[Titre]]. "
        "Si l'information n'est pas dans les connaissances fournies, dis-le clairement puis réponds au mieux. "
        "Sois concis mais substantiel.\n\n"
        f"=== CONNAISSANCES DE L'UTILISATEUR ===\n{knowledge_context or '(aucune page pour l’instant)'}\n=== FIN DES CONNAISSANCES ==="
    )
    # Build a transcript so the model has conversational continuity
    transcript = ""
    for h in history[-8:]:
        role = "Utilisateur" if h.get("role") == "user" else "Daimōn"
        transcript += f"{role}: {h.get('content','')}\n"
    user = (transcript + f"Utilisateur: {message}\nDaimōn:") if transcript else message
    return await _run(system, user, session_id=session_id)
