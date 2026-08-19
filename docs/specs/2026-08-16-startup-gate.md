# Shorten the startup gate

## Status update — 2026-08-19

Implemented in the current application. The root layout uses the
post-splash startup service to deduplicate and prefetch the initial home query
while preserving the existing splash experience. Focused tests cover successful,
deduplicated, and failed prefetch behavior; device-level startup measurement
remains an operational verification task.

## Problem Statement

When a returning user opens Vasuli, the intended splash screen takes about three seconds and should remain. The problem starts after the splash disappears: it can take another approximately five seconds before Friends or Groups data appears.

Auth initialization can perform a persisted-session lookup, a profile lookup by email, and then a profile link/update or create operation. Only after that gate does protected navigation proceed, and only then can the Friends or Groups read path begin.

The result is a long post-splash blank/loading period. The splash is not the thing to replace; the post-splash path to authenticated profile readiness and the first home data render is too slow.

## Solution

Keep the existing native and animated splash experience unchanged. Introduce a single post-splash readiness policy that separates:

- Splash/visual readiness
- Session/profile readiness after the splash
- App-profile hydration
- Protected-route navigation

After the splash completes, the app should show the authenticated shell immediately with a stable loading state, begin or continue profile reconciliation without redundant work, and render Friends or Groups as soon as the app profile and first home data are ready. The splash duration, artwork, handoff, and visual identity should not be replaced or shortened as part of this task.

While the splash is still visible, startup should use the available time to resolve the persisted session, hydrate the app profile, and prefetch the initial home query into the existing TanStack Query cache. The first visible route should consume that warmed cache rather than starting the same request again after the splash.

A returning authenticated user should see the app shell immediately after the splash and receive the first useful home data promptly. Auth correctness, invite routes, OAuth callbacks, sign-out behavior, and error handling must remain intact.

The change should preserve a single high-level seam: a post-splash readiness policy consumed by the root layout. Auth/profile reconciliation and first-home-data timing remain behind that policy rather than leaking timing decisions into individual routes.

## User Stories

1. As a returning Vasuli user, I want the existing splash experience to complete normally, so that the app retains its intended brand and handoff.
2. As a returning authenticated user, I want Friends or Groups data to begin appearing immediately after the splash, so that I do not experience another unexplained five-second wait.
3. As a user with a slow network connection, I want to see a stable loading state while my profile is reconciled, so that I understand the app is working.
4. As a user with no active session, I want the existing splash to complete and then reach the sign-in screen promptly, so that an expired session does not leave me in a post-splash loading state.
5. As a user whose session is valid but whose app profile needs linking, I want the profile reconciliation to complete safely in the background, so that existing account identity and data remain correct.
6. As a user launching the app offline with a persisted session, I want the app to show its post-splash shell and cached state while network work retries.
7. As a user whose session restoration fails, I want the app to fall back to the unauthenticated state with a clear retry or sign-in path, so that a transient startup failure does not create an indefinite blank screen.
8. As a user opening an invitation deep link, I want the invite route to remain reachable during startup, so that the new readiness policy does not break invitation handling.
9. As a user returning from OAuth, I want the callback route to remain owned by the auth flow, so that startup routing does not interfere with code exchange or session completion.
10. As a signed-in user, I want sign-out to clear the authenticated shell immediately, so that private data is not left visible after logout.
11. As a user, I want the existing splash transition to happen at most once per launch, so that root layout changes do not restart it or cause visible flicker.
12. As a user, I want the first meaningful screen to remain visually consistent with the existing Vasuli theme, so that faster startup does not feel like a broken or unfinished screen.
13. As a user, I want loading indicators to occupy the same layout regions as the eventual content, so that the screen does not jump when Friends or Groups data arrives.
14. As a user, I want startup errors to be actionable and non-blocking where possible, so that profile or network problems do not prevent me from retrying.
15. As a user, I want notification initialization to remain deferred until the app is usable, so that permission prompts do not compete with startup rendering.
16. As a user, I want deep links and protected-route redirects to settle deterministically, so that I do not see an incorrect tab before being routed to the intended screen.
17. As a user, I want the app to preserve the existing auth/profile data contract, so that faster startup does not create duplicate profiles or unlink an existing profile.
18. As a user, I want subsequent launches to benefit from the query cache and any safe profile state already available, so that the improvement is not limited to a single cold-start path.
19. As a maintainer, I want startup timing decisions in one module, so that future changes do not require coordinating unrelated route components.
20. As a maintainer, I want tests to cover the startup policy through its highest-level interface, so that auth, routing, and splash regressions are caught without brittle animation assertions.

## Implementation Decisions

- Build or deepen one post-splash readiness module/policy consumed by the root navigation layer.
- Model post-splash readiness as distinct states rather than one boolean loading flag:
  - Splash/visual readiness complete
  - Session unknown
  - Unauthenticated
  - Authenticated with profile pending
  - Authenticated and profile ready
  - First home data pending
  - First home data ready
  - Startup failure/retry
- Preserve the full existing animated splash sequence, duration, artwork, and handoff. Do not replace, shorten, or redesign the splash as part of this task.
- Remove redundant post-splash waiting between splash completion, profile readiness, route visibility, and the first home query where safe.
- Once the app profile is known and the splash is still active, prefetch the initial home data using the exact query key and query function consumed by the visible home route.
- Prefer prefetching the initial/default route rather than every tab. Additional tab data may be prefetched after first paint or on demand.
- Make the prefetch deduplicated and cache-aware so the visible route does not issue a second identical request after the splash.
- Treat prefetch failure as non-fatal: the route must retain its existing loading/error/retry behavior and must not leave startup blocked.
- Treat the persisted Supabase session lookup as the earliest authentication signal available to the app.
- Keep app-profile reconciliation behind the post-splash readiness policy. The policy owns when profile hydration is required for protected data routes and how its loading/error state is presented.
- Preserve the existing profile-linking behavior for legacy profiles and newly created profiles. Do not remove the auth-user-to-app-profile reconciliation safety requirement.
- Ensure the authenticated shell cannot expose private data before an app profile is available. During profile hydration, show a stable authenticated loading shell or route-level loading state rather than redirecting to sign-in.
- Keep invitation routes and OAuth callback routes as explicit routing exceptions in the readiness policy.
- Keep notification permission/registration initialization after the first meaningful navigation state, not as a prerequisite for startup readiness.
- Keep the existing QueryClient provider and cache semantics. This spec does not introduce a new data-fetching library or replace the current query cache.
- Preserve current theme, native splash, animated splash, splash duration, splash artwork, handoff, and route error-boundary behavior.
- Prefer an injectable clock/timing seam or deterministic readiness transitions over tests that depend on real animation durations.
- Add lightweight startup instrumentation for phase timestamps:
  - Native/React handoff
  - Session signal
  - Profile ready
  - Route visible
  - First home data visible
- Instrumentation should be actionable and removable or disableable for production policy.
- Define success as:
  - The existing splash remains unchanged.
  - The authenticated shell and its stable loading state are visible immediately after splash completion.
  - The first home data render uses prefetched data when available and does not incur avoidable additional waiting.
  - No startup path is left waiting indefinitely.
- Establish a baseline and verify the change on a development build or equivalent target runtime. Measure the existing approximately three-second splash separately from the approximately five-second post-splash delay, with timestamps for splash complete, session signal, profile ready, route visible, query started, and first home data visible.
- Do not redesign the Friends or Groups read models in this task. Their query waterfalls are the next performance seam and may be addressed separately after this startup gate is removed.

## Testing Decisions

Tests should assert externally observable readiness and routing behavior, not implementation details such as exact React effect order or animation internals.

Test the following behaviors:

- The existing splash completes with its current behavior and is not restarted.
- A persisted authenticated session exposes the authenticated shell immediately after splash completion.
- An unauthenticated session routes to the auth flow promptly after splash completion.
- Once the app profile is available during the splash, the initial home query is prefetched into the shared query cache.
- The visible home route consumes the prefetched result without issuing a duplicate request.
- A failed prefetch does not block navigation and the route can load or retry normally.
- Authenticated profile hydration shows a stable loading state and then transitions to the protected shell when the app profile becomes available.
- Profile hydration failure exposes a retryable startup error and does not incorrectly mark the user as unauthenticated.
- A missing or expired session routes to sign-in and does not expose protected content.
- Invite routes remain allowed while auth/profile readiness is unresolved.
- OAuth callback routes are not hijacked by the general protected-route policy.
- Sign-out clears the authenticated readiness state and private user data is no longer rendered.
- The readiness transition is idempotent and does not restart or regress after completion.
- Notification initialization is not required for post-splash shell or first-home-data readiness.
- Existing profile reconciliation behavior remains covered, including:
  - Existing profile linking
  - New profile creation
  - Already-linked profiles
  - Mismatched identity behavior

Additional testing decisions:

- Add a focused startup policy test module at the highest available seam, following the repository’s existing Vitest service and pure-helper test style.
- Use controlled promises or injected phase signals to simulate slow session/profile work; do not use sleeps or assert real wall-clock animation duration.
- Add a development-build manual verification checklist covering:
  - Cold launch
  - Warm launch
  - Offline launch
  - Expired session
  - OAuth callback
  - Invitation deep link
  - Sign-out
- Use measured phase instrumentation to verify that the post-splash gap is reduced, the existing animation timing is unchanged, and profile/data work does not run more than once per launch.
- Verify cold, warm, slow-network, and offline behavior when prefetch is unavailable or incomplete.

## Out of Scope

- Rebuilding the Friends or Groups Supabase read paths into a single server-shaped read model.
- Changing database schema, RLS policies, Supabase Edge Functions, or authentication provider behavior.
- Replacing TanStack Query, Supabase, Expo Router, or the existing theme system.
- Replacing, shortening, retiming, or redesigning the splash artwork or overall visual identity.
- Removing authentication or displaying protected data before the app profile is safely resolved.
- Adding persistent local profile storage without a separate data-consistency decision.
- Optimizing every tab’s cold-start query or changing tab prefetch behavior.
- Changing notification permission copy or notification registration semantics.
- Broad navigation refactors unrelated to startup readiness.
- Committing, releasing, deploying, or submitting a build as part of this spec.

## Further Notes

The highest-value seam is the post-splash readiness policy at the root layout. It should absorb timing and state-transition complexity so the root layout remains a consumer of readiness rather than an orchestrator of auth, profile, query, and routing phases. The splash remains a fixed visual phase, not the optimization target.

The implementation should be evaluated with real startup traces. The target is not a shorter splash; it is a shorter path from splash completion to a trustworthy app shell and first useful home data.

The next likely performance task is to deepen the Friends and Groups home read models to remove sequential Supabase round trips.

## Tracker

- Project Hub task: `7041e604-40ac-4790-a425-64b106863cb5`
- Status: complete
- Priority: High
