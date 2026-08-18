---
name: Vasuli
description: A warm, legible shared tab for recording expenses and settling up with friends.
colors:
  accent-teal: "#2DD4BF"
  accent-green: "#005E44"
  accent-green-dark: "#10B981"
  light-background: "#F1F5F9"
  light-card: "#FFFFFF"
  dark-background: "#040914"
  dark-card: "#0F172A"
  dark-surface: "#131B2E"
  light-text: "#1A1A1A"
  dark-text: "#F8FAFC"
  light-secondary: "#374151"
  dark-secondary: "#9BA6B8"
  light-border: "#E5E5E5"
  dark-border: "#2A3441"
  success: "#10B981"
  error-dark: "#FFB4AB"
typography:
  display:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.5px"
  title:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.17
    letterSpacing: "-0.3px"
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "0.5px"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  screen: "20px"
components:
  button-primary:
    backgroundColor: "{colors.accent-green-dark}"
    textColor: "{colors.dark-background}"
    rounded: "{rounded.md}"
    height: "56px"
    padding: "0 16px"
  button-secondary:
    backgroundColor: "{colors.light-background}"
    textColor: "{colors.accent-green}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 16px"
  card:
    backgroundColor: "{colors.light-card}"
    rounded: "{rounded.md}"
    padding: "16px"
  input:
    backgroundColor: "{colors.light-card}"
    textColor: "{colors.light-text}"
    rounded: "{rounded.md}"
    height: "56px"

---

# Design System: Vasuli

## Overview

**Creative North Star: "The Warm Shared Tab"**

Vasuli treats expense tracking as a social coordination moment, not a finance
dashboard. The visual system is compact, friendly, and trustworthy: Manrope
keeps the interface approachable, while restrained teal and green accents make
actions and balance states easy to recognize.

The app uses native mobile navigation and interaction patterns, with soft tonal
surfaces rather than heavy decoration. Light mode is cool and open; dark mode
is deep navy with muted blue-gray text and bright green/teal action accents.

**Key Characteristics:**

- Warm, social utility with calm financial presentation.
- Compact mobile-first spacing and large, reachable actions.
- Light and dark themes treated as first-class states.
- Color supports balance meaning but never carries it alone.

## Colors

The palette pairs a deep green brand anchor with a brighter teal/green action
accent, then uses cool slate surfaces to keep money interactions legible.

### Primary

- **Shared-tab green** (`#005E44`): light-mode primary actions and brand anchor.
- **Active mint** (`#10B981`): dark-mode actions, positive balances, and selected
  controls.
- **Signal teal** (`#2DD4BF`): dark-mode emphasis and secondary action detail.

### Neutral

- **Cool paper** (`#F1F5F9`): light-mode screen background.
- **White surface** (`#FFFFFF`): light-mode cards and inputs.
- **Deep night** (`#040914`): dark-mode screen background.
- **Slate surface** (`#0F172A` / `#131B2E`): dark cards, fields, and panels.
- **Ink** (`#1A1A1A` / `#F8FAFC`): primary text in light/dark mode.
- **Muted slate** (`#374151` / `#9BA6B8`): supporting text and metadata.
- **Outline** (`#E5E5E5` / `#2A3441`): borders and dividers.

### Named Rules

**The Calm Money Rule.** Use accent color to clarify the next action or balance
direction; do not flood a screen with competing saturated surfaces.

**The Two-Theme Rule.** Every new surface, state, placeholder, border, and icon
must be intentionally readable in both light and dark appearance.

## Typography

**Display Font:** Manrope (with system sans fallback)
**Body Font:** Manrope (with system sans fallback)
**Label Font:** Manrope SemiBold

**Character:** Manrope is rounded, contemporary, and social without becoming
  playful at the expense of financial clarity.

### Hierarchy

- **Display** (700, 30px, 36px): home balance and major screen headings.
- **Title** (700, 24px, 28px): detail-level section or entity names.
- **Subtitle** (600, 16px): navigation titles and supporting headings.
- **Body** (400, 14px, 20px): descriptions, metadata, and explanatory copy.
- **Label** (700, 12–13px, uppercase with light tracking): form labels and
  compact section headings.

**The Legible Numbers Rule.** Amounts and balance labels must remain visually
  dominant enough to scan quickly, but never use decoration that makes currency
  values harder to compare.

## Layout

Vasuli is mobile-first. Screens use a full-height safe-area-aware container,
20px horizontal screen padding, and compact vertical rhythm built from 8px,
12px, 16px, and 24px steps. Content may use a centered `maxWidth` around 600px
for web and tablet inspection without stretching phone layouts.

Primary actions remain reachable near the bottom or in the navigation header.
Lists use FlatList where content can grow; detail flows use keyboard-aware
scrolling and preserve room for the keyboard and home indicator.

## Elevation & Depth

The system uses tonal layering first and soft shadows second. Cards are
distinguished by surface contrast, a subtle border, and a low, diffuse shadow;
avoid hard offset shadows or decorative glow as the default. Dark mode should
use deeper surfaces and restrained borders rather than inverted white cards.

### Shadow Vocabulary

- **Card lift:** soft offset shadow with low opacity for interactive cards and
  panels.
- **Primary action:** slightly stronger soft shadow on the main submit/record
  action.
- **Dark surfaces:** use tonal contrast and low-opacity black shadow; never a
  bright shadow around the entire screen.

## Shapes

The form language is soft but controlled: 8px for small fields and avatars,
12–16px for cards, buttons, and controls, and 24px for hero amount surfaces or
large profile surfaces. Borders are 1px and low contrast. Touch targets should
be at least 44pt on iOS and 48dp on Android where practical.

## Components

### Buttons

- **Shape:** 12px radius, 44–56px height depending on context.
- **Primary:** green/mint filled surface with dark readable text in dark mode
  and white text in light mode.
- **Secondary / Ghost:** tonal card or transparent surface with a themed border
  and accent text.
- **States:** selected and disabled states must change surface, contrast, and
  accessibility state; never rely on color alone.

### Chips and Segmented Controls

- Use compact pill-like controls only for split methods, filters, and other
  short mutually exclusive choices.
- Selected controls use the active mint/green surface and an on-accent text
  color; unselected controls use the current card surface and secondary text.

### Cards and Containers

- Use tonal surfaces from `constants/theme.ts` and theme-aware borders.
- Keep internal padding generally between 12px and 20px.
- Reserve stronger shadows for elevated actions or focused cards.

### Inputs and Fields

- Use `ThemedInput` or a theme-aware field with explicit text, placeholder,
  background, and border colors.
- Amount fields may be visually emphasized, but description and date fields
  stay calm and easy to scan.
- Use keyboard-aware scrolling, clear labels, and useful error states.

### Navigation

- Use Expo Router stacks/tabs and the shared `NavigationHeader`.
- Preserve native back behavior, safe-area insets, and platform conventions.
- Keep top-level navigation limited to primary destinations; actions belong in
  screen content or contextual buttons.

### Balance and Settlement Surfaces

- State the direction in words such as “You owe” or “You are owed”; do not make
  red/green the sole explanation.
- Use restrained positive/negative accents and show exact currency amounts.
- Confirmation language should describe the recorded action in human terms.

## Do's and Don'ts

### Do:

- **Do** use `useThemeColors()` and add reusable light/dark tokens when a new
  surface needs a color.
- **Do** inspect loading, empty, error, disabled, selected, and modal states in
  both themes.
- **Do** keep copy direct, respectful, and social.
- **Do** use native safe-area, keyboard, back, and navigation behavior.
- **Do** preserve touch target sizes and accessibility labels/states.

### Don't:

- **Don't** leave raw white/black surfaces or placeholder colors visible in the
  opposite theme.
- **Don't** turn the product into a spreadsheet with dense rows, excessive
  tables, or accounting jargon.
- **Don't** use gradients, glow, emojis, or animation as decoration without a
  clear product or state purpose.
- **Don't** create a one-off card, modal, input, or header when a shared
  component already expresses the pattern.
- **Don't** hide balance direction behind color alone or invent financial
  claims, testimonials, or payment integrations.
