"""Canonical combined-text builder (spec §7, ADR-0001/0003).

``combined_text`` produces the single, TYPE-PREFIXED string that the v1 backfill embeds for
the ``combined`` EmbeddingKind. Putting the item's nature first lets the content type live in
the vector space:

    "[{content_type}] {title} — {summary} (source: {domain}; tags: {t1, t2})"

e.g. ``"[repo] Headroom — Compresses everything an agent reads... (source: github.com; tags:
agents, context)"``.

Format rules (load-bearing — pinned by an exact-string test so they never silently drift):

* ``content_type`` is the RAW enum label (``content.content_type.value``, e.g. ``'repo'``).
* the separator between title and summary is ``' — '`` (U+2014 em dash with surrounding spaces).
* tags are joined with ``', '``.
* EMPTY-TAGS RULE: when ``tags`` is empty the entire ``'; tags: ...'`` segment is OMITTED, so
  the suffix is just ``'(source: {domain})'``.

Pure stdlib — no model SDK, no ORM. Accepts any object exposing ``content_type`` (with a
``.value`` or a plain string), ``title``, ``summary``, ``domain``, and ``tags`` — so it works
on a Content ORM row directly and is reusable by #7's ``embed_query`` path conceptually.
"""

from __future__ import annotations

from typing import Protocol


class _CombinedSource(Protocol):
    title: str
    summary: str
    domain: str
    tags: list[str]


def _content_type_label(content_type: object) -> str:
    """The raw enum label: ``content_type.value`` for an enum, or the value itself if a str."""
    return getattr(content_type, "value", content_type)  # type: ignore[return-value]


def combined_text(content: _CombinedSource) -> str:
    """Build the type-prefixed combined text for ``content`` (the vector's input)."""
    content_type = _content_type_label(content.content_type)  # type: ignore[attr-defined]
    prefix = f"[{content_type}] {content.title} — {content.summary}"

    tags = content.tags or []
    if tags:
        return f"{prefix} (source: {content.domain}; tags: {', '.join(tags)})"
    return f"{prefix} (source: {content.domain})"
