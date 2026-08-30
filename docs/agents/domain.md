# Domain docs

How engineering skills consume this repository's domain documentation.

## Before exploring

Read these files when they exist:

- `CONTEXT.md` at the repository root
- `CONTEXT-MAP.md` if the project later adopts multiple contexts
- Relevant decisions under `docs/adr/`

Proceed silently when a file does not exist. Domain-modeling work creates
documentation when terms or decisions need to be recorded.

## Layout

This repository uses a single-context layout:

- `CONTEXT.md` contains the domain glossary and model
- `docs/adr/` contains architecture decisions

## Vocabulary

Use terms defined in `CONTEXT.md` in tickets, specifications, test names, and
implementation proposals. Do not substitute competing terms for established
domain concepts.

## ADR conflicts

Call out any proposal that conflicts with an existing ADR instead of silently
overriding the decision.
