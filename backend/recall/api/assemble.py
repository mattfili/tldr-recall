"""Assemble the ``Content`` response from repository results (spec §9, ADR-0001).

This module turns ORM rows (already loaded by the repositories — it never opens a Session or
queries the ORM itself) into the flat-primary-appearance-plus-provenance ``Content`` schema.

PRIMARY APPEARANCE = earliest by (issue.published_at, then position). The appearance list this
module receives is expected to already be ordered earliest-first (the appearances repository
sorts that way), so ``appearances[0]`` is primary; we still sort defensively here.
"""

from __future__ import annotations

import uuid

from recall.models import Content as ContentModel
from recall.models import ContentAppearance, UserContentState
from recall.schemas.common import (
    Appearance,
    CategoryRef,
    Content,
    EditionRef,
    IssueRef,
)


def _category_ref(appearance: ContentAppearance) -> CategoryRef | None:
    cat = appearance.category
    if cat is None:
        return None
    return CategoryRef(slug=cat.slug, label=cat.label, hue=cat.hue)


def _edition_ref(appearance: ContentAppearance) -> EditionRef:
    edition = appearance.issue.edition
    return EditionRef(key=edition.key, name=edition.name)


def _issue_ref(appearance: ContentAppearance) -> IssueRef:
    issue = appearance.issue
    return IssueRef(
        id=issue.id,
        issue_number=issue.issue_number,
        published_at=issue.published_at,
    )


def _appearance_schema(appearance: ContentAppearance) -> Appearance:
    return Appearance(
        issue=_issue_ref(appearance),
        edition=_edition_ref(appearance),
        category=_category_ref(appearance),
        position=appearance.position,
    )


def build_content(
    content: ContentModel,
    appearances: list[ContentAppearance],
    state: UserContentState | None,
) -> Content:
    """Build one ``Content`` from its row, all its appearances, and the reader's state.

    ``appearances`` must contain at least one row (every Content has at least one sighting).
    Primary appearance = earliest by (issue.published_at, position); we sort defensively so the
    caller need not pre-sort. ``state`` None -> starred=False / read_state='unread'.
    """
    ordered = sorted(
        appearances,
        key=lambda ap: (ap.issue.published_at, ap.position),
    )
    primary = ordered[0]

    return Content(
        id=content.id,
        title=content.title,
        summary=content.summary,
        content_type=str(content.content_type),
        read_minutes=content.read_minutes,
        url=content.url,
        domain=content.domain,
        tags=list(content.tags),
        resources=content.resources,
        edition=_edition_ref(primary),
        category=_category_ref(primary),
        issue=_issue_ref(primary),
        appearances=[_appearance_schema(ap) for ap in ordered],
        starred=bool(state.starred) if state is not None else False,
        read_state=str(state.read_state) if state is not None else "unread",
    )


def build_content_for_issue(
    appearance: ContentAppearance,
    all_appearances_by_content: dict[uuid.UUID, list[ContentAppearance]],
    state: UserContentState | None,
) -> Content:
    """Build the ``Content`` shown under an issue section.

    The flat ``edition``/``category``/``issue`` fields still report the PRIMARY appearance
    (ADR-0001 — Content carries its primary provenance regardless of where it is rendered);
    ``all_appearances_by_content[content_id]`` supplies the full provenance. On the seed every
    Content has exactly one appearance, so primary == the in-issue sighting.
    """
    content = appearance.content
    provenance = all_appearances_by_content.get(content.id) or [appearance]
    return build_content(content, provenance, state)
