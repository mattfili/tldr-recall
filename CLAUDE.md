## Agent skills

### Developing this repo

Invoke the **develop-recall** skill (`.claude/skills/develop-recall/`) before building features, fixing bugs, swapping a provider/backend, or deploying — it carries the hard invariants, per-package gates, the swappable seams, and the testing conventions. The domain language in `CONTEXT.md` and the ADRs in `docs/adr/` are authoritative over the original spec.

### Issue tracker

GitHub Issues (via `gh`) is the canonical tracker for shareable work; `.scratch/<feature>/` holds local working notes, drafts, and in-progress PRDs. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context (one `CONTEXT.md` + `docs/adr/` at the repo root). See `docs/agents/domain.md`.
