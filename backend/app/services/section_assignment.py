"""
Automatic section assignment based on book genres/title keywords.
System sections are checked in priority order (most specific first).
"""
from __future__ import annotations
import logging
import re

logger = logging.getLogger(__name__)

# Fixed sections with their seed data and recognition keywords
FALLBACK_SECTION_NAME = "Senza Genere"

DEFAULT_SECTIONS: list[dict] = [
    {
        "name": "Fumetti e Graphic Novel",
        "description": "Fumetti, manga e romanzi grafici",
        "genres": "Comics, Graphic Novels, Manga, Comic Books",
        "keywords": [
            "comic", "comics", "graphic novel", "manga", "fumetti", "fumetto",
            "comic book", "comic strip", "superhero", "bande dessinée",
        ],
    },
    {
        "name": "Primi Libri e Albi Illustrati",
        "description": "Libri per i più piccoli, albi illustrati e libri cartonati",
        "genres": "Picture Books, Board Books, Children's Picture Books",
        "keywords": [
            "picture book", "board book", "albo illustrato", "albi illustrati",
            "baby", "toddler", "preschool", "libri per bambini piccoli",
            "children picture", "illustrated children",
        ],
    },
    {
        "name": "Narrativa per Bambini",
        "description": "Libri di narrativa per età scolare (6-11 anni)",
        "genres": "Children's Fiction, Children's Literature, Middle Grade",
        "keywords": [
            "children's fiction", "children's literature", "middle grade",
            "juvenile fiction", "kids fiction", "libri per bambini",
            "narrativa per ragazzi", "elementary school",
        ],
    },
    {
        "name": "Young Adult (YA)",
        "description": "Romanzi di formazione e storie per adolescenti",
        "genres": "Young Adult, Teen Fiction, Coming of Age",
        "keywords": [
            "young adult", "ya fiction", "teen fiction", "teenage",
            "adolescent", "coming of age", "young adult fiction",
            "romanzo di formazione",
        ],
    },
    {
        "name": "Horror",
        "description": "Racconti pensati per spaventare e inquietare",
        "genres": "Horror, Gothic Fiction, Supernatural",
        "keywords": [
            "horror", "ghost", "vampire", "zombie", "supernatural fiction",
            "gothic fiction", "dark fiction", "occult fiction", "terror",
            "haunted", "psychological horror",
        ],
    },
    {
        "name": "Giallo, Thriller e Noir",
        "description": "Storie di mistero, suspense e crimine",
        "genres": "Mystery, Thriller, Crime Fiction, Noir, Detective Fiction",
        "keywords": [
            "thriller", "mystery", "detective", "crime fiction", "noir",
            "giallo", "suspense", "murder mystery", "spy fiction", "espionage",
            "detective fiction", "police procedural", "true crime",
            "psychological thriller", "whodunit",
        ],
    },
    {
        "name": "Fantasy e Fantascienza",
        "description": "Mondi immaginari, magia e ambientazioni futuristiche",
        "genres": "Fantasy, Science Fiction, Dystopia, Space Opera",
        "keywords": [
            "fantasy", "science fiction", "sci-fi", "scifi", "magic",
            "wizard", "dragon", "space opera", "dystopia", "dystopian",
            "alien", "post-apocalyptic", "steampunk", "cyberpunk",
            "epic fantasy", "urban fantasy", "paranormal fantasy",
            "sword and sorcery", "fantascienza", "fantasia",
        ],
    },
    {
        "name": "Romanzo Storico",
        "description": "Storie ambientate in epoche passate",
        "genres": "Historical Fiction, Historical Novel",
        "keywords": [
            "historical fiction", "historical novel", "medievale", "medieval",
            "ancient rome", "roman empire", "victorian", "renaissance",
            "world war", "napoleonic", "romanzo storico", "historical romance",
            "ancient history", "regency", "tudor", "viking",
        ],
    },
    {
        "name": "Rosa e Sentimentale",
        "description": "Storie d'amore e relazioni sentimentali",
        "genres": "Romance, Love Story, Chick Lit, Romantic Fiction",
        "keywords": [
            "romance", "love story", "romantic fiction", "chick lit",
            "contemporary romance", "regency romance", "rosa", "sentimentale",
            "romantico", "harlequin",
        ],
    },
    {
        "name": "Narrativa",
        "description": "Opere di narrativa che non rientrano in categorie specifiche",
        "genres": "Fiction, Literary Fiction, Contemporary Fiction, Short Stories",
        "keywords": [
            "fiction", "literary fiction", "contemporary fiction",
            "short stories", "novel", "narrativa", "letteratura",
        ],
    },
    {
        "name": FALLBACK_SECTION_NAME,
        "description": "Libri il cui genere non è stato riconosciuto automaticamente",
        "genres": "",
        "keywords": [],  # never matched by keyword — only used as fallback
    },
]

# Build lookup: name → keywords (compiled for fast matching)
_KEYWORD_MAP: dict[str, list[str]] = {
    s["name"]: s["keywords"] for s in DEFAULT_SECTIONS
}

# Priority order for matching (index 0 = highest priority)
_PRIORITY: list[str] = [s["name"] for s in DEFAULT_SECTIONS]


def _normalise(text: str) -> str:
    return re.sub(r"[^\w\s]", " ", text.lower())


def detect_section_name(title: str = "", author: str = "", genres: str = "") -> str | None:
    """
    Return the name of the best-matching system section for a book,
    or None if no keyword matches.
    """
    haystack = _normalise(f"{title} {author} {genres}")
    for section_name in _PRIORITY:
        for kw in _KEYWORD_MAP[section_name]:
            if kw in haystack:
                logger.debug("Section match: %r via keyword %r", section_name, kw)
                return section_name
    return None


def assign_section_id(
    title: str,
    author: str,
    genres: str,
    db,  # sync SQLAlchemy session
) -> int | None:
    """
    Return the ID of the best-matching section for a book.
    Falls back to FALLBACK_SECTION_NAME ("Senza Genere") when no keyword matches.
    """
    from app.models.section import Section as SectionModel
    name = detect_section_name(title=title, author=author, genres=genres)
    if name:
        row = db.query(SectionModel).filter_by(name=name).first()
        if row:
            return row.id
    fallback = db.query(SectionModel).filter_by(name=FALLBACK_SECTION_NAME).first()
    return fallback.id if fallback else None


async def assign_section_id_async(
    title: str,
    author: str,
    genres: str,
    db,  # async SQLAlchemy session
) -> int | None:
    """Async version for use in FastAPI routers."""
    from sqlalchemy import select
    from app.models.section import Section as SectionModel
    name = detect_section_name(title=title, author=author, genres=genres)
    if name:
        result = await db.execute(select(SectionModel).where(SectionModel.name == name))
        row = result.scalar_one_or_none()
        if row:
            return row.id
    result = await db.execute(select(SectionModel).where(SectionModel.name == FALLBACK_SECTION_NAME))
    fallback = result.scalar_one_or_none()
    return fallback.id if fallback else None
