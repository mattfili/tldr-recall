# Issue tracker: GitHub + local markdown

This repo uses two tracks:

- **GitHub Issues (canonical)** — anything that should be visible, shareable, or picked up by an AFK agent. Use the `gh` CLI for all operations.
- **Local markdown (`.scratch/`)** — working notes, drafts, and in-progress PRDs that aren't ready to be public issues yet.

## GitHub conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone (`github.com/mattfili/tldr-recall`).

## Local markdown conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The PRD is `.scratch/<feature-slug>/PRD.md`
- Implementation issues are `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Default to a GitHub issue (`gh issue create`). Use `.scratch/<feature-slug>/` only for drafts not yet ready to share, then promote to a GitHub issue when ready.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`, or read the file at the referenced `.scratch/` path if one was given. The user will normally pass the number or path directly.
