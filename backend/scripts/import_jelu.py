#!/usr/bin/env python3
"""
One-shot import of books from a Jelu CSV export.

Usage (from project root):
  docker compose exec api python scripts/import_jelu.py scripts/jelu-export.csv

All books are assigned to TARGET_SECTION.
Duplicates (matched by ISBN or title+author) are skipped automatically.
"""
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SyncSessionLocal
from app.models.book import Book
from app.models.section import Section
from app.models.user import User

TARGET_SECTION = "Giallo, Thriller e Noir"

# OpenLibrary cover images are served by URL with no API call required.
# If the ISBN has no cover the URL returns a transparent 1×1 pixel — we handle that at display time.
OL_COVER_URL = "https://covers.openlibrary.org/b/isbn/{isbn}-M.jpg"


# ── CSV helpers ────────────────────────────────────────────────────────────────

def _read_csv(path: str) -> list[dict]:
    if not Path(path).exists():
        raise FileNotFoundError(
            f"File not found: {path}\n"
            f"Copy the CSV into backend/scripts/ and re-run:\n"
            f"  cp your-export.csv backend/scripts/jelu-export.csv"
        )
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            with open(path, encoding=enc, errors="replace") as f:
                rows = list(csv.DictReader(f))
            print(f"CSV read with encoding={enc}, {len(rows)} rows")
            return rows
        except Exception:
            continue
    raise RuntimeError(f"Cannot decode {path} — try saving the file as UTF-8")


def _best_isbn(row: dict) -> str:
    return (row.get("isbn13") or row.get("ISBN") or row.get("isbn10") or "").strip()


def _csv_genres(row: dict) -> str:
    raw = row.get("tags") or row.get("Bookshelves") or row.get("Shelves") or ""
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    return ", ".join(parts)[:512]


# ── Main ───────────────────────────────────────────────────────────────────────

def main(csv_path: str) -> None:
    rows = _read_csv(csv_path)
    db = SyncSessionLocal()

    section = db.query(Section).filter_by(name=TARGET_SECTION).first()
    if not section:
        print(f"ERROR: section '{TARGET_SECTION}' not found — start the app first so sections are seeded.")
        db.close()
        sys.exit(1)

    admin = db.query(User).filter_by(username="admin").first()
    admin_id = admin.id if admin else None

    imported = skipped = errors = 0
    total = len(rows)

    print(f"\nImporting {total} books → section '{section.name}'\n")

    for i, row in enumerate(rows, 1):
        title = (row.get("Title") or "").strip()
        author = (row.get("Author") or "").strip()
        isbn = _best_isbn(row)
        publisher = (row.get("Publisher") or "").strip() or None

        label = f"[{i:>3}/{total}] {title[:45]:<45}"

        if not title:
            print(f"{label} SKIP — no title")
            skipped += 1
            continue

        # Duplicate check
        dup = None
        if isbn:
            dup = db.query(Book).filter_by(isbn=isbn).first()
        if not dup:
            dup = db.query(Book).filter(
                Book.title == title, Book.author == author
            ).first()

        if dup:
            print(f"{label} SKIP — already in collection")
            skipped += 1
            continue

        cover_url = OL_COVER_URL.format(isbn=isbn) if isbn else None
        book = Book(
            title=title,
            author=author or None,
            isbn=isbn or None,
            publisher=publisher,
            genres=_csv_genres(row) or None,
            cover_url=cover_url,
            section_id=section.id,
            added_by=admin_id,
        )
        source = "CSV"

        db.add(book)
        imported += 1
        print(f"{label} OK  [{source}]")

        if i % 20 == 0:
            db.commit()
            print(f"  — committed {i} rows so far —")

    db.commit()
    db.close()

    print(f"\n{'─'*60}")
    print(f"  Imported : {imported}")
    print(f"  Skipped  : {skipped}")
    print(f"  Errors   : {errors}")
    print(f"{'─'*60}\n")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1])
