# Read/unread is per-Issue, not per-Content

Read state was originally modelled on Content (`CONTEXT.md` "Read state"; `user_content_state.read_state`; a planned `PATCH /content/{id}/read` toggle). We're moving it: **read/unread is a per-`(reader, Issue)` fact only — Content has no read state.** A newsletter is skimmed, not triaged article-by-article, so a manual per-article "mark read" toggle is the wrong pattern; and an auto "opened" signal (click-through) doesn't mean "read" and can't rely on scroll. The low-friction, genuinely useful signal is "have I been through this Issue" — for catching up on missed issues and as a business metric — surfaced on the edition rail + issue nav, auto-marked when the reader views an Issue. Per-article **Engagement** (opens/shares) stays valuable but is **analytics-only** (PostHog), not stored product state and not a search/filter dimension.

## Considered options

- **Auto-on-open "opened" flag on Content (rejected).** Keeps a content-level "unread" filter/search alive cheaply, but "opened" ≠ "read", readers don't act on per-article read state, and it re-introduces the article-level concept we're removing.
- **Manual per-article read toggle (rejected).** A messenger/email pattern that doesn't fit how TLDR is consumed.

## Consequences

- **Schema:** `user_content_state` reduces to `starred` (drop `read_state`); add `user_issue_state(user_id, issue_id, read_state, updated_at)` unique `(user_id, issue_id)`, auto-marked read on issue view. Both are follow-up Alembic migrations + a seed update — content read seeding goes away (`user_content_state` rows become starred-only, ~14 on the seed; was 19), and issue-read starts empty (data.js has no per-issue read data).
- **#4 Library:** drop the content `read_state` filter; `type`/`edition`/`category`/`starred` remain. An Issue-read filter may come later.
- **#5:** drop `PATCH /content/{id}/read` and the per-article read-toggle UI; add issue-read writes (mark-on-view). Star (save) is unaffected and stays manual.
- **#7 Search:** drop the "haven't read"/"unread" **content** intent cue and the "substacks I haven't read" content query; if revisited, "unread" maps to Issue level. Type routing, negation, edition/starred cues, and FTS+vector+RRF are unaffected.
