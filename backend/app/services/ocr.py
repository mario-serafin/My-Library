import json
import logging
import re
from typing import NamedTuple

logger = logging.getLogger(__name__)

try:
    import google.generativeai as genai
    from google.api_core import exceptions as _google_exc
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


class BookOCR(NamedTuple):
    title: str
    author: str
    genres: str    # comma-separated
    section: str   # exact section name as chosen by Gemini, or ""


class GeminiRateLimitError(Exception):
    def __init__(self, retry_after: int = 65):
        self.retry_after = retry_after
        super().__init__(f"Gemini rate limited, retry after {retry_after}s")


class GeminiTransientError(Exception):
    pass


def _parse_retry_after(exc) -> int:
    try:
        m = re.search(r'retry.{0,10}?(\d+)\s*s', str(exc), re.IGNORECASE)
        if m:
            return int(m.group(1)) + 5
    except Exception:
        pass
    return 65


def _is_rate_limit(exc) -> bool:
    if GEMINI_AVAILABLE and isinstance(exc, _google_exc.ResourceExhausted):
        return True
    msg = str(exc).lower()
    return "429" in msg or "resource_exhausted" in msg or "quota" in msg


def _is_transient(exc) -> bool:
    if GEMINI_AVAILABLE and isinstance(exc, (
        _google_exc.ServiceUnavailable,
        _google_exc.DeadlineExceeded,
        _google_exc.InternalServerError,
    )):
        return True
    msg = str(exc).lower()
    return any(k in msg for k in ("503", "504", "500", "timeout", "unavailable"))


def extract_book_info(image_path: str) -> BookOCR:
    """
    Extract title, author AND genres from a book cover in a single Gemini request.

    Raises:
        GeminiRateLimitError  — caller should pause and retry
        GeminiTransientError  — caller should retry with backoff
    """
    from app.config import settings

    if not settings.GEMINI_API_KEY:
        raise GeminiTransientError("GEMINI_API_KEY non configurata")
    if not GEMINI_AVAILABLE:
        raise GeminiTransientError("google-generativeai non installato")
    if not PIL_AVAILABLE:
        raise GeminiTransientError("Pillow non installato")

    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-2.5-flash")

    img = Image.open(image_path).convert("RGB")
    w, h = img.size
    if max(w, h) > 1024:
        ratio = 1024 / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

    from app.services.section_assignment import DEFAULT_SECTIONS, FALLBACK_SECTION_NAME
    sections_list = "\n".join(
        f'  - "{s["name"]}": {s["description"]}'
        for s in DEFAULT_SECTIONS
    )

    prompt = (
        "This is a book cover. Extract the following information:\n"
        "1. TITLE — the main title (largest/most prominent text).\n"
        "2. AUTHOR — the author name (usually smaller, top or bottom).\n"
        "3. GENRES — 1 to 3 literary genres that best describe this book "
        "(e.g. 'Fantasy', 'Thriller', 'Historical Fiction'). "
        "Infer genres from cover art, style and any visible text.\n"
        "4. SECTION — choose the single most appropriate section from this list:\n"
        f"{sections_list}\n"
        f'   Use "{FALLBACK_SECTION_NAME}" if the genre cannot be determined.\n\n'
        "Return ONLY valid JSON, no explanation:\n"
        '{"title": "...", "author": "...", "genres": ["..."], "section": "..."}\n'
        "The section value must be copied exactly as written in the list above."
    )

    try:
        response = model.generate_content([prompt, img])
        text = response.text.strip()
        match = re.search(r'\{.*?\}', text, re.DOTALL)
        if match:
            data = json.loads(match.group())
            title = str(data.get("title", "")).strip()
            author = str(data.get("author", "")).strip()
            raw_genres = data.get("genres", [])
            if isinstance(raw_genres, str):
                raw_genres = [g.strip() for g in raw_genres.split(",") if g.strip()]
            genres = ", ".join(g for g in raw_genres if g)
            section = str(data.get("section", "")).strip()
            logger.info("Gemini OCR → title=%r author=%r genres=%r section=%r", title, author, genres, section)
            return BookOCR(title=title, author=author, genres=genres, section=section)
        return BookOCR(title="", author="", genres="", section="")

    except Exception as exc:
        if _is_rate_limit(exc):
            raise GeminiRateLimitError(_parse_retry_after(exc)) from exc
        if _is_transient(exc):
            raise GeminiTransientError(str(exc)) from exc
        logger.warning("Gemini unknown error: %s", exc)
        raise GeminiTransientError(str(exc)) from exc
