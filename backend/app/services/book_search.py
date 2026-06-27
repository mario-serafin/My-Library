import logging
from difflib import SequenceMatcher
import httpx

logger = logging.getLogger(__name__)

OPENLIBRARY_SEARCH = "https://openlibrary.org/search.json"
OPENLIBRARY_COVER = "https://covers.openlibrary.org/b/id/{cover_id}-M.jpg"
OPENLIBRARY_COVER_L = "https://covers.openlibrary.org/b/id/{cover_id}-L.jpg"
OL_FIELDS = "key,title,author_name,first_publish_year,isbn,cover_i,subject,publisher,number_of_pages_median,language"
OL_COVER_FIELDS = "title,language,cover_i,edition_key,first_publish_year"

GOOGLE_BOOKS_SEARCH = "https://www.googleapis.com/books/v1/volumes"

HIGH_CONFIDENCE_THRESHOLD = 0.75
AMBIGUITY_THRESHOLD = 0.65


# ── Scoring ────────────────────────────────────────────────────────────────────

def _similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


def score_candidates(candidates: list, query_title: str, query_author: str = "") -> list:
    for c in candidates:
        title_score = _similarity(c.get("title", ""), query_title)
        author_score = _similarity(c.get("author", ""), query_author) if query_author else 0.0
        weight = 0.7 if not query_author else 0.6
        c["confidence"] = round(title_score * weight + author_score * (1 - weight), 3)
    return sorted(candidates, key=lambda x: x["confidence"], reverse=True)


def is_high_confidence(candidates: list) -> bool:
    if not candidates:
        return False
    top = candidates[0]
    if top["confidence"] < HIGH_CONFIDENCE_THRESHOLD:
        return False
    if len(candidates) > 1 and candidates[1]["confidence"] > AMBIGUITY_THRESHOLD:
        return False
    return True


# ── OpenLibrary ────────────────────────────────────────────────────────────────

def _build_ol_candidate(doc: dict) -> dict:
    isbn_list = doc.get("isbn") or []
    cover_id = doc.get("cover_i")
    return {
        "open_library_id": doc.get("key", "").replace("/works/", ""),
        "title": doc.get("title", ""),
        "author": ", ".join((doc.get("author_name") or [])[:3]),
        "year": doc.get("first_publish_year"),
        "isbn": isbn_list[0] if isbn_list else None,
        "cover_url": OPENLIBRARY_COVER.format(cover_id=cover_id) if cover_id else None,
        "genres": ", ".join((doc.get("subject") or [])[:5]),
        "publisher": ((doc.get("publisher") or [""])[0]),
        "page_count": doc.get("number_of_pages_median"),
        "language": ", ".join((doc.get("language") or [])[:3]),
        "confidence": 0.0,
        "source": "openlibrary",
    }


async def search_openlibrary(title: str = "", author: str = "", limit: int = 10) -> list:
    if not title and not author:
        return []
    params: dict = {"limit": limit, "fields": OL_FIELDS}
    if title:
        params["title"] = title
    if author:
        params["author"] = author
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(OPENLIBRARY_SEARCH, params=params)
            resp.raise_for_status()
            docs = resp.json().get("docs", [])
    except Exception as e:
        logger.warning("OpenLibrary async error: %s", e)
        return []
    return score_candidates([_build_ol_candidate(d) for d in docs], title, author)


def search_openlibrary_sync(title: str = "", author: str = "", limit: int = 10) -> list:
    if not title and not author:
        return []
    params: dict = {"limit": limit, "fields": OL_FIELDS}
    if title:
        params["title"] = title
    if author:
        params["author"] = author
    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(OPENLIBRARY_SEARCH, params=params)
            resp.raise_for_status()
            docs = resp.json().get("docs", [])
    except Exception as e:
        logger.warning("OpenLibrary sync error: %s", e)
        return []
    return score_candidates([_build_ol_candidate(d) for d in docs], title, author)


# ── Google Books ───────────────────────────────────────────────────────────────

def _build_gb_candidate(item: dict) -> dict:
    info = item.get("volumeInfo", {})
    isbns = {i["type"]: i["identifier"] for i in info.get("industryIdentifiers", [])}
    thumbnail = info.get("imageLinks", {}).get("thumbnail", "")
    if thumbnail:
        thumbnail = thumbnail.replace("http://", "https://").replace("&zoom=1", "&zoom=0")
    date = info.get("publishedDate", "")
    year = int(date[:4]) if date and date[:4].isdigit() else None
    return {
        "open_library_id": None,
        "google_books_id": item.get("id"),
        "title": info.get("title", ""),
        "author": ", ".join(info.get("authors", [])),
        "year": year,
        "isbn": isbns.get("ISBN_13") or isbns.get("ISBN_10"),
        "cover_url": thumbnail or None,
        "genres": ", ".join((info.get("categories") or [])[:5]),
        "publisher": info.get("publisher"),
        "page_count": info.get("pageCount"),
        "language": info.get("language"),
        "description": info.get("description", "")[:500] if info.get("description") else None,
        "confidence": 0.0,
        "source": "google_books",
    }


async def search_google_books(title: str = "", author: str = "", limit: int = 10) -> list:
    from app.config import settings
    if not title and not author:
        return []
    parts = []
    if title:
        parts.append(f"intitle:{title}")
    if author:
        parts.append(f"inauthor:{author}")
    params: dict = {"q": " ".join(parts), "maxResults": min(limit, 40), "printType": "books"}
    if settings.GOOGLE_BOOKS_API_KEY:
        params["key"] = settings.GOOGLE_BOOKS_API_KEY
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(GOOGLE_BOOKS_SEARCH, params=params)
            resp.raise_for_status()
            items = resp.json().get("items", [])
    except Exception as e:
        logger.warning("Google Books async error: %s", e)
        return []
    return score_candidates([_build_gb_candidate(i) for i in items], title, author)


def search_google_books_sync(title: str = "", author: str = "", limit: int = 10) -> list:
    from app.config import settings
    if not title and not author:
        return []
    parts = []
    if title:
        parts.append(f"intitle:{title}")
    if author:
        parts.append(f"inauthor:{author}")
    params: dict = {"q": " ".join(parts), "maxResults": min(limit, 40), "printType": "books"}
    if settings.GOOGLE_BOOKS_API_KEY:
        params["key"] = settings.GOOGLE_BOOKS_API_KEY
    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(GOOGLE_BOOKS_SEARCH, params=params)
            resp.raise_for_status()
            items = resp.json().get("items", [])
    except Exception as e:
        logger.warning("Google Books sync error: %s", e)
        return []
    return score_candidates([_build_gb_candidate(i) for i in items], title, author)


# ── Unified search with fallback ───────────────────────────────────────────────

async def search_books(title: str = "", author: str = "", limit: int = 15) -> list:
    """OpenLibrary first; if no results fall back to Google Books."""
    results = await search_openlibrary(title=title, author=author, limit=limit)
    if not results:
        logger.info("OpenLibrary returned nothing, trying Google Books")
        results = await search_google_books(title=title, author=author, limit=limit)
    return results


def search_books_sync(title: str = "", author: str = "", limit: int = 15) -> list:
    """OpenLibrary first; if no results fall back to Google Books."""
    results = search_openlibrary_sync(title=title, author=author, limit=limit)
    if not results:
        logger.info("OpenLibrary returned nothing, trying Google Books (sync)")
        results = search_google_books_sync(title=title, author=author, limit=limit)
    return results


# ── Cover search (many editions / languages) ────────────────────────────────────

# ISO 639-1 → human label, for the few languages most relevant here
_LANG_LABELS = {
    "it": "Italiano", "en": "English", "fr": "Français", "de": "Deutsch",
    "es": "Español", "pt": "Português", "nl": "Nederlands", "sv": "Svenska",
    "da": "Dansk", "no": "Norsk", "fi": "Suomi", "pl": "Polski", "ru": "Русский",
    "ja": "日本語", "zh": "中文",
}


def _lang_label(code: str | None) -> str | None:
    if not code:
        return None
    return _LANG_LABELS.get(code.lower(), code.upper())


def _clean_gb_cover(url: str | None) -> str | None:
    if not url:
        return None
    return url.replace("http://", "https://").replace("&edge=curl", "").replace("edge=curl", "")


async def _covers_from_google(client, title: str, author: str, isbn: str) -> list[dict]:
    queries = []
    if isbn:
        queries.append(f"isbn:{isbn}")
    if title:
        q = f"intitle:{title}"
        if author:
            q += f" inauthor:{author.split(',')[0]}"
        queries.append(q)

    covers: list[dict] = []
    for q in queries:
        params: dict = {"q": q, "maxResults": 40, "printType": "books"}
        if settings.GOOGLE_BOOKS_API_KEY:
            params["key"] = settings.GOOGLE_BOOKS_API_KEY
        try:
            resp = await client.get(GOOGLE_BOOKS_SEARCH, params=params)
            resp.raise_for_status()
            items = resp.json().get("items", [])
        except Exception as e:
            logger.warning("Google Books cover search error: %s", e)
            continue
        for it in items:
            info = it.get("volumeInfo", {})
            url = _clean_gb_cover(info.get("imageLinks", {}).get("thumbnail")
                                  or info.get("imageLinks", {}).get("smallThumbnail"))
            if url:
                covers.append({
                    "url": url,
                    "source": "Google Books",
                    "language": _lang_label(info.get("language")),
                    "edition": info.get("publisher"),
                })
    return covers


async def _covers_from_openlibrary(client, title: str, author: str, isbn: str) -> list[dict]:
    params: dict = {"limit": 25, "fields": OL_COVER_FIELDS}
    if title:
        params["title"] = title
    if author:
        params["author"] = author
    if isbn and not title:
        params["isbn"] = isbn
    if not params.get("title") and not params.get("isbn"):
        return []
    try:
        resp = await client.get(OPENLIBRARY_SEARCH, params=params)
        resp.raise_for_status()
        docs = resp.json().get("docs", [])
    except Exception as e:
        logger.warning("OpenLibrary cover search error: %s", e)
        return []

    covers: list[dict] = []
    for doc in docs:
        cover_id = doc.get("cover_i")
        if not cover_id:
            continue
        langs = doc.get("language") or []
        covers.append({
            "url": OPENLIBRARY_COVER_L.format(cover_id=cover_id),
            "source": "OpenLibrary",
            "language": _lang_label(langs[0][:2]) if langs else None,
            "edition": str(doc.get("first_publish_year")) if doc.get("first_publish_year") else None,
        })
    return covers


async def search_covers(title: str = "", author: str = "", isbn: str = "") -> list[dict]:
    """
    Aggregate cover candidates from Google Books and OpenLibrary,
    spanning multiple editions and languages. Deduplicated by URL.
    """
    if not title and not isbn:
        return []
    async with httpx.AsyncClient(timeout=15.0) as client:
        gb = await _covers_from_google(client, title, author, isbn)
        ol = await _covers_from_openlibrary(client, title, author, isbn)

    seen = set()
    result = []
    for c in gb + ol:
        if c["url"] in seen:
            continue
        seen.add(c["url"])
        result.append(c)
    return result
