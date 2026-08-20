# In-app app updates and release notes

## Status update — 2026-08-19

Implemented in the current application. The root layout consumes
one release coordinator, optional and mandatory update decisions are separated,
release notes are rendered in the shared prompt, and the policy, service, and
coordinator have focused tests. Store metadata and release operations remain
deployment concerns rather than unfinished application architecture.

## Problem Statement

Vasuli users currently have no clear in-app indication that a newer store version is available. They may miss important fixes, improvements, or release notes, and the team has no consistent way to distinguish an optional update from a version that is no longer supported.

## Solution

Introduce one app-level release/update coordinator consumed by the root layout. It checks remotely published release metadata, compares it with the installed app version, surfaces release notes, and offers the appropriate update action.

The coordinator supports store releases only. It opens the platform-specific App Store or Google Play listing, shows release notes, and presents a polished optional update modal for recommended updates or a blocking update gate for versions below the minimum supported version.

Release metadata is managed through Supabase so release notes and rollout policy can change without requiring another app build. The existing developer changelog remains the source for repository history; the release record is the user-facing source for in-app notes.

## User Stories

1. As a Vasuli user, I want to know when a newer app version is available, so that I can benefit from the latest fixes and improvements.
2. As a Vasuli user, I want to read concise release notes before updating, so that I understand what changed.
3. As a Vasuli user, I want the update prompt to identify the available version, so that the action is clear and trustworthy.
4. As a Vasuli user, I want to update through the correct store for my platform, so that I do not have to find Vasuli manually.
5. As a Vasuli user, I want to dismiss a recommended update, so that I can finish an urgent task before updating.
6. As a Vasuli user, I want a dismissed optional update to remain dismissed for that release during the current device session or configured reminder window, so that the prompt does not interrupt me repeatedly.
7. As a Vasuli user, I want a later release to prompt me again even if I dismissed an earlier one, so that I do not miss newer changes.
8. As a Vasuli user, I want a mandatory update prompt when my installed version is unsupported, so that I understand why I cannot continue using the current version.
9. As a Vasuli user, I want the mandatory update action to remain available if I return to the app after leaving it, so that I can complete the update flow.
10. As a Vasuli user, I want the app to remain usable when release metadata cannot be fetched, so that a temporary network problem does not block access to my expense data.
11. As an offline user, I want the app to use the last safely cached release decision when available, so that update behavior is stable without connectivity.
12. As a Vasuli user, I want update checks to happen on launch and when the app returns to the foreground, so that stale release information is refreshed without checking on every render.
13. As a Vasuli user, I want release notes to be readable on small screens, so that I can scan changes comfortably.
14. As a Vasuli user, I want the update prompt to respect the active light or dark theme, so that it feels like part of Vasuli.
15. As a Vasuli user, I want the prompt to respect safe areas and accessibility settings, so that its controls remain usable.
16. As a Vasuli user, I want update checks not to interrupt sign-in, OAuth callbacks, invitations, or an active expense workflow, so that important flows are not disrupted.
17. As a Vasuli user, I want the update action to open the correct store listing, so that I can install the complete reviewed app binary.
18. As a Vasuli user, I want the app to remain on its current version if the store cannot be opened, so that a failed update attempt does not damage my current session.
19. As a Vasuli user, I want an update failure to show a useful retry path, so that I can recover without reinstalling the app.
20. As a Vasuli user, I want the prompt to avoid appearing more than once for the same release in a single launch, so that it does not feel broken.
21. As a Vasuli user, I want the app to preserve my current navigation and data state when I choose to update later, so that dismissing the prompt has no side effects.
22. As a product owner, I want to publish release notes and update policy without shipping another client build, so that communication can be corrected quickly.
23. As a product owner, I want separate minimum and recommended versions, so that I can warn users before making an update mandatory.
24. As a product owner, I want platform-specific release records, so that iOS and Android can be updated independently when necessary.
25. As a product owner, I want to disable or retract a release notice, so that an incorrect or premature message can be removed safely.
26. As a product owner, I want every release to use the store distribution path, so that native and JavaScript changes follow one predictable release process.
27. As a maintainer, I want version comparison to handle semantic versions consistently, so that values such as 1.0.10 are not treated as older than 1.0.9.
28. As a maintainer, I want malformed or incomplete release records to fail closed to a non-blocking state, so that bad metadata cannot lock users out accidentally.
29. As a maintainer, I want the release coordinator behind one high-level seam, so that update policy does not leak into individual routes.
30. As a maintainer, I want update decisions and user actions to be observable, so that failed checks and update attempts can be diagnosed without logging sensitive data.
31. As a release manager, I want release notes to support ordered sections or bullets, so that fixes, improvements, and new features can be communicated clearly.
32. As a release manager, I want a release to have a stable identifier separate from its display version, so that repeated store builds do not show duplicate notices unintentionally.
33. As a release manager, I want to publish an update to a subset of users when appropriate, so that rollout risk can be managed before broad availability.
34. As a user with a slow connection, I want the prompt to appear only after metadata is available, so that startup is not held hostage by a slow release check.
35. As a user, I want update checks to be deduplicated, so that the app does not waste network requests during repeated focus or authentication events.

## Implementation Decisions

- Build one release/update coordinator at the application boundary and consume it from the root layout. The coordinator owns checking, version resolution, prompt eligibility, dismissal state, update action selection, and retry behavior.
- Keep UI rendering separate from policy decisions. The update modal or gate receives a resolved user-facing state and emits actions such as update, dismiss, retry, or close.
- Use the installed native user-facing version exposed by the existing Expo application dependency as the basis for store-version comparison. Build numbers remain diagnostic and do not determine user-facing release-note eligibility.
- Use semantic version comparison with normalization and validation. Invalid installed or remote versions must not cause a mandatory block.
- Add a Supabase release metadata contract with, at minimum:
  - Stable release identifier
  - Platform and optional channel/environment
  - Display version
  - Minimum supported version
  - Recommended/latest version
  - Platform-specific App Store or Google Play URL
  - Release-note title and ordered user-facing entries
  - Published/active status
  - Published timestamp and optional expiration/withdrawal state
- Protect release metadata with a read-only client access path. Administrative publishing is outside the mobile client and must not expose write privileges to users.
- Resolve the active record for the current platform and deployment channel. If no platform-specific record exists, a deliberately configured shared record may be used; accidental cross-platform fallback must not be inferred.
- Treat `minimum supported version` as a mandatory update threshold. Treat `recommended/latest version` as an optional update threshold. If the installed version is current, do not show the update modal.
- Allow a release record to be inactive or withdrawn. Inactive records must not produce new prompts, while an already-blocked minimum version should continue to use a valid replacement policy when one exists.
- Check on initial app readiness and on app foreground transitions, with a short deduplication/cooldown window. The check must not block authentication, navigation, the animated splash, or the first home query.
- Do not interrupt OAuth callback handling, invitation deep links, sign-in, or an active full-screen expense flow. Defer the optional modal until a stable app shell is visible. A mandatory gate may take precedence only after the app has enough state to present a recoverable update action.
- Store dismissal state locally by stable release identifier, not only by display version. A later release must be eligible to show independently.
- For store releases, open the configured platform store URL using the existing linking/browser conventions. Do not attempt to synthesize store URLs from incomplete metadata.
- Do not use EAS Update as part of this feature. All user-facing releases, including JavaScript and styling changes, are distributed through a new store build.
- The release record must include a valid platform-specific store URL. Missing or malformed store links make the record ineligible for an update action rather than producing a guessed URL.
- Use an optional update modal for recommended releases with Update now and Later actions. Use a non-dismissible update gate for unsupported versions with Update now and a retry/fallback action when appropriate.
- Preserve the existing visual language, theme, safe-area behavior, typography, error boundaries, and accessibility conventions. Add stable test identifiers to the update controls.
- Keep release notes concise in the modal and support a scrollable detail presentation if the record contains more entries than fit comfortably in the modal.
- Make metadata fetch failures non-blocking for optional updates. A mandatory block must require a previously trusted cached policy or a successfully fetched valid policy; a transient fetch failure alone must never lock out a supported user.
- Cache the last valid release decision with its retrieval timestamp and platform/channel scope. Do not cache malformed or untrusted records as a mandatory policy.
- Add low-noise diagnostics for check started, check skipped/deduplicated, valid release found, prompt shown, dismissed, store action attempted, and store-link failure. Exclude access tokens, personal expense data, and release-management credentials.
- Add an administrative publishing workflow or documented Supabase migration/seed contract for creating and updating release records. The mobile feature must not depend on editing repository changelog text at runtime.
- Keep the repository changelog updated for this feature according to project release conventions, but do not use it as the app’s runtime data source.
- Define success as: users see a trustworthy store-update prompt with notes when a valid release applies; unsupported versions are guided to update; supported users remain unblocked through transient metadata failures; and every update follows the platform store path.

## Testing Decisions

Tests should assert externally observable release/update behavior rather than React effect order, exact request timing, modal implementation details, or Expo internals.

Test the single release/update coordinator seam with controlled release metadata and user actions. Cover:

- Current version produces no prompt.
- A newer recommended version produces an optional prompt with the correct version and release-note entries.
- Dismissing an optional release suppresses that release according to the configured dismissal policy.
- A different release identifier prompts again after an earlier release was dismissed.
- An installed version below the minimum supported version produces a non-dismissible mandatory state.
- A transient metadata failure does not block a supported user.
- A valid cached optional decision can be used when the network is unavailable.
- An invalid or incomplete cached mandatory policy cannot lock out a user.
- Platform-specific records select the correct iOS or Android release.
- Channel-specific records do not leak preview metadata into production.
- Store delivery emits the correct platform-specific store action.
- Store-link failure preserves the current app and exposes retry behavior.
- Duplicate launch/foreground checks are deduplicated.
- Checks do not prevent auth, invitation, OAuth, or expense navigation from becoming usable.
- The optional prompt is deferred until a stable app shell is available.
- The mandatory gate remains recoverable after a failed store-link attempt.
- Release notes render in order, remain readable in both themes, and remain accessible with long content.
- Update actions have stable test identifiers and are reachable through the expected accessibility semantics.
- Release decisions remain stable across repeated renders and app foreground events.
- Semantic versions compare correctly for patch, minor, major, and multi-digit components.
- Malformed versions fail safely without producing a mandatory update.

Add focused pure-helper tests for semantic-version normalization/comparison and release-record validation, following the repository’s existing `lib` and service Vitest conventions. Add coordinator tests at the highest available seam, following the existing startup, service, and user-visible component testing patterns. Use controlled promises and injected update/check dependencies rather than sleeps, network calls, real store launches, or real Expo update downloads.

Add a development-build manual verification checklist for cold launch, warm launch, foreground resume, offline launch, optional store update, mandatory update, failed store-link attempt, both themes, long release notes, invitation deep link, OAuth callback, and an active expense workflow.

## Out of Scope

- Replacing Expo Router, Supabase, TanStack Query, or the existing authentication system.
- Building a release-management dashboard in the mobile app.
- Automatically submitting builds to the App Store or Google Play.
- Implementing a custom in-app Android update download flow or an iOS equivalent native update mechanism.
- Forcing an update based solely on a failed network request.
- Replacing the existing animated splash or delaying startup until the release check completes.
- Rewriting the repository changelog system.
- Adding push notifications specifically for release announcements.
- Tracking individual user identities or expense data as part of update analytics.
- Redesigning unrelated modals, navigation, startup readiness, or home read models.
- Implementing an in-app binary download or installation flow.
- Publishing or submitting a production release as part of implementing this feature.

## Further Notes

The current app includes Expo Updates, but this feature deliberately does not use OTA delivery. Every user-facing release follows the existing EAS build and store submission process, which makes the release model easier to reason about and avoids deciding whether a change is safe to deliver outside the stores.

The release coordinator should remain a narrow policy seam at the root layout. Individual screens should not fetch release metadata or implement their own version comparisons. This keeps prompting consistent and makes the behavior testable without coupling tests to route internals.

The initial implementation can use one active release per platform/channel. Rollouts, richer analytics, and multiple concurrent release campaigns can be added later if the deployment process requires them.

## Tracker

- Project: Vasuli
- Project Hub task: `86e44a14-2fa3-466a-b4b8-1025e178dfc0`
- Status: complete
