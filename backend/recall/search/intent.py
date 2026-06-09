"""Intent parsing for unified hybrid search (#7, spec §8, ADR-0001/0002/0003).

``parse(query)`` turns a natural-language search box into a :class:`ParsedIntent`: the hard/soft
type cues, hard exclusions (negation), edition/starred filters, and the ``cleaned_query`` — the
PURE TOPIC string that the vector arm embeds (recognized intent words + stopwords stripped).

GRILLED SCOPE (2026-06-09) — ADR-0002 READ CUE REMOVED: there is NO ``unread`` / ``haven't
read`` cue anywhere in this lexicon, and there is no ``read_state`` anywhere downstream. Words
like ``read`` / ``unread`` survive as plain topic tokens (they are not stopwords, not cues).

TYPE LEXICON (grilled scope):
* STRONG cues -> a HARD ``content_type`` filter (``types_strong``). e.g. ``github``/``repo`` ->
  ``repo``; ``paper``/``arxiv`` -> ``paper``.
* WEAK cues -> a SOFT additive boost (``types_weak``). e.g. ``blog``/``substack`` ->
  ``substack``; ``site``/``website`` -> ``website``.
* ``article`` / ``articles`` are STOPWORDS (NOT a type cue) per the prototype STOP set — a
  generic word, not a "filter to articles" intent.

NEGATION (``non-`` / ``not`` / ``without``) is ALWAYS a HARD exclude (grilled scope): a negated
TYPE cue -> exclude that ``content_type``; a negated TOPIC term -> exclude content matching it.

EDITIONS: the seeded editions (``tldr`` / ``ai`` / ``founders``) plus their lowercased display
names (``tldr`` / ``tldr ai`` / ``tldr founders``) -> the edition key (a filter).

STARRED: ``starred`` / ``saved`` -> ``starred=True`` (a filter).

Pure stdlib — no ORM, no model SDK. This module is import-cheap and side-effect free.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# STRONG type cues -> HARD content_type filter (the cue word maps to the ContentType label).
_STRONG_TYPES: dict[str, str] = {
    "github": "repo",
    "repo": "repo",
    "repos": "repo",
    "repository": "repo",
    "repositories": "repo",
    "paper": "paper",
    "papers": "paper",
    "arxiv": "paper",
}

# WEAK type cues -> SOFT additive boost (does not filter the candidate universe).
_WEAK_TYPES: dict[str, str] = {
    "blog": "substack",
    "blogs": "substack",
    "substack": "substack",
    "substacks": "substack",
    "newsletter": "substack",
    "newsletters": "substack",
    "site": "website",
    "sites": "website",
    "website": "website",
    "websites": "website",
}

# Multi-word edition display names first (matched before single tokens), then single-token keys.
# Values are the canonical seeded edition KEY.
_EDITION_PHRASES: list[tuple[str, str]] = [
    ("tldr ai", "ai"),
    ("tldr founders", "founders"),
]
_EDITION_TOKENS: dict[str, str] = {
    "tldr": "tldr",
    "ai": "ai",
    "founders": "founders",
}

# starred/saved -> the starred filter.
_STARRED_WORDS: frozenset[str] = frozenset({"starred", "saved"})

# Negation markers. ``non-`` / ``non `` glue to the next token; ``not`` / ``without`` precede it.
# The separator after ``non`` is REQUIRED (hyphen or whitespace) so a word that merely starts with
# "non" (e.g. "nonprofit", "nonsense") is NOT read as negating its tail ("profit"/"sense").
_NEGATION_RE = re.compile(r"\b(?:non[-\s]\s*|not\s+|without\s+)([a-z][a-z0-9]*)", re.IGNORECASE)

# Stopwords stripped from cleaned_query. Includes 'article'/'articles' (prototype STOP — generic,
# NOT a type cue) and common search filler. NO read/unread cue (ADR-0002 — those stay topic words).
_STOPWORDS: frozenset[str] = frozenset(
    {
        "the", "a", "an", "of", "and", "or", "for", "to", "in", "on", "with", "about",
        "from", "by", "all", "any", "everything", "stuff", "things", "thing", "show",
        "me", "find", "search", "give", "get", "list", "that", "this", "these", "those",
        "article", "articles", "is", "are", "was", "were", "be", "as", "at", "into",
    }
)

# Token-splitting: words are runs of letters/digits (apostrophes split, so "haven't" -> haven, t).
_WORD_RE = re.compile(r"[a-z0-9]+")


@dataclass(frozen=True)
class Negation:
    """One hard exclusion. Exactly one of ``content_type`` / ``term`` is set.

    * ``content_type`` set -> exclude that ``content.content_type`` (the negated token was a type
      cue, strong OR weak — negation always wins as a hard exclude per the grilled scope).
    * ``term`` set -> exclude content whose FTS vector matches the negated topic term.
    """

    content_type: str | None = None
    term: str | None = None


@dataclass(frozen=True)
class ParsedIntent:
    """The structured reading of a search query.

    ``types_strong``/``types_weak`` are ContentType LABELS. ``editions`` are edition KEYS.
    ``cleaned_query`` is the pure topic (intent words + stopwords stripped) the vector arm embeds.
    """

    types_strong: set[str] = field(default_factory=set)
    types_weak: set[str] = field(default_factory=set)
    negations: list[Negation] = field(default_factory=list)
    editions: set[str] = field(default_factory=set)
    starred: bool = False
    cleaned_query: str = ""


def _type_label_for(token: str) -> str | None:
    """The ContentType label for a type-cue token (strong or weak), else None."""
    return _STRONG_TYPES.get(token) or _WEAK_TYPES.get(token)


def parse(query: str) -> ParsedIntent:
    """Parse a search box into a :class:`ParsedIntent` (pure, deterministic, stdlib-only)."""
    text = (query or "").lower()

    # ── 1. Negation FIRST — a negated token is consumed as a hard exclude, never as a cue. ──
    negations: list[Negation] = []
    negated_tokens: set[str] = set()
    for match in _NEGATION_RE.finditer(text):
        token = match.group(1)
        negated_tokens.add(token)
        type_label = _type_label_for(token)
        if type_label is not None:
            negations.append(Negation(content_type=type_label))
        else:
            negations.append(Negation(term=token))
    # Remove the matched negation spans (marker + token) so they never re-enter the lexicon scan
    # or the cleaned_query.
    text_wo_neg = _NEGATION_RE.sub(" ", text)

    # ── 2. Multi-word edition phrases (consumed before single-token matching). ──
    editions: set[str] = set()
    consumed_phrase_tokens: set[str] = set()
    for phrase, key in _EDITION_PHRASES:
        if re.search(rf"\b{re.escape(phrase)}\b", text_wo_neg):
            editions.add(key)
            consumed_phrase_tokens.update(phrase.split())
            text_wo_neg = re.sub(rf"\b{re.escape(phrase)}\b", " ", text_wo_neg)

    # ── 3. Single-token scan over the remaining text. ──
    types_strong: set[str] = set()
    types_weak: set[str] = set()
    starred = False
    topic_tokens: list[str] = []

    for token in _WORD_RE.findall(text_wo_neg):
        if token in negated_tokens:
            # Already consumed as a hard exclude — never also a positive cue or topic word.
            continue
        if token in _STRONG_TYPES:
            types_strong.add(_STRONG_TYPES[token])
            continue
        if token in _WEAK_TYPES:
            types_weak.add(_WEAK_TYPES[token])
            continue
        if token in _EDITION_TOKENS:
            editions.add(_EDITION_TOKENS[token])
            continue
        if token in _STARRED_WORDS:
            starred = True
            continue
        if token in consumed_phrase_tokens:
            # part of a matched edition phrase (e.g. the 'tldr' / 'ai' of 'tldr ai')
            continue
        if token in _STOPWORDS:
            continue
        if len(token) <= 2:
            # Drop very short fragments (incl. apostrophe debris like the 't' of "haven't").
            continue
        topic_tokens.append(token)

    cleaned_query = " ".join(topic_tokens)

    return ParsedIntent(
        types_strong=types_strong,
        types_weak=types_weak,
        negations=negations,
        editions=editions,
        starred=starred,
        cleaned_query=cleaned_query,
    )
