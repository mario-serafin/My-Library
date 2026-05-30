from celery import Celery
from app.config import settings

celery_app = Celery(
    "library",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.worker.book_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_routes={"app.worker.book_tasks.*": {"queue": "book_processing"}},
    task_track_started=True,
)
