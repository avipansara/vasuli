# Public invite page loses the inviter ID

Status: open
Implementation: blocked

## Report and evidence

A user reported QR codes failing while adding a friend. Their platform and exact failure are unknown.

On 2026-10-01, fetching `https://split-space.com/invite/8470a257-22d7-4632-9c1a-5ff7b5a83a1b` returned HTTP 200, but the rendered Open App anchor, iOS/Android app-link metadata, and Smart App Banner argument all contained `vasuli://invite/undefined` instead of the path's user ID. A person scanning with their phone camera and using the web fallback can therefore open an invalid invite in Vasuli.

The Apple and Android association endpoints both returned HTTP 200 with production and preview app entries. Installed-device association and Android signing certificate matching were not verified.

## Required fix

The website source is outside this repository. Fix inviter ID extraction in the public invite route and metadata generation. If it uses asynchronous Next.js route params, verify that the route awaits params before reading `id`; this is a hypothesis, not a confirmed source-level diagnosis.

Preserve the inviter ID and optional invitation query parameter in every Open App link and metadata argument. Verify with a real inviter's link, then test phone-camera scanning with Vasuli installed and with the web fallback on iOS and Android.

## App work completed

- Prevent concurrent scan events from starting duplicate lookups and alerts.
- Resume scanning only after notices are dismissed or confirmation is cancelled.
- Offer Open Settings after permanent camera permission denial and refresh permission on app foreground.
- Unmount the camera when the route loses focus and pause detection while My QR Code is open.
- Require authentication before claiming friendship creation succeeded.
- Increase the QR quiet zone to four modules.

## Validation

`npm run precommit`: passed, 112 files and 899 tests.
`npx tsc --noEmit`: passed.
Physical-device camera detection, light/dark screen inspection, safe areas, and iOS/Android permission round trips still need manual verification. Automated tests mock the native camera and network.
