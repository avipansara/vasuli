# 09 Posted occurrence integration

Status: ready
Implementation: resolved
Blocked by: 06, 07, 08

## Scope

Connect posted occurrences to existing expense detail/edit, friend/group lists, and Activity. Preserve ordinary expense balance and deletion behavior.

## Acceptance criteria

- [x] Expense Detail identifies a posted occurrence and links affected participants to rule detail. Existing pencil edits only that expense; owner can reach future rule edits separately.
- [x] Changing amount/date/splits on an occurrence does not change its scheduled identity or rule template. Deleting it removes its balance effect but does not recreate it or stop future dates.
- [x] Friend/group/activity views show posted occurrences once and never include future rules in balances, settlement math, exports, or historical counts.
- [x] Activity distinguishes `Created automatically` while retaining the existing actor/history model. Notifications and cache refresh expose a new occurrence without app restart.
- [x] Light/dark and permission states work for owner, participant, and unrelated user.

## Checks

- Focused expense and balance tests named in the implementation report.
- `npm run lint`

## Expected areas

`app/expense-detail/[id].tsx`, `app/edit-expense/[id].tsx`, friend/group/activity presentation and read models.

## Comments

### Independent review of user-provided occurrence integration

Supplied detail/edit banners and activity badge are present. Remaining observed defects: future-edit shortcut checks expense creator/payer rather than current recurring-rule owner; changing an occurrence payer can expose an owner-only shortcut to a participant. Detail pencil still says Edit expense rather than Edit this expense for occurrences. Notification-link tests cover only ordinary notifications, not recurring routing. Management ticket 08 owns the scoped occurrence query/invalidation correction; verify this cache scope also refreshes from historical expense edits/deletes and foreground notifications. Full permissions and light/dark/native acceptance remains pending. Ticket remains unclaimed until its blockers resolve.

### Claim

Requested model: gpt-6-luna (high). Review rounds: 0. Scope: supplied occurrence integration, actual rule ownership, notification routes and boundary tests.

Worker: /root/occurrence_integration
Requested model: gpt-6-luna (high)

### Review round 1

Owner gate correctly uses actual rule owner; no Git state drift. Primary independently passed 4 focused files. Full spec still needs Repeats weekly/monthly text on occurrence detail. Extend existing notification routing test with paused/resumed notices and absent/malformed rule ID fallback. Same GPT-6 Luna worker to correct this narrow scope.

## Implementation evidence

Primary reviewed supplied occurrence integration and Luna corrections in detail/edit screens and notification routing. Exact recurring owner gate is separate from historical creator/payer authorization; absent rule data fails closed. Canonical user-scoped queries retain server participant/unrelated-user permissions. Existing expense mutation payload never writes recurring identity/template, SQL uniqueness survives deletion, and historical projections select posted expenses. Primary independently ran 4 focused files / 18 tests; worker app TypeScript/lint passed with 0 errors and 10 existing warnings. Primary reviewed semantic theme tokens and previously verified native theme layout; final integrated script/permission matrix remains ticket 10. Requested GPT-6 Luna high, worker /root/occurrence_integration, 1 correction round. Branch, HEAD and staging preserved.

### Reopened correction round 2: final integration layout

Android screenshot /private/tmp/vasuli-recurring-android-occurrence-dark.png proves Created automatically plus actor and timestamp overflow the history card. Scope only wrapping these metadata within card bounds without losing actor/date or changing semantics. Same Luna worker /root/occurrence_integration, prior acceptance/history retained. All other tickets resolved; no other writer active.

### Final independent acceptance

Round2 changes only occurrence detail metadata layout. Primary inspected final Android dark screenshot and rebuilt iPhone18Pro/iOS27 light screenshot: provenance, actor and full timestamp all fit within card. Exact recurrence/pencil/edit notice and actual owner shortcut verified in running Android client. Final iPhone build succeeded, installed and launched; /private/tmp/vasuli-recurring-ui-build-final.log. Final precommit: 110 files / 885 tests pass; app/Supabase TypeScript and lint pass, 10 warnings remain. Branch/HEAD/staging preserved; all tickets now resolved.
