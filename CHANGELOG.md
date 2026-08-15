## 2026-08-15

- Fixed Unequal and Shares expense splits to use consistent validation during
  entry and save, including rejecting negative or empty share allocations.
- Fixed newly created expenses paid by another friend being rejected by the
  creator's immediate read policy.
- Prevented Friend and Group settlements from recording amounts above the
  outstanding balance.

## 2026-08-10

- Group expense rows now open their expense details when tapped.
- Added search across activity descriptions, groups, and people.

## 2026-08-08

- Added the ability to record an expense paid by another group or friend participant while preserving the creator for authorization and audit history.
- Allow both the expense creator and listed payer to edit or delete an expense.
- Removed the duplicate group expense modal in favor of the shared full-screen expense flow.

## 2026-08-07

- Fixed received friend requests showing an anonymous requester. Requester
  profiles are now resolved in the friendship service, with an explicit error
  when a referenced requester profile cannot be loaded. Removed the unused legacy
  invitations section and added coverage for requester-name resolution.

## 2026-08-15

- Fixed pending friend requests remaining visible after the users became
  friends, and added a profile-email fallback when a requester name is blank.
- Prevented new friend requests from being created for existing friendships.

## 2026-07-23

- Fixed splash screen animation playing twice on launch. `useProtectedRoute` now
  delays navigation redirects until the animated splash completes, preventing
  the root layout from remounting mid-animation. Added animation cleanup to
  `AnimatedSplash` so looping effects stop on unmount.

## 2026-07-22

- Documented Vasuli’s product direction: a playful shared tab focused first on
  fast trip and outing expense capture, clear balances, and respectful
  settlement.
