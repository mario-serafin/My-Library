#!/usr/bin/env python3
"""
Enrichment script: fetches REAL covers + metadata from Google Books.

- Validates each cover by downloading it and rejecting Google's generic
  "image not available" placeholder (flat gray text on white = ~0 saturation).
- Falls back to a title+author search when the ISBN record has no real cover.
- Clears the cover (→ placeholder icon in UI) only when nothing real is found.
- Fixes auto-generated titles like "Book 9788809971493".

Usage (from project root):
  docker compose exec api python scripts/enrich_covers.py

Set GOOGLE_BOOKS_API_KEY in .env for higher quota (optional).
"""
import io
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx
from PIL import Image
from app.config import settings
from app.database import SyncSessionLocal
from app.models.book import Book

GB_SEARCH = "https://www.googleapis.com/books/v1/volumes"
DELAY = 0.4

# Cover validation thresholds (tuned for Google's "image not available" image)
SAT_THRESHOLD = 12      # avg color saturation below this = grayscale placeholder
WHITE_THRESHOLD = 0.35  # fraction of near-white pixels above this = blank/placeholder


def _download(url: str) -> bytes | None:
    try:
        r = httpx.get(url, timeout=12, follow_redirects=True)
        if r.status_code == 200 and r.content:
            return r.content
    except Exception:
        pass
    return None


def _is_real_cover(content: bytes) -> bool:
    """
    True if the image looks like a genuine book cover.
    Rejects: tiny blanks (OpenLibrary 1px) and Google's gray
    "image not available" placeholder (no color, mostly white).
    """
    try:
        im = Image.open(io.BytesIO(content)).convert("RGB")
    except Exception:
        return False

    w, h = im.size
    if w < 20 or h < 20:          # OpenLibrary blank pixel / broken image
        return False

    im = im.resize((40, 60))
    pixels = list(im.getdata())
    n = len(pixels)
    sat_sum = 0
    white = 0
    for r, g, b in pixels:
        sat_sum += max(r, g, b) - min(r, g, b)
        if r > 235 and g > 235 and b > 235:
            white += 1

    avg_sat = sat_sum / n
    white_frac = white / n

    # Placeholder: almost no color AND mostly white background
    if avg_sat < SAT_THRESHOLD and white_frac > WHITE_THRESHOLD:
        return False
    return True


def _clean_cover_url(url: str | None) -> str | None:
    if not url:
        return None
    url = url.replace("http://", "https://")
    url = url.replace("&edge=curl", "").replace("edge=curl", "")
    return url


def _gb_search(query: str, limit: int = 5) -> list[dict]:
    params: dict = {"q": query, "maxResults": limit}
    if settings.GOOGLE_BOOKS_API_KEY:
        params["key"] = settings.GOOGLE_BOOKS_API_KEY
    try:
        r = httpx.get(GB_SEARCH, params=params, timeout=10)
        r.raise_for_status()
        return [it.get("volumeInfo", {}) for it in (r.json().get("items") or [])]
    except Exception as exc:
        print(f"    ⚠ Google Books error: {exc}")
        return []


def _find_good_cover(infos: list[dict]) -> str | None:
    """Return the first validated real cover URL from a list of volumeInfos."""
    for info in infos:
        url = _clean_cover_url(
            info.get("imageLinks", {}).get("thumbnail")
            or info.get("imageLinks", {}).get("smallThumbnail")
        )
        if not url:
            continue
        content = _download(url)
        if content and _is_real_cover(content):
            return url
    return None


def _is_placeholder_title(title: str) -> bool:
    return title.startswith("Book ") and title[5:].replace("-", "").isdigit()


def _extract_meta(info: dict) -> dict:
    year = None
    pd = info.get("publishedDate", "")
    if pd and len(pd) >= 4 and pd[:4].isdigit():
        year = int(pd[:4])
    desc = (info.get("description") or "").strip() or None
    if desc and len(desc) > 2000:
        desc = desc[:2000] + "…"
    return {
        "title": (info.get("title") or "").strip() or None,
        "author": ", ".join(info.get("authors", [])) or None,
        "year": year,
        "description": desc,
        "publisher": (info.get("publisher") or "").strip() or None,
        "page_count": info.get("pageCount") or None,
    }


def main() -> None:
    db = SyncSessionLocal()
    books = db.query(Book).all()
    print(f"Re-checking covers for {len(books)} books\n")

    fixed = cleared = ok = errors = 0

    for i, book in enumerate(books, 1):
        label = f"[{i:>3}/{len(books)}] {(book.title or '')[:48]:<48}"

        # Gather metadata + cover candidates
        isbn_infos = _gb_search(f"isbn:{book.isbn}", limit=1) if book.isbn else []
        meta_info = isbn_infos[0] if isbn_infos else {}

        # Fix metadata
        if meta_info:
            meta = _extract_meta(meta_info)
            if _is_placeholder_title(book.title or "") and meta["title"]:
                book.title = meta["title"]
            if not book.author and meta["author"]:
                book.author = meta["author"]
            if not book.description and meta["description"]:
                book.description = meta["description"]
            if not book.year and meta["year"]:
                book.year = meta["year"]
            if not book.publisher and meta["publisher"]:
                book.publisher = meta["publisher"]
            if not book.page_count and meta["page_count"]:
                book.page_count = meta["page_count"]

        # Find a real cover: ISBN record first, then title+author search
        cover = _find_good_cover(isbn_infos)
        if not cover:
            title = book.title or ""
            author = book.author or ""
            if title:
                query = f'intitle:{title}'
                if author:
                    query += f' inauthor:{author.split(",")[0]}'
                cover = _find_good_cover(_gb_search(query, limit=5))
        time.sleep(DELAY)

        if cover:
            if cover != book.cover_url:
                book.cover_url = cover
                fixed += 1
                print(f"{label} ✓ real cover")
            else:
                ok += 1
                print(f"{label} = already good")
        else:
            if book.cover_url:
                book.cover_url = None
                cleared += 1
                print(f"{label} ✗ no cover found — cleared")
            else:
                errors += 1
                print(f"{label} ✗ no cover")

        if i % 20 == 0:
            db.commit()
            print(f"  — committed {i} rows —")

    db.commit()
    db.close()

    print(f"\n{'─'*60}")
    print(f"  Covers fixed   : {fixed}")
    print(f"  Already good   : {ok}")
    print(f"  Cleared (none) : {cleared}")
    print(f"  No cover       : {errors}")
    print(f"{'─'*60}\n")


if __name__ == "__main__":
    main()
