"""
Multi-provider AI vision for book covers.

Extracts title / author / genres / section from a cover image, trying
providers in order (Gemini first — free tier, then Claude — paid fallback).

Each provider has its own Redis cooldown, hard-capped at AI_MAX_COOLDOWN,
so a single 429 can never freeze the queue for days.
"""
import base64
import io
import json
import logging
import os
import re
import time
from typing import Callable, NamedTuple

import redis as redis_lib

from app.config import settings

logger = logging.getLogger(__name__)


class BookInfo(NamedTuple):
    title: str
    author: str
    genres: str    # comma-separated
    section: str   # section name suggested by the AI (may be "")


class AllProvidersUnavailable(Exception):
    """Every configured provider is rate-limited. Retry after `retry_after` s."""
    def __init__(self, retry_after: int):
        self.retry_after = max(1, min(retry_after, settings.AI_MAX_COOLDOWN))
        super().__init__(f"All AI providers rate limited, retry in {self.retry_after}s")


class AIProviderError(Exception):
    """Transient failure (network / 5xx / parse). Safe to retry with backoff."""


class _RateLimited(Exception):
    def __init__(self, retry_after: int):
        self.retry_after = retry_after


# ── Redis cooldown (per provider) ───────────────────────────────────────────────

def _redis():
    return redis_lib.from_url(settings.REDIS_URL, decode_responses=True)


def _cooldown_key(provider: str) -> str:
    return f"ai:cooldown:{provider}"


def cooldown_remaining(provider: str) -> int:
    try:
        v = _redis().get(_cooldown_key(provider))
        if v:
            return max(0, int(float(v) - time.time()))
    except Exception:
        pass
    return 0


def set_cooldown(provider: str, seconds: int):
    seconds = max(1, min(int(seconds), settings.AI_MAX_COOLDOWN))
    try:
        _redis().setex(_cooldown_key(provider), seconds + 30, str(time.time() + seconds))
        logger.warning("AI provider '%s' on cooldown for %ds", provider, seconds)
    except Exception as e:
        logger.error("Could not set cooldown for %s: %s", provider, e)


def clear_all_cooldowns():
    """Remove every AI cooldown (used on manual retry / startup cleanup)."""
    try:
        r = _redis()
        for key in ("ai:cooldown:gemini", "ai:cooldown:claude", "gemini:rate_limited_until"):
            r.delete(key)
    except Exception:
        pass


# ── Prompt ──────────────────────────────────────────────────────────────────────

def _build_prompt(section_names: list[str]) -> str:
    sections_block = "\n".join(f'  - "{n}"' for n in section_names)
    fallback = section_names[-1] if section_names else "Senza Genere"
    return (
        "Sei un bibliotecario esperto. Analizza questa copertina di un libro ed estrai:\n"
        "1. TITLE — il titolo principale (testo più grande/prominente).\n"
        "2. AUTHOR — il nome dell'autore.\n"
        "3. GENRES — da 1 a 3 generi letterari (es. Fantasy, Thriller, Giallo, Romance, Horror, Storico).\n"
        "   Deduci i generi dalla grafica, dallo stile e dal testo visibile.\n"
        "4. SECTION — scegli ESATTAMENTE UNA di queste sezioni della biblioteca, "
        "quella più adatta al genere del libro:\n"
        f"{sections_block}\n"
        f'   Usa "{fallback}" SOLO se davvero nessun\'altra sezione è adatta.\n'
        "   Copia il nome della sezione ESATTAMENTE come scritto sopra.\n\n"
        "Rispondi SOLO con JSON valido, senza spiegazioni:\n"
        '{"title": "...", "author": "...", "genres": ["..."], "section": "..."}'
    )


def _parse_response(text: str) -> BookInfo:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return BookInfo("", "", "", "")
    data = json.loads(match.group())
    title = str(data.get("title", "")).strip()
    author = str(data.get("author", "")).strip()
    raw_genres = data.get("genres", [])
    if isinstance(raw_genres, str):
        raw_genres = [g.strip() for g in raw_genres.split(",")]
    genres = ", ".join(g for g in raw_genres if g)
    section = str(data.get("section", "")).strip()
    return BookInfo(title=title, author=author, genres=genres, section=section)


def _image_bytes(image_path: str) -> tuple[bytes, str]:
    """Return (downscaled_jpeg_bytes, media_type)."""
    from PIL import Image
    img = Image.open(image_path).convert("RGB")
    w, h = img.size
    if max(w, h) > 1024:
        ratio = 1024 / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue(), "image/jpeg"


# ── Gemini ──────────────────────────────────────────────────────────────────────

def _gemini_extract(image_path: str, section_names: list[str]) -> BookInfo:
    import google.generativeai as genai
    from google.api_core import exceptions as gexc
    from PIL import Image

    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel(settings.GEMINI_MODEL)

    img = Image.open(image_path).convert("RGB")
    w, h = img.size
    if max(w, h) > 1024:
        ratio = 1024 / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

    try:
        resp = model.generate_content([_build_prompt(section_names), img])
        return _parse_response(resp.text.strip())
    except gexc.ResourceExhausted as e:
        raise _RateLimited(_gemini_retry_after(e))
    except (gexc.ServiceUnavailable, gexc.DeadlineExceeded, gexc.InternalServerError) as e:
        raise AIProviderError(f"Gemini transient: {e}")
    except Exception as e:
        msg = str(e).lower()
        if "429" in msg or "quota" in msg or "resource_exhausted" in msg:
            raise _RateLimited(_gemini_retry_after(e))
        raise AIProviderError(f"Gemini error: {e}")


def _gemini_retry_after(exc) -> int:
    """
    Parse a *sane* retry delay. Gemini messages sometimes contain huge numbers
    (token counts, timestamps) — never trust them blindly; always cap.
    """
    try:
        m = re.search(r"retry_delay\s*\{\s*seconds:\s*(\d+)", str(exc))
        if m:
            return min(int(m.group(1)) + 5, settings.AI_MAX_COOLDOWN)
    except Exception:
        pass
    return 60  # sensible default; free-tier per-minute limits clear quickly


# ── Claude ──────────────────────────────────────────────────────────────────────

def _claude_extract(image_path: str, section_names: list[str]) -> BookInfo:
    import anthropic

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    data, media_type = _image_bytes(image_path)
    b64 = base64.standard_b64encode(data).decode()

    try:
        msg = client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=400,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {
                        "type": "base64", "media_type": media_type, "data": b64,
                    }},
                    {"type": "text", "text": _build_prompt(section_names)},
                ],
            }],
        )
        text = "".join(block.text for block in msg.content if block.type == "text")
        return _parse_response(text.strip())
    except anthropic.RateLimitError as e:
        retry = 60
        try:
            hdr = e.response.headers.get("retry-after")
            if hdr:
                retry = int(float(hdr)) + 2
        except Exception:
            pass
        raise _RateLimited(retry)
    except (anthropic.APIConnectionError, anthropic.InternalServerError) as e:
        raise AIProviderError(f"Claude transient: {e}")
    except anthropic.AuthenticationError as e:
        raise AIProviderError(f"Claude auth error (chiave API non valida?): {e}")
    except Exception as e:
        msg = str(e).lower()
        if "429" in msg or "rate" in msg or "overloaded" in msg:
            raise _RateLimited(60)
        raise AIProviderError(f"Claude error: {e}")


# ── Public entry point ──────────────────────────────────────────────────────────

def _providers() -> list[tuple[str, Callable]]:
    p = []
    if settings.GEMINI_API_KEY:
        p.append(("gemini", _gemini_extract))
    if settings.ANTHROPIC_API_KEY:
        p.append(("claude", _claude_extract))
    return p


def extract_book_info(image_path: str, section_names: list[str]) -> BookInfo:
    """
    Try each configured provider (skipping those on cooldown).
    Raises:
        AllProvidersUnavailable — every provider is rate-limited (retry later)
        AIProviderError         — transient failure (retry with backoff)
    """
    if not os.path.exists(image_path):
        raise AIProviderError(f"Immagine non trovata: {image_path}")

    providers = _providers()
    if not providers:
        raise AIProviderError("Nessuna AI configurata (GEMINI_API_KEY o ANTHROPIC_API_KEY)")

    min_cooldown: int | None = None
    transient_errors: list[str] = []

    for name, fn in providers:
        cd = cooldown_remaining(name)
        if cd > 0:
            min_cooldown = cd if min_cooldown is None else min(min_cooldown, cd)
            logger.info("Provider '%s' on cooldown (%ds), skipping", name, cd)
            continue
        try:
            info = fn(image_path, section_names)
            logger.info("AI '%s' → title=%r section=%r", name, info.title, info.section)
            return info
        except _RateLimited as e:
            set_cooldown(name, e.retry_after)
            capped = min(e.retry_after, settings.AI_MAX_COOLDOWN)
            min_cooldown = capped if min_cooldown is None else min(min_cooldown, capped)
        except AIProviderError as e:
            logger.warning("Provider '%s' transient: %s", name, e)
            transient_errors.append(str(e))

    if min_cooldown is not None:
        raise AllProvidersUnavailable(min_cooldown)
    raise AIProviderError("; ".join(transient_errors) or "Tutti i provider AI hanno fallito")
