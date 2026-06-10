"""Parser tests (§6.3, issue #22): synthetic TLDR-shaped .eml + local-only golden corpus.

No network anywhere. ``*.eml`` is gitignored repo-wide, so the synthetic fixture is built
IN TEST CODE at runtime (``email.message.EmailMessage`` with an HTML body) and written to
``tmp_path`` only. The golden half iterates the real export dir and skips cleanly when
the corpus is absent (CI, or an operator who has not run the dump yet).
"""

from __future__ import annotations

import json
import re
from datetime import date
from email.message import EmailMessage
from pathlib import Path

import pytest

from recall.ingestion.base import RawIssue
from recall.ingestion.parser import parse_eml
from recall.jobs.cli import main as cli_main
from recall.jobs.gmail_dump import default_export_dir

# --- synthetic fixture (runs everywhere, incl. CI) ------------------------------------

TRACKING_A = "https://tracking.tldrnewsletter.com/CL0/https%3A%2F%2Fexample.com%2Frobots/1/abc"
TRACKING_REPO = "https://tracking.tldrnewsletter.com/CL0/https%3A%2F%2Fgithub.com%2Fq/2/def"
TRACKING_SPONSOR = "https://sponsor.example.com/click?campaign=adthing"

SYNTHETIC_HTML = f"""\
<html><head><style>td {{ padding: 0; }}</style></head><body>
<table><tr><td>
  <a href="https://tldr.tech/signup">Sign Up</a> |
  <a href="https://tldr.tech/advertise">Advertise</a> |
  <a href="https://a.tldrnewsletter.com/web">View Online</a>
</td></tr></table>
<table><tr><td><strong>TLDR AI 2026-06-08</strong></td></tr>
<tr><td>Your daily dose of agents, models, and lab gossip.</td></tr>
<tr><td><span>TOGETHER WITH</span> <a href="{TRACKING_SPONSOR}">SponsorCo</a></td></tr>
<tr><td>SponsorCo ships pipelines faster. Book a demo today!</td></tr></table>
<table><tr><td><strong>🚀 Headlines &amp; Launches</strong></td></tr>
<tr><td><a href="{TRACKING_A}"><strong>Robots Learn To Dream (5 minute read)</strong></a></td></tr>
<tr><td>Researchers taught warehouse robots to replay trajectories overnight.</td></tr>
<tr><td>The replay buffer doubles as a planning oracle, cutting failures in half.</td></tr>
<tr><td><a href="{TRACKING_SPONSOR}"><strong>AdThing Grows Your Pipeline (Sponsor)</strong></a>
</td></tr>
<tr><td>AdThing pitch paragraph that must never reach the Library.</td></tr></table>
<table><tr><td><strong>Quantum Gardening</strong></td></tr>
<tr><td><a href="{TRACKING_REPO}"><strong>qgarden (GitHub Repo)</strong></a></td></tr>
<tr><td>A toolkit for growing error-corrected qubits in your backyard.</td></tr></table>
<table><tr><td>Love TLDR? Refer friends and
  <a href="https://tldr.tech/referrals">track your referrals</a>.</td></tr>
<tr><td><a href="https://a.tldrnewsletter.com/unsub">Unsubscribe</a></td></tr></table>
</body></html>
"""


def _synthetic_eml(
    tmp_path: Path,
    from_: str = "TLDR AI <dan@tldrnewsletter.com>",
    name: str = "1976a2bc9d8e7f01.eml",
) -> Path:
    msg = EmailMessage()
    msg["From"] = from_
    msg["Subject"] = "Gemini's IMO gold 🥇, dreaming robots 🤖, quantum gardening 🌱"
    msg["Date"] = "Mon, 08 Jun 2026 10:30:00 -0400"
    msg["Message-ID"] = "<synthetic@tldrnewsletter.com>"
    msg.set_content("plain-text fallback body")
    msg.add_alternative(SYNTHETIC_HTML, subtype="html")
    path = tmp_path / name
    path.write_bytes(msg.as_bytes())
    return path


def test_synthetic_issue_headers_and_masthead(tmp_path):
    issue = parse_eml(_synthetic_eml(tmp_path))
    assert issue.edition_key == "ai"
    assert issue.published_at == date(2026, 6, 8)
    assert issue.subject.startswith("Gemini's IMO gold")
    assert issue.subtitle == "Your daily dose of agents, models, and lab gossip."
    assert issue.source_kind == "gmail"
    assert issue.source_ref == "1976a2bc9d8e7f01"


def test_synthetic_sections_and_articles(tmp_path):
    issue = parse_eml(_synthetic_eml(tmp_path))
    assert [s.category_label for s in issue.sections] == [
        "Headlines & Launches",  # emoji stripped, label preserved
        "Quantum Gardening",  # unknown section name passes through
    ]

    (article_a,) = issue.sections[0].articles  # sponsor item filtered out of section 1
    assert article_a.title == "Robots Learn To Dream"
    assert article_a.read_minutes == 5
    assert article_a.raw_url == TRACKING_A  # raw tracking href, verbatim, unresolved
    assert "replay trajectories overnight" in article_a.summary
    assert "planning oracle" in article_a.summary  # multi-paragraph summary joined

    (article_b,) = issue.sections[1].articles
    assert article_b.title == "qgarden"
    assert article_b.read_minutes is None  # "(GitHub Repo)" suffix, no read-time
    assert article_b.raw_url == TRACKING_REPO


def test_synthetic_sponsor_blocks_never_appear(tmp_path):
    issue = parse_eml(_synthetic_eml(tmp_path))
    dump = issue.model_dump_json()
    assert "(Sponsor)" not in dump
    assert "SponsorCo" not in dump  # Together-With slot + pitch paragraph skipped
    assert "AdThing" not in dump  # (Sponsor) item + pitch paragraph skipped
    assert "Together" not in dump


def test_synthetic_unknown_edition_derives_slug(tmp_path):
    path = _synthetic_eml(tmp_path, from_="TLDR Web Dev <dan@tldrnewsletter.com>")
    assert parse_eml(path).edition_key == "webdev"


def test_cli_parse_round_trips_raw_issue_json(tmp_path, capsys):
    path = _synthetic_eml(tmp_path)
    assert cli_main(["parse", str(path)]) == 0
    issue = RawIssue.model_validate(json.loads(capsys.readouterr().out))
    assert issue.source_ref == path.stem
    assert len(issue.sections) == 2


# --- golden corpus (local-only; structural invariants for ANY real TLDR email) --------


def test_golden_corpus_structural_invariants():
    export_dir = default_export_dir()
    files = sorted(export_dir.glob("*.eml")) if export_dir.is_dir() else []
    if not files:
        pytest.skip(f"no gmail export corpus at {export_dir} (run: uv run recall gmail-dump)")

    for path in files:
        issue = parse_eml(path)
        assert issue.source_kind == "gmail"
        assert issue.source_ref == path.stem
        assert re.fullmatch(r"[a-z0-9]+", issue.edition_key), path.name
        assert issue.published_at.year >= 2020, path.name
        assert issue.subject.strip(), path.name
        assert issue.sections, path.name
        for section in issue.sections:
            assert section.category_label.strip(), path.name
            assert section.articles, path.name  # empty sections are dropped
            for article in section.articles:
                assert article.title.strip(), path.name
                assert article.raw_url, path.name
                assert "(sponsor)" not in article.title.lower(), path.name
                assert "together with" not in article.title.lower(), path.name
                if article.read_minutes is not None:
                    assert article.read_minutes > 0, path.name
