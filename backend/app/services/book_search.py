from difflib import SequenceMatcher
from typing import Optional
import httpx

OPENLIBRARY_SEARCH = "https://openlibrary.org/search.json"
OPENLIBRARY_COVER = "https://covers.openlibrary.org/b/id/{cover_id}-M.jpg"
FIELDS = "key,title,author_name,first_publish_year,isbn,cover_i,subject,publisher,number_of_pages_median,language"
HIGH_CONFIDENCE_THRESHOLD = 0.75
AMBIGUITY_THRESHOLD = 0.65


def _build_candidate(doc: dict) -> dict:
    isbn_list = doc.get("isbn") or []
    author_names = doc.get("author_name") or []
    subjects = doc.get("subject") or []
    publishers = doc.get("publisher") or []
    languages = doc.get("language") or []
    cover_id = doc.get("cover_i")
    return {
        "open_library_id": doc.get("key", "").replace("/works/", ""),
        "title": doc.get("title", ""),
        "author": ", ".join(author_names[:3]),
        "year": doc.get("first_publish_year"),
        "isbn": isbn_list[0] if isbn_list else None,
        "cover_url": OPENLIBRARY_COVER.format(cover_id=cover_id) if cover_id else None,
        "genres": ", ".join(subjects[:5]),
        "publisher": publishers[0] if publishers else None,
        "page_count": doc.get("number_of_pages_median"),
        "language": ", ".join(languages[:3]),
        "confidence": 0.0,
    }


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


async def search_openlibrary(title: str = "", author: str = "", limit: int = 10) -> list:
    params: dict = {"limit": limit, "fields": FIELDS}
    if title:
        params["title"] = title
    if author:
        params["author"] = author
    if not title and not author:
        return []
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(OPENLIBRARY_SEARCH, params=params)
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return []
    candidates = [_build_candidate(doc) for doc in data.get("docs", [])]
    return score_candidates(candidates, title, author)


def search_openlibrary_sync(title: str = "", author: str = "", limit: int = 10) -> list:
    params: dict = {"limit": limit, "fields": FIELDS}
    if title:
        params["title"] = title
    if author:
        params["author"] = author
    if not title and not author:
        return []
    with httpx.Client(timeout=15.0) as client:
        try:
            resp = client.get(OPENLIBRARY_SEARCH, params=params)
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return []
    candidates = [_build_candidate(doc) for doc in data.get("docs", [])]
    return score_candidates(candidates, title, author)
