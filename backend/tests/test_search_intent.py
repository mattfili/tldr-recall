"""Intent-parser unit tests (#7, grilled scope 2026-06-09). Pure — no DB, no SDK.

Covers: strong/weak type cues, ALWAYS-HARD negation (typed vs topic), edition + starred cues,
intent-word + stopword stripping into cleaned_query, and the ADR-0002 invariant that there is NO
read/unread cue (such words survive as plain topic tokens).
"""

from __future__ import annotations

from recall.search.intent import Negation, parse

# ─────────────────────────── strong type cues -> hard filter ───────────────────────────


def test_github_and_repo_are_strong_repo_cues() -> None:
    for q in ["github repos about agents", "show me repos", "a repository for X"]:
        intent = parse(q)
        assert "repo" in intent.types_strong
        assert "repo" not in intent.types_weak


def test_paper_and_arxiv_are_strong_paper_cues() -> None:
    assert "paper" in parse("papers on retrieval").types_strong
    assert "paper" in parse("arxiv preprint about RAG").types_strong


# ─────────────────────────── weak type cues -> soft boost ───────────────────────────


def test_blog_substack_newsletter_are_weak_substack_cues() -> None:
    for q in ["blog posts about llms", "substacks on founders", "a newsletter about ai"]:
        intent = parse(q)
        assert "substack" in intent.types_weak
        assert "substack" not in intent.types_strong


def test_site_website_are_weak_website_cues() -> None:
    assert "website" in parse("a good website about agents").types_weak
    assert "website" in parse("sites covering search").types_weak


# ─────────────────────────── article(s) is a stopword, not a type cue ───────────────────────────


def test_article_is_a_stopword_not_a_type_cue() -> None:
    intent = parse("articles about agents")
    assert "article" not in intent.types_strong
    assert "article" not in intent.types_weak
    # 'articles' is stripped; only the topic remains.
    assert intent.cleaned_query == "agents"


# ─────────────────────────── negation is ALWAYS hard ───────────────────────────


def test_negated_type_cue_is_a_hard_type_exclude() -> None:
    intent = parse("agents but not papers")
    assert Negation(content_type="paper") in intent.negations
    # the negated token never re-enters the topic
    assert "paper" not in intent.cleaned_query
    assert "papers" not in intent.cleaned_query


def test_negated_weak_type_cue_is_also_a_hard_exclude() -> None:
    intent = parse("ai without substack")
    assert Negation(content_type="substack") in intent.negations


def test_negated_topic_term_is_a_hard_topic_exclude() -> None:
    intent = parse("agents non-anthropic")
    assert Negation(term="anthropic") in intent.negations
    assert "anthropic" not in intent.cleaned_query


def test_not_and_without_markers_both_negate() -> None:
    assert Negation(term="google") in parse("models not google").negations
    assert Negation(term="google") in parse("models without google").negations


def test_non_prefixed_word_is_not_a_negation() -> None:
    # "non" glued INTO a word (no hyphen/space) must NOT be read as negating its tail.
    intent = parse("nonprofit fundraising tools")
    assert intent.negations == []
    assert "profit" not in [n.term for n in intent.negations]
    assert "nonprofit" in intent.cleaned_query


# ─────────────────────────── edition + starred cues ───────────────────────────


def test_edition_key_cues() -> None:
    assert "founders" in parse("startups in tldr founders").editions
    assert "ai" in parse("things from tldr ai").editions
    # bare 'tldr' resolves the tldr edition
    assert "tldr" in parse("from the tldr edition").editions


def test_edition_display_phrase_consumed_not_left_as_topic() -> None:
    intent = parse("agents from tldr ai")
    assert "ai" in intent.editions
    # 'tldr' and 'ai' are consumed by the phrase, not left as topic tokens
    assert "tldr" not in intent.cleaned_query
    assert intent.cleaned_query == "agents"


def test_starred_and_saved_cues() -> None:
    assert parse("starred items about agents").starred is True
    assert parse("saved ipo stories").starred is True


# ─────────────────────────── cleaned_query stripping ───────────────────────────


def test_cleaned_query_strips_intent_words_and_stopwords() -> None:
    intent = parse("show me all github repos about agents")
    # 'show','me','all','about' stopwords; 'github','repos' type cues -> all stripped.
    assert intent.cleaned_query == "agents"


def test_cleaned_query_is_pure_topic_for_vector_arm() -> None:
    intent = parse("anthropic ipo")
    assert intent.cleaned_query == "anthropic ipo"


# ─────────────────────────── ADR-0002: NO read cue ───────────────────────────


def test_no_read_state_cue_words_survive_as_topic() -> None:
    # 'unread' / 'read' must NOT be recognized as a cue; they remain topic tokens.
    intent = parse("substacks I haven't read")
    assert "substack" in intent.types_weak
    # 'read' survives as a topic token (it is neither a cue nor a stopword).
    assert "read" in intent.cleaned_query.split()
    # there is no read_state concept anywhere on ParsedIntent
    assert not hasattr(intent, "read_state")


def test_unread_is_not_a_cue() -> None:
    intent = parse("unread agent papers")
    # 'unread' is just a topic word; only 'papers' (strong) and 'agent' topic remain meaningful.
    assert "paper" in intent.types_strong
    assert "unread" in intent.cleaned_query.split()
