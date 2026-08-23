# Issue tracker: Local Markdown

Issues and specs for this repo live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at
  `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Never combine multiple tickets into one file
- Triage state is recorded as a `Status:` line near the top of each issue file
- Ticket execution state is recorded separately as an `Implementation:` line:
  `unclaimed`, `claimed`, `blocked`, or `resolved`
- Claimed tickets record `Worker`, `Claimed at`, and `Review rounds` fields so a
  resumed task can reconstruct ownership and feedback state
- A feature may use `.scratch/<feature-slug>/implementation.lock` to prevent two
  shared-worktree implementation tasks from dispatching writers concurrently;
  acquire it with an atomic create that fails if the file already exists
- Performance efforts store raw and summarized run evidence under
  `.scratch/<feature-slug>/measurements/`, grouped by ticket
- Comments and conversation history append under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a file under `.scratch/<feature-slug>/`, creating the directory when
needed.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or
issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The map has one child file per ticket.

- Map: `.scratch/<effort>/map.md`
- Child ticket: `.scratch/<effort>/issues/NN-<slug>.md`
- Blocking: a `Blocked by: NN, NN` line near the top
- Frontier: open, unblocked, and unclaimed ticket files, ordered by number
- Claim: set `Status: claimed`
- Resolve: append the answer under `## Answer`, set `Status: resolved`, and
  update the map
