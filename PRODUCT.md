# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

The primary users are friends sharing expenses on trips and outings. The first
scenario is four friends recording roughly 15 expenses across a three-day trip.
Roommates are a supported secondary use case for recurring household costs.

## Product Purpose

Vasuli is a playful shared tab for recording shared expenses, understanding who
owes whom, and settling balances without turning a friendly exchange into
accounting work. The core expense action should take less than 10 seconds while
requiring a description and amount.

The first-iteration success signal is users adding at least three expenses per
week.

## Positioning

Vasuli combines fast expense capture with direct, respectful balance language
and social context. It keeps the ledger trustworthy while making the social
moment feel lighter than a spreadsheet or debt-collection tool.

## Operating Context

Users typically record expenses on iOS or Android during trips, outings, or
shared household activity. They can add an expense from the home, friend, or
group flow, review balances, receive manually initiated reminders, and record
settlements only after the real payment is confirmed. A web tab layout supports
web development and inspection.

## Capabilities and Constraints

- The default expense flow pre-fills the current user as payer, today as the
  date, all group members as participants, and an equal split.
- Users can edit equal, unequal, percentage, and share-based split controls
  before saving without a separate review step.
- Supabase provides authentication, data access, realtime updates, and Edge
  Functions.
- Routes live under `app/`; reusable UI lives under `components/`; shared
  logic lives under `lib/`, `hooks/`, `services/`, and `utils/`.
- Balances should be direct and respectful, for example: “Sam owes you $200.”
  Reminders are manual, and settlement records represent confirmed payments.
- Budgets, bank/card integrations, automatic payment collection, chat/social
  feeds, and expense categories are outside the current focused iteration.

## Brand Commitments

The product voice is warm, playful, social, and clear. Use bright but restrained
color, friendly details, and lightweight motion. Confirmations should be human
readable, such as: “You paid $600 for 3 people. Each person owes $200.”

The product should not feel like corporate finance software, a spreadsheet, a
debt collector, or a generic expense app. Avoid excessive color, unclear
totals, intrusive automatic reminders, and jokes about owing money.

## Evidence on Hand

The implemented product is the source of truth for current visual and workflow
behavior. Key references include `constants/theme.ts`, `components/`, the
expense flow in `app/add-expense.tsx`, friend/group detail routes, and the
settlement routes. No testimonials, customer proof, or marketing claims should
be fabricated.

## Product Principles

1. Put balances and next actions first.
2. Keep money interactions calm, legible, and trustworthy.
3. Use warmth through restrained color, soft surfaces, and friendly details.
4. Make social context visible without overwhelming the task.
5. Prefer compact mobile layouts that keep primary actions within easy reach.

## Accessibility & Inclusion

Target WCAG AA contrast for text and controls. Touch targets should remain
comfortable on mobile, and color must not be the only way to communicate
balance state. Honor reduced motion with instant state changes or clear
crossfades. Native iOS and Android flows must preserve safe areas, keyboard
insets, system back behavior, and platform-appropriate navigation.
