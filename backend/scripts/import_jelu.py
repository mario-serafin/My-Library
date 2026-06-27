#!/usr/bin/env python3
"""
One-shot import of books from a Jelu CSV export.

Usage (from project root):
  docker compose exec api python scripts/import_jelu.py scripts/jelu-export.csv

All books are assigned to TARGET_SECTION.
Duplicates (matched by ISBN or title+author) are skipped automatically.
"""
import csv
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx
from app.database import SyncSessionLocal
from app.models.book import Book
from app.models.section import Section
from app.models.user import User

TARGET_SECTION = "Giallo, Thriller e Noir"
OL_ISBN_API = "https://openlibrary.org/api/books"
REQUEST_DELAY = 0.4   # seconds between OpenLibrary calls — stay well under rate limit


# ── OpenLibrary helpers ────────────────────────────────────────────────────────

def _ol_fetch_isbn(isbn: str) -> dict | None:
    """Fetch rich book data from OpenLibrary Books API by ISBN."""
    try:
        resp = httpx.get(
            OL_ISBN_API,
            params={"bibkeys": f"ISBN:{isbn}", "format": "json", "jscmd": "data"},
            timeout=12,
        )
        data = resp.json()
        raw = data.get(f"ISBN:{isbn}")
        if not raw:
            return None

        authors = [a.get("name", "") for a in raw.get("authors", [])]
        publishers = [p.get("name", "") for p in raw.get("publishers", [])]
        subjects = [s.get("name", s) if isinstance(s, dict) else s
                    for s in raw.get("subjects", [])][:6]

        publish_date = raw.get("publish_date", "")
        year = None
        if publish_date:
            m = re.search(r"\d{4}", publish_date)
            year = int(m.group()) if m else None

        desc = raw.get("description")
        if isinstance(desc, dict):
            desc = desc.get("value")

        cover = None
        if "cover" in raw:
            cover = raw["cover"].get("large") or raw["cover"].get("medium") or raw["cover"].get("small")

        ol_id = None
        if raw.get("works"):
            ol_id = raw["works"][0]["key"].replace("/works/", "")

        return {
            "open_library_id": ol_id,
            "title": raw.get("title", ""),
            "author": ", ".join(a for a in authors if a),
            "isbn": isbn,
            "year": year,
            "description": desc,
            "cover_url": cover,
            "genres": ", ".join(subjects),
            "publisher": publishers[0] if publishers else None,
            "page_count": raw.get("number_of_pages"),
        }
    except Exception as exc:
        print(f"    ⚠ OpenLibrary error: {exc}")
        return None


# ── CSV helpers ────────────────────────────────────────────────────────────────

def _read_csv(path: str) -> list[dict]:
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            with open(path, encoding=enc, errors="replace") as f:
                rows = list(csv.DictReader(f))
            print(f"CSV read with encoding={enc}, {len(rows)} rows")
            return rows
        except Exception:
            continue
    raise RuntimeError(f"Cannot read {path}")


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

        # Try OpenLibrary first
        ol = None
        if isbn:
            ol = _ol_fetch_isbn(isbn)
            time.sleep(REQUEST_DELAY)

        if ol and ol.get("title"):
            book = Book(
                title=ol["title"],
                author=ol.get("author") or author or None,
                isbn=isbn or None,
                year=ol.get("year"),
                description=ol.get("description"),
                cover_url=ol.get("cover_url"),
                genres=ol.get("genres") or _csv_genres(row) or None,
                publisher=ol.get("publisher") or publisher,
                page_count=ol.get("page_count"),
                open_library_id=ol.get("open_library_id"),
                section_id=section.id,
                added_by=admin_id,
            )
            source = "OpenLibrary"
        else:
            book = Book(
                title=title,
                author=author or None,
                isbn=isbn or None,
                publisher=publisher,
                genres=_csv_genres(row) or None,
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
