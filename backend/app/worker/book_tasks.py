import logging
import os
import time

from app.celery_app import celery_app
from app.config import settings
from app.database import SyncSessionLocal
from app.models.task import ProcessingTask, TaskStatus
from app.models.book import Book
from app.services.ocr import extract_book_info, GeminiRateLimitError, GeminiTransientError
from app.services.book_search import search_books_sync, is_high_confidence
from app.services.section_assignment import assign_section_id

logger = logging.getLogger(__name__)

RATE_LIMIT_KEY = "gemini:rate_limited_until"


def _resolve_section(gemini_section: str, title: str, author: str, genres: str, db) -> int | None:
    """
    1. Trust Gemini's section name if it matches a known section exactly.
    2. Fall back to keyword-based assignment.
    3. Final fallback: "Senza Genere".
    """
    from app.models.section import Section as SectionModel
    if gemini_section:
        row = db.query(SectionModel).filter_by(name=gemini_section).first()
        if row:
            logger.info("Section from Gemini: %r", gemini_section)
            return row.id
        logger.warning("Gemini returned unknown section %r, falling back to keywords", gemini_section)
    return assign_section_id(title=title, author=author, genres=genres, db=db)
MAX_TRANSIENT_RETRIES = 6


def _redis():
    import redis as _redis_lib
    return _redis_lib.from_url(settings.REDIS_URL, decode_responses=True)


def _circuit_wait() -> int:
    try:
        val = _redis().get(RATE_LIMIT_KEY)
        if val:
            remaining = float(val) - time.time()
            return max(0, int(remaining))
    except Exception:
        pass
    return 0


def _set_circuit(seconds: int):
    try:
        until = time.time() + seconds
        _redis().setex(RATE_LIMIT_KEY, seconds + 60, str(until))
        logger.warning("Gemini circuit breaker ON for %d s", seconds)
    except Exception as e:
        logger.error("Could not set circuit breaker: %s", e)


@celery_app.task(
    bind=True,
    name="app.worker.book_tasks.process_book_image",
    queue="book_processing",
    max_retries=None,
)
def process_book_image(self, task_id: int):
    # ── Circuit-breaker check ──────────────────────────────────────────────────
    wait = _circuit_wait()
    if wait > 0:
        logger.info("Circuit breaker active, rescheduling task %d in %d s", task_id, wait)
        raise self.retry(countdown=wait + 5)

    db = SyncSessionLocal()
    retry_kwargs = None

    try:
        task = db.query(ProcessingTask).filter_by(id=task_id).first()
        if not task:
            return

        task.status = TaskStatus.processing
        task.error_message = None
        db.commit()

        image_path = os.path.join(settings.UPLOAD_DIR, task.image_filename or "")

        # ── Gemini: title + author + genres in one request ─────────────────────
        try:
            ocr = extract_book_info(image_path)
        except GeminiRateLimitError as e:
            _set_circuit(e.retry_after)
            task.status = TaskStatus.pending
            task.error_message = f"Gemini rate limited. Ripresa automatica tra {e.retry_after}s…"
            db.commit()
            retry_kwargs = {"countdown": e.retry_after + 5}
            return
        except GeminiTransientError as e:
            attempt = self.request.retries
            if attempt >= MAX_TRANSIENT_RETRIES:
                task.status = TaskStatus.needs_attention
                task.error_message = f"Gemini non raggiungibile dopo {MAX_TRANSIENT_RETRIES} tentativi."
                db.commit()
                return
            countdown = min(60 * (2 ** attempt), 3600)
            task.status = TaskStatus.pending
            task.error_message = f"Errore temporaneo Gemini (tentativo {attempt + 1}/{MAX_TRANSIENT_RETRIES}). Ripresa tra {countdown}s."
            db.commit()
            retry_kwargs = {"exc": e, "countdown": countdown}
            return

        task.ocr_title = ocr.title
        task.ocr_author = ocr.author
        db.commit()

        if not ocr.title:
            task.status = TaskStatus.needs_attention
            task.error_message = "Gemini non ha identificato il titolo dalla copertina."
            db.commit()
            return

        # ── OpenLibrary / Google Books ─────────────────────────────────────────
        # Merge Gemini genres with OpenLibrary genres for better section matching
        candidates = search_books_sync(title=ocr.title, author=ocr.author, limit=10)
        task.book_candidates = candidates
        db.commit()

        if not candidates:
            task.status = TaskStatus.needs_attention
            task.error_message = "Nessun risultato trovato. Verifica manualmente."
            db.commit()
            return

        if is_high_confidence(candidates):
            best = candidates[0]
            existing = db.query(Book).filter_by(open_library_id=best.get("open_library_id")).first()
            if existing:
                task.book_id = existing.id
                task.status = TaskStatus.completed
            else:
                combined_genres = ", ".join(filter(None, [ocr.genres, best.get("genres", "")]))
                section_id = _resolve_section(ocr.section, best.get("title", ocr.title),
                                              best.get("author", ocr.author), combined_genres, db)
                book = Book(
                    open_library_id=best.get("open_library_id"),
                    title=best["title"],
                    author=best.get("author"),
                    isbn=best.get("isbn"),
                    year=best.get("year"),
                    cover_url=best.get("cover_url"),
                    genres=combined_genres,
                    publisher=best.get("publisher"),
                    page_count=best.get("page_count"),
                    language=best.get("language"),
                    description=best.get("description"),
                    section_id=section_id,
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

    if retry_kwargs is not None:
        raise self.retry(**retry_kwargs)
