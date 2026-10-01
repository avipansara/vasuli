# 11 iOS 27 scene support for native verification

Status: ready
Implementation: resolved
Worker: /root/ios27_scene
Requested model: gpt-6-luna
Claimed at: 2026-09-29T20:37:55Z
Review rounds: 1
Blocked by: none

## Scope

Enable Expo’s supported SDK 57 scene lifecycle opt-in so the requested iPhone 18 Pro on iOS 27 can launch the app. This prerequisite was discovered during ticket 07 verification. Stay on stable SDK 57.

## Acceptance criteria

- [x] Expo is updated within SDK 57 to a patch supporting scene lifecycle (57.0.23 or newer), with compatible expo-build-properties and generated native artifacts.
- [x] ios.enableSceneSupport is enabled for development, preview, and production configurations without duplicating/conflicting build-property plugins.
- [x] Native regeneration preserves existing app configuration and documented custom native changes; auth, deep links, and notification callbacks follow Expo’s supported forwarding behavior.
- [x] A newly built app launches on iPhone 18 Pro iOS 27 (910C5904-E8F1-48F8-814F-36A3816E2298), and the scene lifecycle launch error is absent.
- [x] Changelog records the native compatibility fix and required new build.

## Checks

- npx expo install --fix
- npx expo-doctor
- npm run lint
- Simulator release build and launch diagnostics

## Expected areas

package.json, package-lock.json, app.config.ts/app.json; ignored generated ios native files as needed.

## References

https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md#staying-on-sdk-57-with-xcode-27

## Comments

Prioritize this ticket before 08 because it unblocks acceptance of already-implemented 07 and the user explicitly requested this iOS 27 simulator. Current Xcode 27 includes only SDK 27; changing the simulator does not resolve the build compatibility issue.

### Review round 1

Primary verified config per environment, dependency compatibility, Expo Doctor 21/21, lint (0 errors/7 existing warnings), Git state and native AppDelegate diff. The release native compile succeeds, but regenerated PostHog source-map build hook fails without local upload credentials. Worker correction: scope upload plugin to intended EAS or explicitly configured upload builds, preserve EAS behavior/runtime analytics, remove stale generated wrapper for local builds, and rerun checks. Do not reuse a stale JS bundle or supply fake credentials.

## Implementation evidence

- Requested worker: gpt-6-luna, /root/ios27_scene; one correction round.
- Updated stable SDK 57 dependencies (Expo installed 57.0.26; build-properties 57.0.22), enabled supported iOS scene opt-in, regenerated ignored native iOS project/Pods while retaining link handlers. Scoped build-time PostHog upload hook to EAS Build; runtime analytics preserved.
- Primary independently verified six APP_ENV/EAS_BUILD config combinations, dependency check, Expo Doctor 21/21, lint (0 errors/7 existing warnings), Git branch/HEAD/staged baseline, native AppDelegate diff, and local release build (exit 0).
- Installed and launched new release on iPhone 18 Pro, iOS 27.0, UUID 910C5904-E8F1-48F8-814F-36A3816E2298. Primary inspected sign-in screenshot; scoped startup log has no UIScene launch failure.
- Working-tree changes: app.config.ts, package.json, package-lock.json, CHANGELOG.md. No commits, staging, branch changes, or deployment.
- Ticket 07 native verification is now unblocked.
