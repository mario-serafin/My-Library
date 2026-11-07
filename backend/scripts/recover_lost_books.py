#!/usr/bin/env python3
"""
Recovery script for books "lost" by the NULL open_library_id duplicate bug.

Bug: when the best candidate came from Google Books (open_library_id=None) the
worker looked for `open_library_id IS NULL`, matched an unrelated book, linked the
task to it and marked it `completed` without inserting the real book.

For every completed task this script:
  1. takes the stored best candidate (book_candidates[0]) and requires the same
     high-confidence rule the worker used for auto-insertion;
  2. skips the task if the linked book already looks like that candidate
     (title similarity) -> the task was fine;
  3. skips it if the candidate is already in the collection (OL id / ISBN / title+author);
  4. otherwise the book was lost: the task is REOPENED (status needs_attention,
     book_id cleared, candidates kept) so you can approve it from the UI.
     Nothing is inserted by this script.

DRY-RUN by default (prints the numbers, writes nothing). Use --apply to reopen.

Usage (from project root):
  docker compose exec worker python scripts/recover_lost_books.py            # dry-run
  docker compose exec worker python scripts/recover_lost_books.py --apply    # reopen tasks
  docker compose exec worker python scripts/recover_lost_books.py -v         # list every decision
"""
import argparse
import sys
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SyncSessionLocal
from app.models.book import Book
from app.models.task import ProcessingTask, TaskStatus
from app.services.book_search import is_high_confidence
from app.worker.book_tasks import _find_existing_book

SAME_TITLE = 0.6   # similarity above which the linked book is considered the right one


def _sim(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="actually reopen tasks (default: dry-run)")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    db = SyncSessionLocal()
    stats = Counter()
    try:
        tasks = (
            db.query(ProcessingTask)
            .filter(ProcessingTask.status == TaskStatus.completed)
            .order_by(ProcessingTask.id)
            .all()
        )
        stats["completed_tasks_total"] = len(tasks)

        for t in tasks:
            def log(msg):
                if args.verbose:
                    print(f"  task {t.id:>5}  {msg}")

            cands = t.book_candidates or []
            if not cands:
                stats["skip_no_candidates (manual/legacy)"] += 1
                continue
            if not is_high_confidence(cands):
                stats["skip_not_auto_inserted (manual choice)"] += 1
                continue

            best = cands[0]
            linked = db.get(Book, t.book_id) if t.book_id else None

            if linked is not None:
                ref = max(_sim(linked.title, best.get("title", "")),
                          _sim(linked.title, t.ocr_title or ""))
                if ref >= SAME_TITLE:
                    stats["ok_linked_book_matches"] += 1
                    continue
            # linked book missing or unrelated -> task is suspect
            stats["suspect_tasks"] += 1

            existing = _find_existing_book(db, best)
            if existing:
                stats["already_in_collection (no insert needed)"] += 1
                log(f"'{best.get('title')}' already present as book {existing.id}")
                if args.apply and t.book_id != existing.id:
                    t.book_id = existing.id
                    stats["relinked_to_existing"] += 1
                continue

            stats["TO_REOPEN" if not args.apply else "REOPENED"] += 1
            log(f"-> reopen: '{best.get('title')}' / {best.get('author')}  "
                f"(was linked to {linked.id if linked else None}: "
                f"'{linked.title if linked else None}')")
            if not args.apply:
                continue

            # Reopen the task: the user approves from the UI (/confirm) choosing
            # among the stored candidates. No book is inserted here.
            t.book_id = None
            t.status = TaskStatus.needs_attention
            t.recovered = True   # shown with a violet "Recuperato" label, sorted on top
            t.error_message = (
                "Recupero: il libro non era stato inserito per un bug nel controllo "
                "duplicati. Conferma il candidato corretto per aggiungerlo."
            )

        if args.apply:
            db.commit()
        else:
            db.rollback()
    finally:
        db.close()

    print("\n=== Recovery summary %s===" % ("(DRY-RUN, nothing written) " if not args.apply else ""))
    for k, v in sorted(stats.items()):
        print(f"{v:>6}  {k}")
    key = "REOPENED" if args.apply else "TO_REOPEN"
    print(f"\nTasks {'reopened' if args.apply else 'that would be reopened'} for approval: {stats[key]}")


if __name__ == "__main__":
    main()
