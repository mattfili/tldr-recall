"""Content-type classification (spec §6.5 + Appendix B, issue #23).

Pure function — no I/O, no ORM. Maps a resolved (domain, url) plus the parsed
``RawArticle`` to a ``ContentType``. Signal order:

1. Strong domain rules (deterministic): github/gitlab -> repo; ``*.substack.com`` ->
   substack; arxiv/ssrn/journal domains, ``.pdf`` paths, or an exact ``research`` path
   segment -> paper.
2. TLDR's own title label ("(GitHub Repo)", "(paper)", "(tool)", ...) when present.
3. Resources block reinforcement (a ``repo``/``paper`` resource pill).
4. Bare product/tool homepage (no article-ish path) -> website.
5. Fallback -> article.

Deviation from the literal §6.5 ordering: the spec lists the bare-homepage heuristic
inside priority-1 domain rules, but it is a WEAK signal — applying it before TLDR's
explicit label would misclassify e.g. a "(paper)"-labeled link served from a domain
root. Strong rules -> label -> resources -> homepage -> article keeps every spec signal
while ordering weak-after-strong (Appendix B treats the label as a strong signal).
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

from recall.ingestion.base import RawArticle
from recall.models.enums import ContentType

_REPO_DOMAINS = frozenset({"github.com", "gitlab.com"})
_PAPER_DOMAINS = frozenset(
    {
        "arxiv.org",
        "ssrn.com",
        "biorxiv.org",
        "medrxiv.org",
        "nature.com",
        "science.org",
        "openreview.net",
    }
)

#: Lowercased TLDR title-label word matches -> type (Appendix B). Word boundaries so
#: e.g. a "(Report)" label never reads as repo.
_LABEL_PATTERNS = (
    (re.compile(r"\brepos?\b"), ContentType.repo),
    (re.compile(r"\bpapers?\b"), ContentType.paper),
)
_LABEL_EXACT = {
    "tool": ContentType.website,
    "site": ContentType.website,
    "website": ContentType.website,
    "product": ContentType.website,
}

#: Resource-pill kinds that reinforce a type (keys checked: 'k' and 'kind').
_RESOURCE_KINDS = {"repo": ContentType.repo, "paper": ContentType.paper}


def _host_matches(host: str, domain: str) -> bool:
    return host == domain or host.endswith("." + domain)


def classify_type(domain: str | None, url: str, raw_article: RawArticle) -> ContentType:
    """Classify one resolved link into a ``ContentType`` (see module docstring)."""
    host = (domain or "").lower()
    parsed = urlparse(url or "")
    path = parsed.path or ""
    segments = [seg for seg in path.split("/") if seg]

    # 1. Strong domain rules.
    if host and any(_host_matches(host, d) for d in _REPO_DOMAINS):
        return ContentType.repo
    if host.endswith(".substack.com"):
        return ContentType.substack
    if (
        (host and any(_host_matches(host, d) for d in _PAPER_DOMAINS))
        or path.lower().endswith(".pdf")
        or "research" in (seg.lower() for seg in segments)
    ):
        return ContentType.paper

    # 2. TLDR's own title label.
    label = (raw_article.label or "").lower().strip()
    if label:
        for pattern, content_type in _LABEL_PATTERNS:
            if pattern.search(label):
                return content_type
        if label in _LABEL_EXACT:
            return _LABEL_EXACT[label]

    # 3. Resources block reinforcement.
    for resource in raw_article.resources or []:
        kind = str(resource.get("k") or resource.get("kind") or "").lower()
        if kind in _RESOURCE_KINDS:
            return _RESOURCE_KINDS[kind]

    # 4. Bare product/tool homepage (weak heuristic, deliberately after label/resources).
    if not segments and not parsed.query:
        return ContentType.website

    # 5. Fallback.
    return ContentType.article
