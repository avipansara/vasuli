# PostHog product analytics and improvement loop

## Problem Statement

Vasuli currently has domain data and some user-facing group statistics, but it
does not have a consistent product analytics layer. The team cannot reliably
measure whether a new user reaches the core value of creating or joining a
group and recording an expense, where users abandon expense or settlement
flows, which releases introduce regressions, or whether improvements change
behavior over time.

The app also needs clear privacy boundaries because it handles shared expense
and settlement activity. Analytics must not leak personal or financial data,
contaminate production metrics with development events, or interfere with
authentication, navigation, expense creation, or settlement.

## Solution

Integrate PostHog's React Native SDK through the supported Expo integration and
route all product analytics through one application analytics boundary. Track
only authenticated users and emit a deliberately small event taxonomy for
activation, engagement, collaboration, expense friction, settlements, and
reliability.

Use the 24-hour first-expense activation rate as the primary success metric.
Use weekly active users and active groups with expenses as supporting health
metrics. Create four initial PostHog dashboard views and review them weekly.
Use PostHog Error Tracking and categorized reliability events without enabling
session replay initially.

The initial rollout is PostHog-first: do not build a separate Next.js or React
analytics dashboard until the metrics and review workflow have been proven.

## User Stories

1. As a new Vasuli user, I want my successful authentication to begin the
   activation journey, so that the team can understand whether onboarding leads
   to the core product value.
2. As a new Vasuli user, I want creating or joining a group to count as a
   meaningful activation step, so that the product can measure collaboration.
3. As a new Vasuli user, I want adding my first expense to complete activation,
   so that success represents actually using shared expense tracking.
4. As a product owner, I want to measure the percentage of new users who create
   or join a group and add their first expense within 24 hours of authentication,
   so that I can evaluate initial product value.
5. As a product owner, I want weekly active users, so that I can monitor
   recurring usage independently of new-user activation.
6. As a product owner, I want active groups with at least one expense in the
   last seven days, so that I can measure whether shared groups remain useful.
7. As a product owner, I want to compare activation by platform and app version,
   so that I can distinguish product friction from release-specific problems.
8. As a product owner, I want to compare engagement by group-size bucket, so
   that I can identify whether Vasuli works better for small or large groups.
9. As a product owner, I want to compare expense completion by input method, so
   that I can prioritize improvements to the most fragile entry path.
10. As a product owner, I want to know when invitations are sent and accepted,
    so that I can measure whether collaboration spreads beyond the initial user.
11. As a product owner, I want to know when settlements are started and
    completed, so that I can measure whether groups can resolve balances.
12. As a product owner, I want expense-form starts and successful expense
    creations, so that I can calculate expense completion and abandonment.
13. As a product owner, I want categorized expense-creation failures, so that I
    can investigate friction without collecting raw financial content.
14. As a Vasuli user, I want analytics collection to begin only after I am
    authenticated, so that pre-login behavior is not tracked initially.
15. As a Vasuli user, I want analytics to avoid collecting my name, email,
    expense description, exact amount, group ID, or user ID as event properties,
    so that shared financial activity is not exposed to product analytics.
16. As a Vasuli user, I want analytics failures to be invisible to me, so that a
    PostHog outage cannot block an expense, settlement, or navigation action.
17. As an offline Vasuli user, I want non-sensitive analytics to retry later or
    expire safely, so that temporary connectivity does not corrupt product
    behavior.
18. As a Vasuli user, I want the app to use the correct analytics environment,
    so that test activity is not mixed with production measurements.
19. As a product owner, I want preview events isolated from production, so that
    release testing does not distort activation or weekly-active-user metrics.
20. As a product owner, I want development builds to send no events by default,
    so that local testing remains safe and quiet.
21. As a product owner, I want every event to carry safe release context when
    available, so that a metric change can be tied to an app update or channel.
22. As a maintainer, I want screens and domain services to use one analytics
    interface, so that event names and privacy rules cannot drift across the app.
23. As a maintainer, I want the analytics boundary to become a no-op when
    configuration is absent, so that tests and local development remain stable.
24. As a maintainer, I want authentication identity changes to identify or reset
    analytics consistently, so that events are not attributed to the wrong user.
25. As a maintainer, I want analytics properties validated and filtered at one
    boundary, so that future event additions cannot accidentally send prohibited
    data.
26. As a maintainer, I want bounded local retry behavior, so that an offline
    queue cannot grow without limit or retain stale events indefinitely.
27. As a product owner, I want an activation funnel dashboard, so that I can
    locate the largest drop between authentication and first expense.
28. As a product owner, I want an engagement dashboard, so that I can track
    weekly active users and active groups with expenses.
29. As a product owner, I want a collaboration dashboard, so that I can compare
    invitations, accepted invitations, and settlement completion.
30. As a maintainer, I want a reliability dashboard, so that I can see expense,
    settlement, startup, API, notification, and deep-link failures.
31. As a product owner, I want to review the dashboards weekly against the
    previous seven-day period, so that decisions are based on a consistent
    cadence.
32. As a product owner, I want a 15–20% movement or a clear platform/version
    issue to trigger investigation, so that normal noise does not create random
    roadmap changes.
33. As a product owner, I want to choose one improvement hypothesis at a time,
    so that cause and effect remain understandable.
34. As a product owner, I want to recheck the relevant metric one to two weeks
    after shipping an improvement, so that changes can be evaluated.
35. As a privacy-conscious user, I want analytics collection and its purpose
    disclosed in Vasuli's privacy policy, so that I understand what aggregate
    product data is used for.
36. As a release owner, I want PostHog Error Tracking available for crash and
    error groups when needed, so that technical problems can be diagnosed.
37. As a privacy-conscious user, I want session replay disabled initially, so
    that screens containing financial activity are not recorded.
38. As a maintainer, I want a future custom dashboard to remain optional, so
    that Vasuli does not duplicate PostHog's analytics infrastructure before the
    need is proven.

## Implementation Decisions

- Integrate the `posthog-react-native` SDK using its Expo config plugin and
  mount the provider at the application root.
- Use one analytics service boundary with operations equivalent to tracking an
  event, identifying the authenticated user, resetting identity, and flushing
  or retrying queued events. Screens, components, and domain services must not
  call the PostHog SDK directly.
- Configure the analytics service from the root provider/auth bridge. The
  service must be safe to call before the provider is ready and must become a
  no-op when analytics is disabled or the public project token is absent.
- Start tracking only after Supabase authentication has resolved to an
  authenticated user. Use the authenticated Supabase identity as the PostHog
  distinct ID. Do not collect anonymous pre-login events or merge anonymous
  identities in the initial rollout.
- Use the following initial event taxonomy:
  - `auth_completed`
  - `group_created`
  - `group_joined`
  - `invite_sent`
  - `invite_accepted`
  - `expense_started`
  - `expense_created`
  - `expense_creation_failed`
  - `settlement_started`
  - `settlement_created`
  - `group_viewed`
- Event names use stable lowercase snake case and describe completed product
  actions or explicit flow starts/failures. Do not add events for every tap or
  render.
- Allowed aggregate event properties are platform, app version, group-size
  bucket, expense input method, currency code, categorized error, and safe
  release context such as Expo update ID, channel, and runtime version.
- Prohibited event properties include raw names, emails, expense descriptions,
  exact amounts, group IDs, user IDs, access tokens, auth data, and other direct
  personal or financial identifiers.
- Development builds send no analytics by default. If development analytics
  is needed later, it must use a separate PostHog project.
- Preview builds use a dedicated preview PostHog project. Production builds
  use the existing `Default project`.
- Configure the public PostHog project token and host through Expo's
  `EXPO_PUBLIC_*` environment variables and EAS environment management. These
  values are client-visible project configuration, not personal API keys.
- Personal API keys used for future source-map or CLI operations must remain
  outside the client bundle and use separate sensitive EAS variables.
- Do not use `NODE_ENV` as the environment-selection mechanism. Use the
  existing EAS build environment/profile model and explicit environment
  configuration.
- Do not use the EAS PostHog connect shortcut for the initial rollout because
  it writes integration variables across environments automatically. Configure
  the already-connected PostHog projects deliberately.
- Analytics delivery is best-effort. It must never delay or block
  authentication, navigation, startup readiness, expense creation, or
  settlement.
- When offline or PostHog is unavailable, queue only non-sensitive events in a
  bounded local queue, retry when connectivity returns, and discard queued
  events after 24 hours.
- Register Expo release metadata on subsequent events when available so
  dashboards can compare update IDs, channels, runtime versions, and app
  versions.
- Keep PostHog session replay disabled initially. Use PostHog Error Tracking
  for crashes and error groups only after the basic event integration is stable.
  If Error Tracking is enabled, configure source maps and CLI credentials
  separately from runtime analytics credentials.
- Create four initial PostHog views: activation funnel, engagement,
  collaboration, and reliability. Avoid a custom React/Next.js analytics
  dashboard until PostHog usage demonstrates a concrete need.
- Review the four dashboards weekly against the previous seven-day period. A
  15–20% movement or a clear platform/version-specific problem triggers an
  investigation. Evaluate one improvement hypothesis at a time and recheck it
  one to two weeks after release.
- Disclose authenticated product analytics collection, its purpose, aggregate
  data categories, and PostHog usage in the privacy policy. Use PostHog's
  default retention policy initially and document/review it before production
  launch. There is no in-app analytics opt-out in the initial rollout.
- Keep the existing Supabase activity table as the user-facing activity/audit
  history. Do not use it as a replacement for product analytics events.
- Keep the implementation's primary testing seam at the analytics service
  boundary configured by the root provider/auth bridge.

## Testing Decisions

Tests should verify observable analytics behavior at the centralized analytics
boundary, not React effect order, SDK internals, exact retry timing, or network
implementation details.

Test the analytics service and provider/auth bridge with controlled SDK and
connectivity dependencies. Cover:

- Events are ignored before authentication and accepted after authentication.
- Authenticated identity is set once the auth state is ready.
- Identity is reset when the user signs out or changes.
- The service becomes a no-op when configuration is absent or analytics is
  disabled.
- Every approved event uses the expected stable name.
- Allowed aggregate properties pass through with the expected normalization.
- Prohibited properties are removed or rejected before the SDK call.
- Development configuration sends no events.
- Preview and production configuration select their intended project settings.
- Release metadata is attached when available and omitted safely when absent.
- SDK failures do not reject or delay the caller's product operation.
- Offline events are bounded, retryable, non-sensitive, and discarded after the
  expiry limit.
- Duplicate auth, foreground, or retry signals do not create duplicate identity
  transitions or unbounded queue entries.
- The initial event taxonomy covers auth, groups, invitations, expenses,
  settlements, and group views.

Follow existing Vitest and service-test conventions. Prefer pure validation and
normalization tests plus injected-boundary tests. Add focused component tests
only where the root provider/auth bridge has externally observable behavior.
Do not call the real PostHog service, launch a browser, depend on real network
connectivity, or assert against a live PostHog project in unit tests.

Add a development-build verification checklist covering authenticated launch,
sign-out/sign-in, offline event delivery, preview isolation, production
configuration, event inspection in PostHog, release metadata, expense creation,
settlement completion, notification/deep-link failures, both themes, and a
regression check that analytics failure never blocks the app.

## Out of Scope

- Building a separate Next.js, React, or Supabase analytics dashboard in the
  initial rollout.
- Tracking anonymous pre-login behavior or implementing anonymous identity
  merging.
- Collecting raw personal, financial, or expense content in PostHog.
- Adding an in-app analytics opt-out in the initial rollout.
- Enabling PostHog session replay.
- Adding Sentry unless PostHog Error Tracking proves insufficient.
- Building a custom analytics warehouse or Supabase analytics event table.
- Replacing the existing Supabase activity/audit history.
- Growth marketing attribution, monetization analytics, or revenue reporting.
- Product experiments or feature flags beyond the integration needed for
  analytics; those can be planned separately after baseline data exists.
- Publishing a production build, changing production PostHog settings, or
  creating the dashboards as part of writing this specification.
- Changing the existing expense, settlement, invitation, or authentication
  data models.

## Further Notes

The current PostHog MCP connection is authenticated to the account's `Default
project` (project ID 66883). The project token and host still need to be
configured for the mobile app through the appropriate EAS environment; MCP
authentication does not configure the client SDK.

The first implementation should establish event delivery and privacy filtering
before adding Error Tracking or richer release automation. The initial
baseline period should be long enough to observe normal weekly variation before
using the 15–20% investigation threshold aggressively.

The privacy policy update should describe the categories and purpose of
authenticated product analytics in user-facing language and should be reviewed
alongside the production configuration before the first production event is
sent.

## Tracker

- Project: Vasuli
- Tracker: local-markdown
- Status: ready-for-agent
- Label: `ready-for-agent`
