import json
import logging
import re
from typing import Tuple

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


class GeminiRateLimitError(Exception):
    """429 / RESOURCE_EXHAUSTED — rate limit hit, caller must back off."""
    def __init__(self, retry_after: int = 65):
        self.retry_after = retry_after
        super().__init__(f"Gemini rate limited, retry after {retry_after}s")


class GeminiTransientError(Exception):
    """Temporary error (network, timeout, 5xx) — safe to retry with backoff."""


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


def extract_title_author(image_path: str) -> Tuple[str, str]:
    """
    Extract (title, author) from a book cover image via Gemini Vision.

    Raises:
        GeminiRateLimitError  — caller should pause and retry after retry_after seconds
        GeminiTransientError  — caller should retry with exponential backoff
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
        "This is a book cover image. Identify the book TITLE and the AUTHOR name.\n"
        "Rules:\n"
        "- The title is the largest/most prominent text on the cover.\n"
        "- The author is usually smaller text, often at the top or bottom.\n"
        "- Ignore subtitles, edition info, publisher names, and series names.\n"
        "- Return ONLY valid JSON: {\"title\": \"...\", \"author\": \"...\"}\n"
        "- If you cannot identify one of the fields, use an empty string.\n"
        "- Never add explanation outside the JSON."
    )

    try:
        response = model.generate_content([prompt, img])
        text = response.text.strip()
        match = re.search(r'\{[^{}]+\}', text, re.DOTALL)
        if match:
            data = json.loads(match.group())
            title = str(data.get("title", "")).strip()
            author = str(data.get("author", "")).strip()
            logger.info("Gemini → title=%r author=%r", title, author)
            return title, author
        return "", ""

    except Exception as exc:
        if _is_rate_limit(exc):
            logger.warning("Gemini rate limited: %s", exc)
            raise GeminiRateLimitError(_parse_retry_after(exc)) from exc
        if _is_transient(exc):
            logger.warning("Gemini transient error: %s", exc)
            raise GeminiTransientError(str(exc)) from exc
        logger.warning("Gemini unknown error: %s", exc)
        raise GeminiTransientError(str(exc)) from exc
