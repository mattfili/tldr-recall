"""Content-type classification tests (spec §6.5 + Appendix B, issue #23).

Table-driven, pure unit — NO network, NO database. Covers all five ContentType values,
each signal tier (domain rules, TLDR label, resources block, bare-homepage heuristic),
and the article fallback.
"""

from __future__ import annotations

import pytest

from recall.ingestion.base import RawArticle
from recall.ingestion.classify import classify_type
from recall.models.enums import ContentType


def _article(
    *, label: str | None = None, resources: list[dict] | None = None
) -> RawArticle:
    return RawArticle(title="T", summary="S", label=label, resources=resources)


@pytest.mark.parametrize(
    ("domain", "url", "article", "expected"),
    [
        # ── 1. strong domain rules ──
        ("github.com", "https://github.com/foo/bar", _article(), ContentType.repo),
        ("gitlab.com", "https://gitlab.com/foo/bar", _article(), ContentType.repo),
        ("notes.substack.com", "https://notes.substack.com/p/x", _article(), ContentType.substack),
        ("arxiv.org", "https://arxiv.org/abs/2406.01234", _article(), ContentType.paper),
        ("ssrn.com", "https://ssrn.com/abstract=12345", _article(), ContentType.paper),
        ("foo.com", "https://foo.com/whitepaper.pdf", _article(), ContentType.paper),
        # exact 'research' path segment -> paper (substring like /researchers must NOT match)
        ("deepmind.com", "https://deepmind.com/research/atoms", _article(), ContentType.paper),
        ("foo.com", "https://foo.com/researchers/jane", _article(), ContentType.article),
        # domain rule beats a conflicting label (strong before weak)
        ("github.com", "https://github.com/foo/bar", _article(label="tool"), ContentType.repo),
        # ── 2. TLDR's own title label on an otherwise-unknown domain ──
        ("example.com", "https://example.com/x", _article(label="GitHub Repo"), ContentType.repo),
        ("example.com", "https://example.com/x", _article(label="paper"), ContentType.paper),
        ("example.com", "https://example.com/x", _article(label="Tool"), ContentType.website),
        ("example.com", "https://example.com/x", _article(label="site"), ContentType.website),
        # unrecognized label falls through to article
        ("example.com", "https://example.com/x", _article(label="weird"), ContentType.article),
        # word-boundary match: 'Report' must NOT read as repo
        ("example.com", "https://example.com/x", _article(label="Report"), ContentType.article),
        # ── 3. resources block reinforcement ──
        (
            "example.com",
            "https://example.com/x",
            _article(resources=[{"k": "repo", "u": "https://github.com/a/b"}]),
            ContentType.repo,
        ),
        (
            "example.com",
            "https://example.com/x",
            _article(resources=[{"kind": "paper"}]),
            ContentType.paper,
        ),
        # ── 4. bare product/tool homepage (no article path, no query) ──
        ("coolproduct.io", "https://coolproduct.io", _article(), ContentType.website),
        ("coolproduct.io", "https://coolproduct.io/", _article(), ContentType.website),
        # homepage heuristic is demoted below an explicit label
        ("example.com", "https://example.com/", _article(label="paper"), ContentType.paper),
        # ── 5. fallback ──
        ("theverge.com", "https://theverge.com/2026/6/9/story", _article(), ContentType.article),
        (
            "nytimes.com",
            "https://nytimes.com/2026/06/09/tech/x.html",
            _article(),
            ContentType.article,
        ),
        # homepage with a query string is NOT a bare homepage
        ("example.com", "https://example.com/?utm_source=x", _article(), ContentType.article),
        # missing domain degrades safely to the fallback path rules
        (None, "https://example.com/some/story", _article(), ContentType.article),
    ],
)
def test_classify_type_table(
    domain: str | None, url: str, article: RawArticle, expected: ContentType
) -> None:
    assert classify_type(domain, url, article) is expected


def test_all_five_content_types_are_reachable() -> None:
    """Belt-and-braces: the table above produces every enum member at least once."""
    produced = {
        classify_type("github.com", "https://github.com/a/b", _article()),
        classify_type("x.substack.com", "https://x.substack.com/p/y", _article()),
        classify_type("arxiv.org", "https://arxiv.org/abs/1", _article()),
        classify_type("tool.io", "https://tool.io", _article()),
        classify_type("news.com", "https://news.com/story/1", _article()),
    }
    assert produced == set(ContentType)
