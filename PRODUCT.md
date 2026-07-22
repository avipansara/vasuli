# Product

## Product Direction

Vasuli is a playful shared tab for friends on trips and outings. It makes
adding shared expenses feel easy and fun instead of like a chore, so people can
record expenses now and settle them later without awkwardness.

## Primary Users

The first user scenario is four friends on a three-day trip recording roughly
15 expenses. Trips and outings are the primary identity; roommates remain a
supported use case for recurring household costs.

## Product Purpose

Vasuli helps people record shared expenses, understand who owes whom, and
settle balances without turning a friendly exchange into accounting work.

The core action should take less than 10 seconds while still requiring a
description and amount. The default flow should pre-fill the current user as
payer, today as the date, all group members as participants, and an equal
split. Users can edit the split controls before saving without an extra review
step.

The success metric for the first product iteration is users adding at least
three expenses per week.

## Brand Personality

Warm, playful, social, and clear. Use bright but restrained color, emojis where
they add social context, and lightweight motion. Confirmations should use
human-readable language, for example: “You paid ₹600 for 3 people. Each person
owes ₹200.”

Balances should be direct and respectful: “Sam owes you ₹200.” Reminders are
always sent manually by the person who is owed. A settlement is complete only
after both people confirm it.

## Anti-references

It should not feel like corporate finance software, a spreadsheet, a debt
collector, or a visually generic expense app. It should avoid excessive color,
unclear totals, intrusive automatic reminders, and jokes about owing money.

## Design Principles

1. Put balances and next actions first.
2. Keep money interactions calm, legible, and trustworthy.
3. Use warmth through restrained color, soft surfaces, and friendly details.
4. Make social context visible without overwhelming the task.
5. Prefer compact mobile layouts that keep primary actions within easy reach.
6. Make the home screen immediately show “You owe” and “You’re owed,” followed
   by person-by-person balances sorted by most recent activity by default.
7. Use energetic animation when a settlement is confirmed or a whole group is
   settled, and subtle feedback when an expense is added.
8. Keep receipt and category details optional and out of the fast path;
   description and amount are always required.

## Accessibility & Inclusion

Target WCAG AA contrast for text and controls. Touch targets should remain
comfortable on mobile, and color should not be the only way to communicate
balance state. When reduced motion is enabled, replace animations with instant
state changes and clear icons.

## Deliberately Out of Scope

Do not prioritize budgets and spending limits, bank or card integrations,
automatic payment collection, chat or social feeds, or expense categories in
the first focused iteration.
