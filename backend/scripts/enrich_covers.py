#!/usr/bin/env python3
"""
Enrichment script: fetches covers, descriptions, and missing metadata
from Google Books API for all books that have an ISBN.

Fixes books with placeholder titles like "Book 9788809971493".

Usage (from project root):
  docker compose exec api python scripts/enrich_covers.py

Set GOOGLE_BOOKS_API_KEY in .env for higher quota (optional — works without key).
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx
from app.config import settings
from app.database import SyncSessionLocal
from app.models.book import Book

GB_SEARCH = "https://www.googleapis.com/books/v1/volumes"
DELAY = 0.5   # seconds between requests


def _gb_fetch(isbn: str) -> dict | None:
    params: dict = {"q": f"isbn:{isbn}", "maxResults": 1}
    if settings.GOOGLE_BOOKS_API_KEY:
        params["key"] = settings.GOOGLE_BOOKS_API_KEY
    try:
        r = httpx.get(GB_SEARCH, params=params, timeout=10)
        r.raise_for_status()
        items = r.json().get("items")
        if not items:
            return None
        info = items[0].get("volumeInfo", {})

        # Cover URL — upgrade to HTTPS and request larger size
        thumbnail = (
            info.get("imageLinks", {}).get("large")
            or info.get("imageLinks", {}).get("medium")
            or info.get("imageLinks", {}).get("thumbnail")
        )
        if thumbnail:
            thumbnail = thumbnail.replace("http://", "https://")
            # zoom=1 is small; zoom=0 gives the largest available
            thumbnail = thumbnail.replace("zoom=1", "zoom=0").replace("&edge=curl", "")

        # Year from publishedDate (YYYY or YYYY-MM-DD)
        year = None
        pd = info.get("publishedDate", "")
        if pd and len(pd) >= 4 and pd[:4].isdigit():
            year = int(pd[:4])

        # Description
        desc = info.get("description", "").strip() or None
        if desc and len(desc) > 2000:
            desc = desc[:2000] + "…"

        return {
            "title": info.get("title", "").strip() or None,
            "author": ", ".join(info.get("authors", [])) or None,
            "cover_url": thumbnail,
            "year": year,
            "description": desc,
            "publisher": info.get("publisher", "").strip() or None,
            "page_count": info.get("pageCount") or None,
        }
    except Exception as exc:
        print(f"    ⚠ Google Books error: {exc}")
        return None


def _is_placeholder_title(title: str) -> bool:
    """Detects auto-generated titles like 'Book 9788809971493'."""
    return title.startswith("Book ") and title[5:].replace("-", "").isdigit()


def main() -> None:
    db = SyncSessionLocal()

    # Target: books with an ISBN that either have no cover or a placeholder title
    books = (
        db.query(Book)
        .filter(Book.isbn.isnot(None))
        .all()
    )

    candidates = [
        b for b in books
        if (not b.cover_url)
        or ("covers.openlibrary.org" in (b.cover_url or ""))
        or _is_placeholder_title(b.title or "")
    ]

    print(f"Found {len(candidates)} books to enrich out of {len(books)} total\n")

    updated = skipped = errors = 0

    for i, book in enumerate(candidates, 1):
        label = f"[{i:>3}/{len(candidates)}] {book.title[:50]:<50}"

        data = _gb_fetch(book.isbn)
        time.sleep(DELAY)

        if not data:
            # Clear broken OpenLibrary cover so the placeholder icon shows
            # instead of a blank 1×1 transparent pixel.
            if book.cover_url and "covers.openlibrary.org" in book.cover_url:
                book.cover_url = None
                print(f"{label} NOT FOUND — cleared blank cover")
            else:
                print(f"{label} NOT FOUND")
            errors += 1
            continue

        changed = False

        # Fix placeholder title
        if _is_placeholder_title(book.title or "") and data.get("title"):
            book.title = data["title"]
            changed = True

        # Fill missing author
        if not book.author and data.get("author"):
            book.author = data["author"]
            changed = True

        # Update cover (always if Google has one)
        if data.get("cover_url"):
            book.cover_url = data["cover_url"]
            changed = True

        # Fill missing fields only (don't overwrite existing data)
        if not book.description and data.get("description"):
            book.description = data["description"]
            changed = True
        if not book.year and data.get("year"):
            book.year = data["year"]
            changed = True
        if not book.publisher and data.get("publisher"):
            book.publisher = data["publisher"]
            changed = True
        if not book.page_count and data.get("page_count"):
            book.page_count = data["page_count"]
            changed = True

        if changed:
            updated += 1
            cover_ok = "✓ cover" if data.get("cover_url") else "✗ cover"
            print(f"{label} UPDATED [{cover_ok}]")
        else:
            skipped += 1
            print(f"{label} no changes")

        if i % 20 == 0:
            db.commit()
            print(f"  — committed {i} rows —")

    db.commit()
    db.close()

    print(f"\n{'─'*60}")
    print(f"  Updated : {updated}")
    print(f"  Skipped : {skipped}")
    print(f"  Not found: {errors}")
    print(f"{'─'*60}\n")


if __name__ == "__main__":
    main()
