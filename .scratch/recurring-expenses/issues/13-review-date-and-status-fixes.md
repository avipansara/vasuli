# 13 Review date and status fixes

Status: ready
Implementation: resolved
Blocked by: 09, 10
Claimed at: 2026-09-30T02:16:25.182240+00:00
Worker: /root/review_fixes
Requested model: gpt-6-luna (high)
Review rounds: 2

## Scope

Fix the two accepted review findings: recurring expense displayed calendar dates across viewer time zones and duplicated semantic status-color mapping.

## Acceptance criteria

- [x] Posted occurrence displays its effective calendar date consistently across time zones in detail, friend/group lists, date ranges and exports.
- [x] Intentional historical date edits remain supported, preserve scheduled identity/template, and amount-only edits do not change dates. Ordinary expense and activity creation timestamps retain current semantics.
- [x] Existing occurrence backfill preserves historical date edits rather than blindly replacing them with scheduled dates.
- [x] List/detail share one semantic status-color mapping with identical light/dark behavior.
- [x] Focused regression tests and full repository checks pass; source scope and Git state preserved.

## Checks

Focused calendar-date, mapper, service and edit persistence regressions. Any migration regression runs against isolated local Supabase only. npm run precommit and application TypeScript.

## Review round 1

Primary migration and SQL fixture passed in isolated local DB. Add authorized non-owner payer RLS date edit coverage and observable client regression red evidence. No other code changes requested.

## Review round 2

Non-owner permission assertions pass, but the friend projection assertion runs before owner JWT restoration and fails for the intended friendship authorization boundary. Move restoration before projection assertion and rerun. Source implementation unchanged.

## Implementation evidence

Primary independently reviewed all changed areas and preserved source/Git baseline. GPT-6 Luna high /root/review_fixes, two correction rounds. Separate effective_date protects recurring calendar display; current historical date edits update timestamp plus calendar date, unchanged day omits both. Backfill recognizes saved-zone 09:00 originals and reconstructs other old edits in rule zone because previous editor did not retain viewer zone. Shared semantic status helper used by both recurring screens.

Independent verification: precommit 111 files / 892 tests passed, lint zero errors with existing warnings; app/Supabase TypeScript pass; Honolulu and Kiritimati display/edit/CSV 6 tests each and date-range regressions pass. Existing schema/command/posting/delivery/lifecycle SQL and new effective-date regression all pass against isolated supabase_db_vasuli-recurring-ui-check only. New regression verifies actual posting, stable amount-only edits, historical date edits, authorized non-owner payer with rule hidden by RLS, ordinary null metadata and friend projection. Existing Internet row backfill remains Sep29. Pre-fix client range/CSV red reproduced from copied HEAD source outside checkout. iPhone18Pro/iOS27 release build succeeded and installed; settled light detail shows Sep29 independently of audit timestamp. Fresh dark native check unavailable: Android device absent; iOS app retained its light preference despite system appearance change. No visual styles changed; semantic mapping retains original theme inputs. Full keyboard/E2E coverage remains the previously recorded limitation.

Evidence logs /private/tmp/vasuli-recurring-fix13-{precommit,app-tsc,migration,sql-final,posting,schema,command,delivery,lifecycle,ios-build}.log. iOS screenshot /private/tmp/vasuli-recurring-fix13-ios-light.png. Branch HEAD and staging unchanged; user work preserved. No later tickets runnable; all tickets resolved.
