---
name: Vasuli
description: A warm, legible shared tab for recording expenses and settling up with friends.
colors:
  accent-mint: "#10B981"
  accent-green: "#005E44"
  accent-teal: "#2DD4BF"
  positive-dark: "#4EDEA3"
  positive-light: "#005E44"
  negative-dark: "#FFB4AB"
  negative-light: "#990000"
  light-background: "#F1F5F9"
  light-card: "#FFFFFF"
  dark-background: "#05080E"
  dark-card: "#000000"
  dark-surface-glass: "rgba(15, 23, 42, 0.6)"
  light-text: "#1A1A1A"
  dark-text: "#F8FAFC"
  light-secondary: "#374151"
  dark-secondary: "#9BA6B8"
  light-border: "#E5E5E5"
  dark-border: "rgba(255, 255, 255, 0.08)"
  success: "#10B981"
  error-dark: "#FFB4AB"
typography:
  display:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.5px"
  title:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.3px"
  subtitle:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
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
    letterSpacing: "1px"
rounded:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  input: "20px"
  hero: "24px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  screen: "20px"
components:
  button-primary:
    backgroundColor: "{colors.accent-mint}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    height: "52px"
    padding: "0 16px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.accent-mint}"
    borderColor: "{colors.dark-border}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 16px"
  card:
    backgroundColor: "{colors.dark-card}"
    borderColor: "{colors.dark-border}"
    rounded: "{rounded.lg}"
    padding: "16px"
  hero-card:
    backgroundColor: "{colors.dark-card}"
    rounded: "{rounded.hero}"
    padding: "24px 16px"
  input-amount:
    backgroundColor: "{colors.dark-card}"
    borderColor: "{colors.dark-border}"
    rounded: "{rounded.input}"
    height: "104px"

---

# Design System: Vasuli

## Overview

**Creative North Star: "The Warm Shared Tab"**

Vasuli treats expense tracking as a calm, social coordination moment rather than an intimidating finance dashboard. The visual system is compact, friendly, and trustworthy: Manrope keeps typography approachable and legible, while restrained mint, teal, and green accents make primary actions and balance states effortless to distinguish at a glance.

The app is built mobile-first using native navigation and interaction patterns, featuring subtle tonal layering, pitch-black dark mode surfaces (`#000000`), deep navy space backgrounds (`#05080e`), and diffuse elevation rather than stark borders or loud gradients.

**Key Characteristics:**

- Warm, social utility with calm, trustworthy financial presentation.
- Mobile-first ergonomic touch targets (at least 44pt).
- Light and dark themes treated as first-class, intentional states.
- Pitch-black cards with subtle hairline borders in dark mode; crisp white surfaces in light mode.
- Color supports balance direction but never carries financial meaning alone.

---

## Colors

The palette pairs a deep green anchor in light mode with an active mint in dark mode, balanced by calm slate neutrals to keep currency values clear.

### Primary Accents

- **Active Mint** (`#10B981`): dark-mode primary actions, positive balances, selected tab highlights.
- **Brand Green** (`#005E44`): light-mode primary actions, icons, and brand anchor.
- **Signal Teal** (`#2DD4BF`): secondary emphasis, glows, and badge accents.

### Balances & Financial Semantics

- **Positive (You are owed / Lent)**:
  - Dark: `#4EDEA3` / `#45DFA4`
  - Light: `#005E44` / `#16A34A`
- **Negative (You owe / Borrowed)**:
  - Dark: `#FFB4AB` / `#FFB3B0` (calm coral red)
  - Light: `#990000` / `#DC2626` / `#A83639`
- **Settled / Zero**:
  - Dark: `#9BA6B8`
  - Light: `#6B7280`

### Neutral Surfaces & Backgrounds

- **Deep Night Background** (`#05080E`): dark-mode screen container background.
- **Cool Paper Background** (`#F1F5F9`): light-mode screen container background.
- **Card Surfaces**:
  - Dark: Pitch black `#000000` with subtle border `rgba(255, 255, 255, 0.08)`, or liquid glass `rgba(15, 23, 42, 0.6)`.
  - Light: Clean white `#FFFFFF` with `#E5E5E5` border.
- **Typography & Icons**:
  - Primary Text: `#F8FAFC` (dark) / `#1A1A1A` (light).
  - Secondary Text: `#9BA6B8` (dark) / `#374151` or `#6B7280` (light).
- **Hairline Borders**:
  - Dark: `rgba(255, 255, 255, 0.08)`
  - Light: `#E5E5E5`

### Named Rules

**The Calm Money Rule.** Use accent color to clarify the next action or balance direction; never flood a screen with competing saturated surfaces.

**The Two-Theme Rule.** Every surface, state, placeholder, border, and icon must be intentionally tested and readable in both light and dark appearance.

---

## Typography

**Display & Body Font:** Manrope (with system sans fallback)
**Numerics:** Tabular figures (`fontVariant: ['tabular-nums']`) for all monetary amounts to ensure vertical alignment.

### Hierarchy

- **Display Balance** (800, 36–44px, line-height 1.15): Hero balance amounts in Friend and Group detail screens.
- **Section Title** (700, 20–24px, line-height 1.2): Detail screen headers, entity names, modal titles.
- **Card Title** (600–700, 16–17px, line-height 1.3): Friend names, expense titles, invitation cards.
- **Body & Subtitle** (400–500, 13–14px, line-height 1.43): Descriptions, metadata, timestamps.
- **Eyebrow / Form Label** (700, 12px, uppercase with 1px tracking): Form labels, category markers, compact section titles.

**The Legible Numbers Rule.** Currency symbols and numeric amounts must remain visually dominant and clear, without decoration that makes comparisons difficult.

---

## Shapes & Radii

- **Hero Balance & Summary Cards:** `24px` radius (`rounded.hero`).
- **Settle Interactive Input Fields:** `20px` radius (`rounded.input`).
- **Standard Content Cards:** `16px` radius (`rounded.lg`).
- **Buttons & Quick Chips:** `12–16px` radius (`rounded.md` / `rounded.lg`).
- **Avatars (Squircles):**
  - Standard List (44x44): `14px` radius
  - Compact Stack (34x34): `10px` radius
  - Profile / Modal / QR (48–68px): `20–24px` radius
- **Pills & Circular Badges:** `9999px` or matching circular half-height.

---

## Elevation & Depth

Vasuli avoids heavy, harsh drop shadows in favor of tonal surface contrast and soft, diffuse ambient elevation:

- **Hero Balance Card Elevation:**
  - Dark: `shadowColor: '#64748b'`, `shadowOffset: { width: 0, height: 4 }`, `shadowRadius: 4`, `shadowOpacity: 0.15`, `elevation: 4`.
  - Light: `shadowColor: '#475569'`, `shadowOffset: { width: 0, height: 8 }`, `shadowRadius: 18`, `shadowOpacity: 0.15`, `elevation: 8`.
- **Standard Card Elevation:**
  - Dark: Pitch black surface with `rgba(255, 255, 255, 0.08)` border; 0 or low elevation.
  - Light: White surface with `#E5E5E5` border; `shadowOffset: { width: 0, height: 2 }`, `shadowOpacity: 0.04`, `shadowRadius: 6`, `elevation: 1`.

---

## Flagship Components

### 1. Hero Balance Summary Card (Friend & Group Detail)
- Card container with `borderRadius: 24`, `paddingVertical: 24`, `paddingHorizontal: 16`.
- Pitch black `#000000` surface in dark mode with `borderWidth: 0`.
- Large tabular balance amount in `#4EDEA3` (owed to you) or `#FFB4AB` (you owe).
- Horizontal action icon row (Settle Up pill button, action icons in 40x40 circular surfaces).

### 2. Settle Up Interactive Screen
- **Profile / Relationship Summary Card:** `borderRadius: 20`, displays friend avatar (48x48, `borderRadius: 24`), name, and combined net relationship balance.
- **Hero Amount Input Field:** `borderRadius: 20`, `minHeight: 104`, centered currency symbol (22px bold) and large tabular input (40px bold).
- **Quick Percentage Chips:** 44px min height, `borderRadius: 12`, for "50%" and "Full Balance" instant settlement shortcuts.
- **Breakdown Card:** `borderRadius: 16`, 1px subtle border, itemized rows for Direct, Group, and Cleared scopes.
- **Bottom Action Bar:** Full-width primary action button (`minHeight: 52`, `borderRadius: 12`) with safe-area bottom inset padding.

### 3. Segmented Tab & Filter Controls
- Outer container: `borderRadius: 14`, padded with 4px, background `rgba(255, 255, 255, 0.06)` (dark) / `rgba(0, 0, 0, 0.05)` (light).
- Tab pills: `borderRadius: 10`, active tab styled with card surface and subtle elevation.

### 4. Friend & Member Cards
- `borderRadius: 16`, 44x44 squircle avatar with `borderRadius: 14`.
- 17px bold title, 13px secondary text, sub-balance branching tree indicator with `friendsTheme.branch`.

---

## Do's and Don'ts

### Do:
- **Do** use `useThemeColors()` and tokens from `constants/theme.ts` for all surfaces, borders, and text.
- **Do** inspect loading, empty, error, disabled, and modal states in both Light and Dark modes.
- **Do** use `borderRadius: 16` for content cards and `borderRadius: 24` for hero balance summaries.
- **Do** use squircle rounded avatars (14px radius for 44px avatars) rather than raw circles.
- **Do** format all currency numbers with `fontVariant: ['tabular-nums']`.

### Don't:
- **Don't** leave raw white or black backgrounds, text colors, or borders that fail in opposite theme appearances.
- **Don't** use saturated or bright borders; borders should be soft `rgba(255, 255, 255, 0.08)` in dark mode and `#E5E5E5` in light mode.
- **Don't** hardcode one-off hex values in screens; use theme tokens.
- **Don't** make positive/negative color the only cue for financial direction—always pair color with explicit wording ("You are owed", "You owe").
