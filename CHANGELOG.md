## 2026-08-08

- Added the ability to record an expense paid by another group or friend participant while preserving the creator for authorization and audit history.
- Allow both the expense creator and listed payer to edit or delete an expense.
- Removed the duplicate group expense modal in favor of the shared full-screen expense flow.

## 2026-07-23

- Fixed splash screen animation playing twice on launch. `useProtectedRoute` now
  delays navigation redirects until the animated splash completes, preventing
  the root layout from remounting mid-animation. Added animation cleanup to
  `AnimatedSplash` so looping effects stop on unmount.

## 2026-07-22

- Documented Vasuli’s product direction: a playful shared tab focused first on
  fast trip and outing expense capture, clear balances, and respectful
  settlement.
