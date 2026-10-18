# samsara-routing DESIGN.md

> Auto-generated design system — reverse-engineered via static analysis by skillui.
> Frameworks: None detected
> Colors: 20 · Fonts: 3 · Components: 10
> Icon library: not detected · State: not detected
> Primary theme: light · Dark mode toggle: no · Motion: expressive

## Visual Reference

**Match this design exactly** — study colors, fonts, spacing, and component shapes before writing any UI code.

![samsara-routing Homepage](../screenshots/homepage.png)

---

## 1. Visual Theme & Atmosphere

This is a **light-themed** interface with a neutral, approachable feel. The light background emphasizes content clarity. Typography pairs **FK Grotesk** for display/headings with **Samsara Sans** for body text, creating clear visual hierarchy through type contrast. Spacing follows a **4px base grid** (compact density), with scale: 2, 4, 6, 8, 10, 12, 14, 16px. Motion is expressive — spring physics, layout animations, and staggered reveals are part of the visual language.

---

## 2. Color Palette & Roles

| Token | Hex | Role | Use |
|---|---|---|---|
| tw-ring-offset-color | `#ffffff` | background | Page background, darkest surface |
| sm-background-faint | `#f5f4f1` | surface | Card and panel backgrounds |
| sm-background-inverse | `#1c1917` | text-primary | Headings and body text |
| sm-color-gray-600 | `#716f67` | text-muted | Captions, placeholders, secondary info |
| sm-color-gray-700 | `#403d37` | border | Dividers, card borders, outlines |
| danger | `#df2036` | danger | Error states, destructive actions |
| success | `#0dab41` | success | Success states, positive indicators |
| sm-background-loud | `#feae0f` | warning | Warning states, caution indicators |
| sm-color-blue-900 | `#0c2648` | info | Informational highlights |
| sm-background-default | `#e0ddd5` | unknown | Palette color |
| unknown | `#000000` | unknown | Palette color |
| sm-color-gray-300 | `#ccc9c1` | unknown | Palette color |
| sm-background-muted | `#eae8e3` | unknown | Palette color |
| sm-border-muted | `#9c9890` | unknown | Palette color |
| unknown | `#af419e` | unknown | Palette color |
| unknown | `#4670d5` | unknown | Palette color |
| unknown | `#333333` | unknown | Palette color |
| sm-color-orange-50 | `#ffe0d1` | unknown | Palette color |
| unknown | `#0b0f20` | unknown | Palette color |
| unknown | `#989fa9` | unknown | Palette color |

### CSS Variable Tokens

```css
--tw-border-spacing-x: 0;
--tw-border-spacing-y: 0;
--tw-border-opacity: 1;
--tw-border-opacity: 1;
--tw-border-opacity: 1;
--tw-border-opacity: 1;
--tw-border-opacity: 1;
--tw-border-opacity: 1;
--tw-border-opacity: 1;
--tw-border-opacity: .25;
--tw-border-opacity: 1;
--sm-background-base: #fff;
--sm-background-base-rgb: 255 255 255;
--sm-background-default: #e0ddd5;
--sm-background-default-rgb: 224 221 213;
--sm-background-faint: #f5f4f1;
--sm-background-faint-rgb: 245 244 241;
--sm-background-inverse: #1c1917;
--sm-background-inverse-rgb: 28 25 23;
--sm-background-loud: #feae0f;
```


---

## 3. Typography Rules

**Font Stack:**
- **Samsara Sans** — Heading 1, Heading 2, Heading 3
- **FK Grotesk** — Body, Caption
- **FK Grotesk Mono** — Code

**Font Sources:**

```css
@font-face {
  font-family: "FK Grotesk";
  src: url("fonts/FKGrotesk-Regular.woff2") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "FK Grotesk";
  src: url("fonts/FKGrotesk-700.woff2") format("woff2");
  font-weight: 700;
}
@font-face {
  font-family: "FK Grotesk Mono";
  src: url("fonts/FKGroteskMono-Regular.woff2") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "FK Grotesk Mono";
  src: url("fonts/FKGroteskMono-700.woff2") format("woff2");
  font-weight: 700;
}
@font-face {
  font-family: "Samsara Sans";
  src: url("fonts/SamsaraSans-700.woff2") format("woff2");
  font-weight: 700;
}
@font-face {
  font-family: "Samsara Script";
  src: url("fonts/SamsaraScript-Regular.woff2") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "Anybody";
  src: url("fonts/Anybody-Bold.ttf") format("truetype");
  font-weight: 700;
}
@font-face {
  font-family: "Anybody";
  src: url("fonts/Anybody-Regular.ttf") format("truetype");
  font-weight: 400;
}
@font-face {
  font-family: "Acumin Pro ExtraCondensed";
  src: url("fonts/AcuminProExtraCondensed-800.woff2") format("woff2");
  font-weight: 800;
}
```

| Role | Font | Size | Weight |
|---|---|---|---|
| Heading 1 | Samsara Sans | 6.5rem | 700 |
| Heading 2 | Samsara Sans | 97.6px | 700 |
| Heading 3 | Samsara Sans | 5.5rem | 700 |
| Body | FK Grotesk | .875rem | 400 |
| Caption | FK Grotesk | 1rem | 400 |
| Code | FK Grotesk Mono | 14px | 400 |

**Typographic Rules:**
- Limit to 3 font families max per screen
- Use **Samsara Sans** for body/UI text, **FK Grotesk** for display/headings
- Maintain consistent hierarchy: no more than 3-4 font sizes per screen
- Headings use bold (600-700), body uses regular (400)
- Line height: 1.5 for body text, 1.2 for headings
- Use color and opacity for secondary hierarchy, not additional font sizes


---

## 4. Component Stylings

### Layout (1)

**Footer** — `html`

### Navigation (1)

**Navigation** — `html`

### Data Display (3)

**Card** — `html`
- Variants: `logo-container`, `image`, `content`, `headings`, `carousel`

**Badge** — `html`

**List** — `html`

### Data Input (2)

**Button** — `html`
- Variants: `-blue`, `-blue:hover`, `-icon`, `-icon-audio`
- Animation: 

**Input** — `html`
- State: :focus, :placeholder

### Overlay (1)

**Modal** — `html`

### Media (2)

**Image** — `html`

**Icon** — `html`



---

## 5. Layout Principles

- **Base spacing unit:** 4px
- **Spacing scale:** 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24
- **Border radius:** 0px 0px 4px 4px, .125rem, .375rem, .75rem, 1rem, 2px, 2.5px, 3px, 4px, 5px, 8px, 12px, 14px, 16px, 25px, 50em, 100px, inherit
- **Max content width:** 1099px

**Spacing as Meaning:**
| Spacing | Use |
|---|---|
| 4-8px | Tight: related items within a group |
| 12-16px | Medium: between groups |
| 24-32px | Wide: between sections |
| 48px+ | Vast: major section breaks |


---

## 6. Depth & Elevation

### Flat — subtle depth hints

- `inset 0 1px rgb(var(--sm-color-gray-200-rgb))`
- `inset 0-1px rgb(var(--sm-color-gray-200-rgb))`

### Raised — cards, buttons, interactive elements

- `inset var(--decorator-grid-line-width)0 0 var(--decorator-grid-color),inset calc(var(--decorator-grid-line-width)*-1)0 0 var(--decorator-grid-color)`
- `0 1px 5px #0000001a`
- `0-4px #fff,0 4px #fff`

### Floating — dropdowns, popovers, modals

- `0 2px 20px #403d371a,0 0 4px #403d371a`
- `0 0 9px #00000021`

### Overlay — full-screen overlays, top-level dialogs

- `1px 0 41px 2px #00263e0f`
- `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(64, 61, 55, 0.06) 0px 0px 11px 0px, rgba(64, 61, 55, 0) 0px 231px 65px 0px, rgba(64, 61, 55, 0.01) 0px 148px 59px 0px, rgba(64, 61, 55, 0.05) 0px 83px 50px 0px, rgba(64, 61, 55, 0.09) 0px 22px 37px 0px`

### Z-Index Scale

`0, 1, 2, 3, 4, 5, 6, 9, 10, 12, 13, 20, 30, 40, 50, 60, 120, 300, 999, 1000, 9998, 9999, 10000, 10001`



---

## 7. Animation & Motion

This project uses **expressive motion**. Animations are an integral part of the experience.

### CSS Animations

- `@keyframes fadeInLeft`
- `@keyframes scroll-hint`
- `@keyframes fadeIn`
- `@keyframes fadeInTop`
- `@keyframes pulse`
- `@keyframes spin`
- `@keyframes fadein`
- `@keyframes fadeinfromright`

### Animated Components

- **Button**: 

### Motion Guidelines

- Duration: 150-300ms for micro-interactions, 300-500ms for page transitions
- Easing: `ease-out` for enters, `ease-in` for exits
- Always respect `prefers-reduced-motion`


---

## 8. Do's and Don'ts

### Do's

- Use `#ffffff` as the primary page background
- Pair **Samsara Sans** (body) with **FK Grotesk** (display) — these are the only allowed fonts
- Follow the **4px** spacing grid for all margins, padding, and gaps
- Use the defined shadow tokens for elevation — see Section 6
- Use border-radius from the scale: 0px 0px 4px 4px, .125rem, .375rem, .75rem, 1rem
- Reuse existing components from Section 4 before creating new ones

### Don'ts

- Don't introduce colors outside this palette — extend the design tokens first
- Don't introduce additional font families beyond Samsara Sans and FK Grotesk and FK Grotesk Mono
- Don't use arbitrary spacing values — stick to multiples of 4px
- Don't create custom box-shadow values outside the system tokens
- Don't use arbitrary border-radius values — pick from the defined scale
- Don't duplicate component patterns — check Section 4 first
- Don't use backdrop-blur or blur effects

### Anti-Patterns (detected from codebase)

- No blur or backdrop-blur effects
- No zebra striping on tables/lists


---

## 9. Responsive Behavior

| Name | Value | Source |
|---|---|---|
| xs | 375px | css |
| xs | 379px | css |
| xs | 380px | css |
| xs | 389px | css |
| xs | 415px | css |
| xs | 429px | css |
| xs | 436px | css |
| sm | 503px | css |
| sm | 640px | css |
| md | 650px | css |
| md | 767px | css |
| md | 768px | css |
| lg | 847px | css |
| lg | 850px | css |
| lg | 999px | css |
| lg | 1000px | css |
| lg | 1024px | css |
| xl | 1080px | css |
| xl | 1099px | css |
| xl | 1100px | css |
| xl | 1200px | css |
| xl | 1279px | css |
| xl | 1280px | css |
| 2xl | 1300px | css |
| 2xl | 1439px | css |
| 2xl | 1440px | css |
| 2xl | 1441px | css |
| 2xl | 1680px | css |
| 2xl | 1800px | css |

**Approach:** Use `@media (min-width: ...)` queries matching the breakpoints above.


---

## 10. Agent Prompt Guide

Use these as starting points when building new UI:

### Build a Card

```
Background: #f5f4f1
Border: 1px solid #403d37
Radius: 5px
Padding: 16px
Font: Samsara Sans
Use shadow tokens from Section 6.
```

### Build a Button

```
Primary: bg var(--accent), text white
Ghost: bg transparent, border #403d37
Padding: 8px 16px
Radius: 5px
Hover: opacity 0.9 or lighter shade
Focus: ring with var(--accent)
```

### Build a Page Layout

```
Background: #ffffff
Max-width: 1099px, centered
Grid: 4px base
Responsive: mobile-first, breakpoints from Section 9
```

### Build a Stats Card

```
Surface: #f5f4f1
Label: #716f67 (muted, 12px, uppercase)
Value: #1c1917 (primary, 24-32px, bold)
Status: use success/warning/danger from Section 2
```

### Build a Form

```
Input bg: #ffffff
Input border: 1px solid #403d37
Focus: border-color var(--accent)
Label: #716f67 12px
Spacing: 16px between fields
Radius: 5px
```

### General Component

```
1. Read DESIGN.md Sections 2-6 for tokens
2. Colors: only from palette
3. Font: Samsara Sans, type scale from Section 3
4. Spacing: 4px grid
5. Components: match patterns from Section 4
6. Elevation: shadow tokens
```
