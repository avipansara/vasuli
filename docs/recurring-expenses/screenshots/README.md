# Recurring expenses iOS comparison

Captured September 30, 2026 on iPhone 18 Pro, iOS 27.0, using synthetic data in an isolated local Supabase project.

- Before UI source: `270123ac0e1286a3953a4d97927f4bdb82787b83`, the PR base on `master`.
- After UI source: `481de788d02caf6b8fd2b86fdf04b3cb599b30c3`.
- Both JavaScript versions ran in the same iOS 27-capable native shell with the current Expo dependencies. The baseline source was exported outside the working tree; this comparison shows UI changes rather than native build compatibility.
- Matched screens use the same account, friend, expense and unsaved form values. Capturing the form and review did not create another expense.
- PNGs are original simulator captures. Light mode comparisons are supplemented by the new schedule list in dark mode.

## Matched screens

| Screen | Before | After |
| --- | --- | --- |
| Activity | [Before](ios/before-activity-light.png) | [After](ios/after-activity-light.png) |
| Add Expense | [Before](ios/before-add-expense-light.png) | [After](ios/after-add-expense-light.png) |
| Posted expense detail | [Before](ios/before-occurrence-light.png) | [After](ios/after-occurrence-light.png) |

## New recurring flow

- [Schedule configuration](ios/after-recurrence-form-light.png)
- [Review before saving](ios/after-review-light.png)
- [Schedule list, light](ios/after-schedules-light.png)
- [Schedule details](ios/after-schedule-detail-light.png)
- [Schedule list, dark](ios/after-schedules-dark.png)
