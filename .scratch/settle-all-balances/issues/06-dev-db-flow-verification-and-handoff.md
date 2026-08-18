# 06 — Dev DB flow verification and handoff

**What to build:** The complete settlement flow is verified against the Dev Supabase database and the repository is ready for implementation handoff.

**Blocked by:** 04 — Unified Settle Up experience; 05 — Group-only isolation and regression verification.

**Status:** ready-for-agent

- [ ] Dev DB migrations apply cleanly without touching production.
- [ ] Full-net, partial, zero-net, Group-only, reversal, and retry flows are exercised against realistic Dev data.
- [ ] Both users and other Group members see the expected shared history and permissions.
- [ ] Light/dark and accessibility states are manually checked for the affected flows.
- [ ] Focused tests, lint, Supabase typecheck, and precommit checks pass, with unrelated failures documented.
- [ ] CHANGELOG and implementation handoff accurately describe the delivered behavior.
