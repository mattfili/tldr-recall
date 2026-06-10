"""TLDR email parser: one ``.eml`` -> ``RawIssue`` (spec §6.3, issue #22).

Stdlib only. ``parse_eml`` reads the RFC822 message (headers + HTML body part) and
delegates to ``parse_html``, which flattens the deeply nested table markup into an
ordered stream of text blocks and classifies them with a small state machine:

* emoji/bold section headers -> ``RawSection.category_label`` (emoji stripped, label kept);
* ``Title (N minute read)`` / ``Title (GitHub Repo)`` anchors -> ``RawArticle`` with the
  raw tracking href (NO resolution here — that is §6.4's job);
* following plain paragraphs -> the article summary (multi-paragraph supported);
* sponsor blocks are NOT Content (CONTEXT.md): ``(Sponsor)``-suffixed items and
  "Together With" masthead slots are skipped entirely, pitch paragraphs included.

Tolerant by design: missing read-times, emoji-less headers, unknown section names (the
label passes through; category auto-create happens later in the pipeline, #26).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import parseaddr, parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path

from recall.ingestion.base import RawArticle, RawIssue, RawSection

# --- classification constants -------------------------------------------------------

#: ``(5 minute read)`` / ``(1 minute read)`` title suffix -> read_minutes.
_MINUTE_READ_RE = re.compile(r"\(\s*(\d+)\s+minutes?\s+read\s*\)\s*$", re.IGNORECASE)
#: Generic parenthetical title suffix, e.g. ``(GitHub Repo)``, ``(Sponsor)``.
_LABEL_SUFFIX_RE = re.compile(r"\(([^()]{1,40})\)\s*$")
#: "Together With" masthead ad slot (CONTEXT.md: sponsor block, never Content).
_TOGETHER_WITH_RE = re.compile(r"^together\s+with\b", re.IGNORECASE)
#: Masthead line ("TLDR AI 2026-06-09") — never a section header or subtitle.
_MASTHEAD_RE = re.compile(r"^TLDR\b", re.IGNORECASE)
#: Leading emoji/symbol run on section headers ("🚀 Headlines & Launches").
_LEADING_NONWORD_RE = re.compile(r"^[\W_]+")
#: Subject/sender date tail used when deriving the edition from the Subject header.
_DATE_TAIL_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
#: Footer boilerplate markers: once sections exist, stop consuming at the first hit.
_FOOTER_MARKERS = ("love tldr", "unsubscribe", "track your referrals", "want to advertise")

_KNOWN_EDITIONS = {"": "tldr", "ai": "ai", "founders": "founders"}

_SKIP_TAGS = frozenset({"style", "script", "head", "title"})
_EMPHASIS_TAGS = frozenset({"strong", "b", "h1", "h2", "h3", "h4", "h5", "h6"})
_BLOCK_TAGS = frozenset(
    {
        "blockquote", "br", "div", "footer", "h1", "h2", "h3", "h4", "h5", "h6",
        "header", "hr", "li", "ol", "p", "section", "table", "td", "tr", "ul",
    }
)  # fmt: skip

_MAX_HEADER_LEN = 60  # section headers are short labels, not sentences


@dataclass
class _Block:
    """One flattened run of visible text between block-level boundaries."""

    text: str
    href: str | None  # innermost anchor href covering the text, verbatim
    emphasized: bool  # majority of the text sat inside strong/b/h*


class _BlockExtractor(HTMLParser):
    """Flatten TLDR's nested-table HTML into an ordered list of ``_Block``s."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[_Block] = []
        self._parts: list[str] = []
        self._href: str | None = None
        self._anchor_stack: list[str | None] = []
        self._emphasis_depth = 0
        self._skip_depth = 0
        self._emphasized_chars = 0
        self._total_chars = 0

    # -- tag events
    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _SKIP_TAGS:
            self._skip_depth += 1
            return
        if tag == "a":
            self._anchor_stack.append(dict(attrs).get("href"))
        if tag in _EMPHASIS_TAGS:
            self._emphasis_depth += 1
        if tag in _BLOCK_TAGS:
            self._flush()

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIP_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if tag == "a" and self._anchor_stack:
            self._anchor_stack.pop()
        if tag in _EMPHASIS_TAGS:
            self._emphasis_depth = max(0, self._emphasis_depth - 1)
        if tag in _BLOCK_TAGS:
            self._flush()

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _BLOCK_TAGS:
            self._flush()

    # -- text events
    def handle_data(self, data: str) -> None:
        if self._skip_depth or not data.strip():
            return
        self._parts.append(data)
        n = len(data.strip())
        self._total_chars += n
        if self._emphasis_depth:
            self._emphasized_chars += n
        if self._href is None and self._anchor_stack and self._anchor_stack[-1]:
            self._href = self._anchor_stack[-1]

    def close(self) -> None:
        super().close()
        self._flush()

    def _flush(self) -> None:
        text = re.sub(r"\s+", " ", " ".join(self._parts)).strip()
        if text:
            emphasized = self._total_chars > 0 and self._emphasized_chars * 2 >= self._total_chars
            self.blocks.append(_Block(text=text, href=self._href, emphasized=emphasized))
        self._parts = []
        self._href = None
        self._emphasized_chars = 0
        self._total_chars = 0


# --- block classification -----------------------------------------------------------


def _title_suffix(text: str) -> tuple[str, int | None, str | None] | None:
    """If ``text`` ends with a TLDR title parenthetical, return (title, minutes, label).

    ``(N minute read)`` -> minutes set, label None; ``(GitHub Repo)``/``(Sponsor)`` ->
    minutes None, label set. Returns None when there is no recognizable suffix.
    """
    m = _MINUTE_READ_RE.search(text)
    if m:
        return text[: m.start()].strip(), int(m.group(1)), None
    m = _LABEL_SUFFIX_RE.search(text)
    if m:
        return text[: m.start()].strip(), None, m.group(1).strip()
    return None


def _strip_emoji(label: str) -> str:
    """Drop the leading emoji/symbol run, keep the human label text."""
    return _LEADING_NONWORD_RE.sub("", label).strip()


def _is_section_header(block: _Block) -> bool:
    """Emphasized/emoji-led/ALL-CAPS short block with no link -> category header."""
    if block.href or len(block.text) > _MAX_HEADER_LEN:
        return False
    if _MASTHEAD_RE.match(block.text) or _TOGETHER_WITH_RE.match(block.text):
        return False
    stripped = _strip_emoji(block.text)
    if not stripped:
        return False
    has_leading_emoji = stripped != block.text
    return block.emphasized or has_leading_emoji or block.text.isupper()


def _is_footer(text: str) -> bool:
    lowered = text.lower()
    return any(marker in lowered for marker in _FOOTER_MARKERS)


def _derive_edition_key(sender_name: str, subject: str) -> str:
    """Map ``TLDR <Name>`` (From display name, else Subject prefix) to an edition key.

    Known editions: tldr / ai / founders. Unknown TLDR editions pass through as a
    derived slug ("TLDR Web Dev" -> "webdev"); auto-create happens later (#26).
    """
    for candidate in (sender_name, subject):
        m = re.match(r"^\s*TLDR\b(.*)$", candidate or "", re.IGNORECASE)
        if not m:
            continue
        remainder = _DATE_TAIL_RE.split(m.group(1))[0]
        slug = re.sub(r"[^a-z0-9]", "", remainder.lower())
        return _KNOWN_EDITIONS.get(slug, slug or "tldr")
    return "tldr"


def _classify(blocks: list[_Block]) -> tuple[list[RawSection], str | None]:
    """State machine over the flattened block stream -> (sections, subtitle)."""
    sections: list[RawSection] = []
    current_section: RawSection | None = None
    current_article: RawArticle | None = None
    subtitle: str | None = None
    skipping_sponsor = False

    for block in blocks:
        if _is_footer(block.text):
            if sections:
                break  # footer boilerplate never bleeds into the last summary
            continue  # top nav ("Unsubscribe"-adjacent links) before any section

        if _TOGETHER_WITH_RE.match(block.text):
            skipping_sponsor = True  # masthead ad slot: swallow until header/real title
            current_article = None
            continue

        if _is_section_header(block):
            current_section = RawSection(category_label=_strip_emoji(block.text), articles=[])
            sections.append(current_section)
            current_article = None
            skipping_sponsor = False
            continue

        suffix = _title_suffix(block.text) if block.href else None
        # Generic labels need corroboration (bold or short) so a summary paragraph that
        # happens to end in a parenthetical never becomes an article; minute-read is
        # specific enough on its own.
        if suffix and suffix[1] is None and not (block.emphasized or len(block.text) <= 120):
            suffix = None
        if suffix:
            title, minutes, label = suffix
            if label is not None and label.lower() == "sponsor":
                skipping_sponsor = True  # drop the item and its pitch paragraphs
                current_article = None
                continue
            skipping_sponsor = False
            current_article = RawArticle(
                title=title, summary="", raw_url=block.href, read_minutes=minutes
            )
            if current_section is None:  # tolerate a title before any header
                current_section = RawSection(category_label="News", articles=[])
                sections.append(current_section)
            current_section.articles.append(current_article)
            continue

        if skipping_sponsor:
            continue

        if current_article is not None:
            current_article.summary = (
                f"{current_article.summary}\n\n{block.text}"
                if current_article.summary
                else block.text
            )
        elif (
            subtitle is None
            and current_section is None
            and block.href is None
            and not _MASTHEAD_RE.match(block.text)
        ):
            subtitle = block.text  # the dek under the masthead

    return [s for s in sections if s.articles], subtitle


# --- public API ----------------------------------------------------------------------


def parse_html(
    html: str,
    *,
    sender: str,
    subject: str,
    published_at: date,
    source_ref: str,
) -> RawIssue:
    """Parse one TLDR HTML body (headers already extracted) into a ``RawIssue``."""
    extractor = _BlockExtractor()
    extractor.feed(html)
    extractor.close()
    sections, subtitle = _classify(extractor.blocks)
    return RawIssue(
        edition_key=_derive_edition_key(sender, subject),
        published_at=published_at,
        subject=subject,
        subtitle=subtitle,
        source_kind="gmail",
        source_ref=source_ref,
        sections=sections,
    )


def _html_body(msg: EmailMessage) -> str:
    body = msg.get_body(preferencelist=("html",))
    if body is None:
        raise ValueError("message has no text/html body part")
    return body.get_content()


def parse_eml(path: str | Path) -> RawIssue:
    """Parse one TLDR ``.eml`` file into a ``RawIssue`` (source_ref = filename stem)."""
    path = Path(path)
    with path.open("rb") as fh:
        msg = BytesParser(policy=policy.default).parse(fh)
    date_header = msg["Date"]
    if not date_header:
        raise ValueError(f"{path.name}: missing Date header (the reliable date source)")
    try:
        published_at = parsedate_to_datetime(date_header).date()
    except ValueError as exc:
        raise ValueError(f"{path.name}: unparseable Date header {date_header!r}") from exc
    sender_name = parseaddr(str(msg["From"] or ""))[0]
    return parse_html(
        _html_body(msg),
        sender=sender_name,
        subject=str(msg["Subject"] or ""),
        published_at=published_at,
        source_ref=path.stem,
    )
