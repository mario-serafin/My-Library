import logging
import os
import time

from app.celery_app import celery_app
from app.config import settings
from app.database import SyncSessionLocal
from app.models.task import ProcessingTask, TaskStatus
from app.models.book import Book
from app.services.ocr import extract_title_author, GeminiRateLimitError, GeminiTransientError
from app.services.book_search import search_openlibrary_sync, is_high_confidence

logger = logging.getLogger(__name__)

# Redis key that stores the unix timestamp until which Gemini is rate-limited.
# When any worker hits a 429, it sets this key so ALL workers pause automatically.
RATE_LIMIT_KEY = "gemini:rate_limited_until"

# Max retries for transient (non-rate-limit) errors before giving up
MAX_TRANSIENT_RETRIES = 6  # 60 + 120 + 240 + 480 + 960 + 1920 s ≈ 1 h total


def _redis():
    import redis as _redis_lib
    return _redis_lib.from_url(settings.REDIS_URL, decode_responses=True)


def _circuit_wait() -> int:
    """Return seconds remaining in rate-limit pause, or 0 if clear."""
    try:
        val = _redis().get(RATE_LIMIT_KEY)
        if val:
            remaining = float(val) - time.time()
            return max(0, int(remaining))
    except Exception:
        pass
    return 0


def _set_circuit(seconds: int):
    """Activate the rate-limit circuit breaker for `seconds` seconds."""
    try:
        until = time.time() + seconds
        _redis().setex(RATE_LIMIT_KEY, seconds + 60, str(until))
        logger.warning("Gemini circuit breaker ON for %d s (all workers paused)", seconds)
    except Exception as e:
        logger.error("Could not set circuit breaker: %s", e)


@celery_app.task(
    bind=True,
    name="app.worker.book_tasks.process_book_image",
    queue="book_processing",
    max_retries=None,
)
def process_book_image(self, task_id: int):
    # ── 1. Circuit-breaker check ──────────────────────────────────────────────
    wait = _circuit_wait()
    if wait > 0:
        logger.info("Circuit breaker active, rescheduling task %d in %d s", task_id, wait)
        raise self.retry(countdown=wait + 5)

    # ── 2. Load task ──────────────────────────────────────────────────────────
    db = SyncSessionLocal()
    retry_kwargs = None          # set to dict when a retry is needed
    unexpected_exc = None

    try:
        task = db.query(ProcessingTask).filter_by(id=task_id).first()
        if not task:
            logger.warning("Task %d not found", task_id)
            return

        task.status = TaskStatus.processing
        task.error_message = None
        db.commit()

        image_path = os.path.join(settings.UPLOAD_DIR, task.image_filename or "")

        # ── 3. OCR via Gemini ─────────────────────────────────────────────────
        try:
            title, author = extract_title_author(image_path)

        except GeminiRateLimitError as e:
            _set_circuit(e.retry_after)
            task.status = TaskStatus.pending
            task.error_message = (
                f"Gemini rate limit raggiunto. "
                f"Ripresa automatica tra {e.retry_after} secondi."
            )
            db.commit()
            retry_kwargs = {"countdown": e.retry_after + 5}
            return  # → finally → retry

        except GeminiTransientError as e:
            attempt = self.request.retries          # 0-based
            if attempt >= MAX_TRANSIENT_RETRIES:
                task.status = TaskStatus.needs_attention
                task.error_message = (
                    f"Gemini non raggiungibile dopo {MAX_TRANSIENT_RETRIES} tentativi. "
                    f"Controlla la connessione o la chiave API."
                )
                db.commit()
                return
            countdown = min(60 * (2 ** attempt), 3600)   # 60, 120, 240, 480, 960, 1920
            task.status = TaskStatus.pending
            task.error_message = (
                f"Errore temporaneo Gemini (tentativo {attempt + 1}/{MAX_TRANSIENT_RETRIES}). "
                f"Ripresa automatica tra {countdown} secondi."
            )
            db.commit()
            retry_kwargs = {"exc": e, "countdown": countdown}
            return  # → finally → retry

        # ── 4. Store OCR result ───────────────────────────────────────────────
        task.ocr_title = title
        task.ocr_author = author
        db.commit()

        if not title:
            task.status = TaskStatus.needs_attention
            task.error_message = "Gemini non ha identificato il titolo dalla copertina."
            db.commit()
            return

        # ── 5. OpenLibrary search ─────────────────────────────────────────────
        candidates = search_openlibrary_sync(title=title, author=author, limit=10)
        task.book_candidates = candidates
        db.commit()

        if not candidates:
            task.status = TaskStatus.needs_attention
            task.error_message = "Nessun risultato su OpenLibrary. Verifica manualmente."
            db.commit()
            return

        # ── 6. Auto-insert if confident ───────────────────────────────────────
        if is_high_confidence(candidates):
            best = candidates[0]
            existing = db.query(Book).filter_by(
                open_library_id=best.get("open_library_id")
            ).first()
            if existing:
                task.book_id = existing.id
                task.status = TaskStatus.completed
            else:
                book = Book(
                    open_library_id=best.get("open_library_id"),
                    title=best["title"],
                    author=best.get("author"),
                    isbn=best.get("isbn"),
                    year=best.get("year"),
                    cover_url=best.get("cover_url"),
                    genres=best.get("genres"),
                    publisher=best.get("publisher"),
                    page_count=best.get("page_count"),
                    language=best.get("language"),
                    section_id=task.target_section_id,
                    added_by=task.user_id,
                )
                db.add(book)
                db.flush()
                task.book_id = book.id
                task.status = TaskStatus.completed
        else:
            task.status = TaskStatus.needs_attention

        db.commit()

    except Exception as exc:
        logger.exception("Unexpected error in task %d: %s", task_id, exc)
        unexpected_exc = exc
        db.rollback()
        try:
            t = db.query(ProcessingTask).filter_by(id=task_id).first()
            if t:
                t.status = TaskStatus.failed
                t.error_message = str(exc)
                db.commit()
        except Exception:
            pass

    finally:
        db.close()

    # Raise retry AFTER db is closed so the session is clean
    if retry_kwargs is not None:
        raise self.retry(**retry_kwargs)
