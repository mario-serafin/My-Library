import logging
import os

from app.celery_app import celery_app
from app.config import settings
from app.database import SyncSessionLocal
from app.models.task import ProcessingTask, TaskStatus
from app.models.book import Book
from app.models.section import Section
from app.services.ai_vision import (
    extract_book_info, AllProvidersUnavailable, AIProviderError,
)
from app.services.book_search import search_books_sync, is_high_confidence
from app.services.section_assignment import resolve_section_id

logger = logging.getLogger(__name__)

MAX_TRANSIENT_RETRIES = 6      # network/5xx retries before giving up
TRANSIENT_KEY = "task:transient:{task_id}"


def _redis():
    import redis as _redis_lib
    return _redis_lib.from_url(settings.REDIS_URL, decode_responses=True)


def _transient_count(task_id: int) -> int:
    try:
        v = _redis().get(TRANSIENT_KEY.format(task_id=task_id))
        return int(v) if v else 0
    except Exception:
        return 0


def _bump_transient(task_id: int) -> int:
    try:
        r = _redis()
        key = TRANSIENT_KEY.format(task_id=task_id)
        n = r.incr(key)
        r.expire(key, 86400)
        return n
    except Exception:
        return 1


def _reset_transient(task_id: int):
    try:
        _redis().delete(TRANSIENT_KEY.format(task_id=task_id))
    except Exception:
        pass


@celery_app.task(
    bind=True,
    name="app.worker.book_tasks.process_book_image",
    queue="book_processing",
    max_retries=None,
)
def process_book_image(self, task_id: int):
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
        section_names = [s.name for s in db.query(Section).order_by(Section.name).all()]

        # ── AI vision: Gemini → Claude fallback ────────────────────────────────
        try:
            info = extract_book_info(image_path, section_names)
        except AllProvidersUnavailable as e:
            task.status = TaskStatus.pending
            task.error_message = (
                f"AI temporaneamente al limite. Ripresa automatica tra ~{e.retry_after}s "
                f"(oppure premi «Riprova»)."
            )
            db.commit()
            retry_kwargs = {"countdown": e.retry_after + 5}
            return
        except AIProviderError as e:
            n = _bump_transient(task_id)
            if n >= MAX_TRANSIENT_RETRIES:
                task.status = TaskStatus.needs_attention
                task.error_message = f"AI non raggiungibile dopo {MAX_TRANSIENT_RETRIES} tentativi: {e}"
                db.commit()
                return
            countdown = min(30 * (2 ** (n - 1)), 1800)   # 30s,60s,120s… capped 30min
            task.status = TaskStatus.pending
            task.error_message = f"Errore AI temporaneo (tentativo {n}/{MAX_TRANSIENT_RETRIES}). Riprovo tra {countdown}s."
            db.commit()
            retry_kwargs = {"countdown": countdown}
            return

        _reset_transient(task_id)

        task.ocr_title = info.title
        task.ocr_author = info.author
        db.commit()

        if not info.title:
            task.status = TaskStatus.needs_attention
            task.error_message = "L'AI non ha identificato il titolo dalla copertina."
            db.commit()
            return

        # ── Metadata lookup (OpenLibrary → Google Books) ───────────────────────
        candidates = search_books_sync(title=info.title, author=info.author, limit=10)
        task.book_candidates = candidates
        db.commit()

        if not candidates:
            task.status = TaskStatus.needs_attention
            task.error_message = "Nessun risultato trovato online. Verifica manualmente."
            db.commit()
            return

        if is_high_confidence(candidates):
            best = candidates[0]
            existing = db.query(Book).filter_by(open_library_id=best.get("open_library_id")).first()
            if existing:
                task.book_id = existing.id
                task.status = TaskStatus.completed
            else:
                combined_genres = ", ".join(filter(None, [info.genres, best.get("genres", "")]))
                section_id = resolve_section_id(
                    ai_section=info.section,
                    title=best.get("title", info.title),
                    author=best.get("author", info.author),
                    genres=combined_genres,
                    db=db,
                )
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
