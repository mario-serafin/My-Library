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
    genres: str  # comma-separated, ready for section_assignment


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

    prompt = (
        "This is a book cover. Extract the following information:\n"
        "1. TITLE — the main title (largest/most prominent text).\n"
        "2. AUTHOR — the author name (usually smaller, top or bottom).\n"
        "3. GENRES — 1 to 3 literary genres that best describe this book "
        "(e.g. 'Fantasy', 'Thriller', 'Historical Fiction', 'Romance', 'Horror', "
        "'Children's Fiction', 'Young Adult', 'Comics', 'Science Fiction').\n"
        "   Infer genres from cover art, style and any visible text — not just explicit labels.\n\n"
        "Return ONLY valid JSON, no explanation:\n"
        "{\"title\": \"...\", \"author\": \"...\", \"genres\": [\"...\", \"...\"]}\n"
        "Use empty string for unknown fields and empty array if genres cannot be inferred."
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
            logger.info("Gemini OCR → title=%r author=%r genres=%r", title, author, genres)
            return BookOCR(title=title, author=author, genres=genres)
        return BookOCR(title="", author="", genres="")

    except Exception as exc:
        if _is_rate_limit(exc):
            raise GeminiRateLimitError(_parse_retry_after(exc)) from exc
        if _is_transient(exc):
            raise GeminiTransientError(str(exc)) from exc
        logger.warning("Gemini unknown error: %s", exc)
        raise GeminiTransientError(str(exc)) from exc
