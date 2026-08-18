# 02 — Home summary parity with relationship projection

**What to build:** Home Friend cards and Friend detail use the same relationship accounting rules, so the same Friend never shows conflicting totals or double-counts Group settlements.

**Blocked by:** 01 — Authoritative Friend relationship projection.

**Status:** completed

- [x] Home consumes a structured, currency-aware equivalent relationship adapter.
- [x] The `$1,449.12` versus `$981.62` regression fixture passes identically for Home and Friend detail.
- [x] Home handles Group membership scope and currency separation without aggregating incompatible currencies.
- [x] Home/detail parity is covered by an automated test at the agreed public seam.

**Verification:** Home now calls `get_friend_home_relationships()`, which returns the structured relationship contract and keeps the legacy scalar balance conservative for ambiguous currencies. The public Home mapper and Friend detail module are covered by the same `$1,449.12` / `$981.62` fixture. `npx supabase db lint --local` reports no schema errors; full runtime database characterization remains part of ticket 4's cross-surface verification.
