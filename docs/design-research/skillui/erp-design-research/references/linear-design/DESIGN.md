# linear DESIGN.md

> Auto-generated design system — reverse-engineered via static analysis by skillui.
> Frameworks: None detected
> Colors: 20 · Fonts: 2 · Components: 7
> Icon library: not detected · State: not detected
> Primary theme: light · Dark mode toggle: no · Motion: expressive

## Visual Reference

**Match this design exactly** — study colors, fonts, spacing, and component shapes before writing any UI code.

![linear Homepage](../screenshots/homepage.png)

---

## 1. Visual Theme & Atmosphere

This is a **light-themed** interface with a cool, approachable feel. The light background emphasizes content clarity. Typography uses **Inter Variable** throughout — a clean, modern choice that maintains consistency. Spacing follows a **4px base grid** (compact density), with scale: 2, 4, 6, 8, 10, 12, 14, 16px. The accent color **#7170ff** anchors interactive elements (buttons, links, focus rings). Motion is expressive — spring physics, layout animations, and staggered reveals are part of the visual language.

---

## 2. Color Palette & Roles

| Token | Hex | Role | Use |
|---|---|---|---|
| header-border | `#ffffff` | background | Page background, darkest surface |
| color-bg-tertiary | `#f4f2f4` | surface | Card and panel backgrounds |
| theme-color | `#080808` | text-primary | Headings and body text |
| color-text-tertiary | `#8b93a1` | text-muted | Captions, placeholders, secondary info |
| color-text-secondary | `#d2d7de` | text-muted | Captions, placeholders, secondary info |
| color-text-secondary | `#b4bcd0` | text-muted | Captions, placeholders, secondary info |
| border-faint-thin | `#191d20` | border | Dividers, card borders, outlines |
| color-accent | `#7170ff` | accent | CTAs, links, focus rings, active states |
| color-link-primary | `#828fff` | accent | CTAs, links, focus rings, active states |
| color-red | `#f34e52` | danger | Error states, destructive actions |
| color-green | `#27a644` | success | Success states, positive indicators |
| color-indigo | `#5e6ad2` | info | Informational highlights |
| color-text-quaternary | `#6b6b6b` | unknown | Palette color |
| unknown | `#9c9da1` | unknown | Palette color |
| border-solid | `#2a2e33` | unknown | Palette color |
| color-button-invert-bg | `#e2e4e7` | unknown | Palette color |
| unknown | `#585a5c` | unknown | Palette color |
| unknown | `#6d78d5` | unknown | Palette color |
| color-border-tertiary | `#3e3e44` | unknown | Palette color |
| color-blue | `#4ea7fc` | unknown | Palette color |

### CSS Variable Tokens

```css
--header-border: transparent;
--header-border: #ffffff14;
--header-border: #00000014;
--header-border: #ffffff14;
--header-border: #00000014;
--card-width: 400px;
--card-height: 560px;
--card-gap: 12px;
--card-radius: 12px;
--plan-tail-accent: #21b3ff;
--label-muted: var(--color-text-quaternary);
--border-solid: #2a2e33;
--border-thin: #24282c;
--border-faint-thin: #191d21;
--border-frame: #151616;
--timeline-block-border: #ffffff1f;
--agent-chip-border: #ffffff14;
--agent-card-border: #ffffff1f;
--layer-popover: 600;
--border-hairline: 1px;
```


---

## 3. Typography Rules

**Font Stack:**
- **Inter Variable** — Heading 1, Heading 2, Heading 3, Body, Caption
- **Berkeley Mono** — Code

**Font Sources:**

```css
@font-face {
  font-family: "Inter Variable";
  src: url("https://static.linear.app/fonts/InterVariable.woff2?v=4.1") format("woff2");
  font-weight: 100;
}
@font-face {
  font-family: "Berkeley Mono";
  src: url("https://static.linear.app/fonts/Berkeley-Mono-Variable.woff2?v=3.2") format("woff2");
  font-weight: 100;
}
```

| Role | Font | Size | Weight |
|---|---|---|---|
| Heading 1 | Inter Variable | 40px | 700 |
| Heading 2 | Inter Variable | 38px | 700 |
| Heading 3 | Inter Variable | 2.25rem | 700 |
| Body | Inter Variable | 13px | 400 |
| Caption | Inter Variable | 12px | 400 |
| Code | Berkeley Mono | 14px | 400 |

**Typographic Rules:**
- Use **Inter Variable** for all text — do not mix font families
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

### Data Input (2)

**Button** — `html`
- Animation: 

**Input** — `html`
- State: :focus, :placeholder

### Media (3)

**Image** — `html`

**Icon** — `html`

**Map/Canvas** — `html`



---

## 5. Layout Principles

- **Base spacing unit:** 4px
- **Spacing scale:** 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24
- **Border radius:** inherit, .3em, 1rem, 1.5px, 2px, 3px, 3.5px, 4px, 5px, 6px, 8px, 9px, 10px, 12px, 14px, 16px, 20px, 22px, 24px, 100%, 100px, 400px, 999px
- **Max content width:** 1280px

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

- `0 1px #0006`
- `0 0 0 1px #00000014,var(--shadow-low)`
- `inset 0 0 0 1px var(--color-border-translucent)`

### Raised — cards, buttons, interactive elements

- `var(--shadow-medium)`
- `0 0 0 2px var(--color-bg-primary),0 0 0 4px var(--color-brand-bg)`
- `inset 0 0 0 1px #ffffff08,inset 0 1px #ffffff0a,0 0 0 1px #0009,0 4px 4px #0000001a`

### Floating — dropdowns, popovers, modals

- `0 0 0 10px #f34f5200`
- `0 4px 12px #00000026`
- `inset 0 0 12px 0 var(--timeline-block-inset)`

### Overlay — full-screen overlays, top-level dialogs

- `0 8px 32px #08090a`
- `0 8px 32px #08090a0d`
- `0 0 32px #0006,0 0 0 1px #000`

### Z-Index Scale

`0, 1, 2, 10`



---

## 7. Animation & Motion

This project uses **expressive motion**. Animations are an integral part of the experience.

### CSS Animations

- `@keyframes _6QN9Vq_tooltipOpen`
- `@keyframes _6QN9Vq_tooltipClose`
- `@keyframes WinFxq_contextMenuIn`
- `@keyframes WinFxq_contextMenuOut`
- `@keyframes TZTsQG_mobileMenuIn`
- `@keyframes TZTsQG_mobileMenuOut`
- `@keyframes TZTsQG_slideFromRight`
- `@keyframes TZTsQG_slideFromLeft`

### Animated Components

- **Button**: 

### Motion Guidelines

- Duration: 150-300ms for micro-interactions, 300-500ms for page transitions
- Easing: `ease-out` for enters, `ease-in` for exits
- Always respect `prefers-reduced-motion`


---

## 8. Do's and Don'ts

### Do's

- Use `#7170ff` for interactive elements (buttons, links, focus rings)
- Use `#ffffff` as the primary page background
- Use **Inter Variable** for all UI text
- Follow the **4px** spacing grid for all margins, padding, and gaps
- Use the defined shadow tokens for elevation — see Section 6
- Use border-radius from the scale: inherit, .3em, 1rem, 1.5px, 2px
- Reuse existing components from Section 4 before creating new ones

### Don'ts

- Don't introduce colors outside this palette — extend the design tokens first
- Don't mix font families — use Inter Variable consistently
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
| sm | 640px | css |
| md | 641px | css |
| md | 768px | css |
| lg | 769px | css |
| lg | 928px | css |
| lg | 1024px | css |
| xl | 1025px | css |
| xl | 1140px | css |
| xl | 1280px | css |
| 2xl | 1281px | css |
| 2xl | 1439px | css |
| 2xl | 1440px | css |
| 2xl | 1536px | css |

**Approach:** Use `@media (min-width: ...)` queries matching the breakpoints above.


---

## 10. Agent Prompt Guide

Use these as starting points when building new UI:

### Build a Card

```
Background: #f4f2f4
Border: 1px solid #191d20
Radius: 9px
Padding: 16px
Font: Inter Variable
Use shadow tokens from Section 6.
```

### Build a Button

```
Primary: bg #7170ff, text white
Ghost: bg transparent, border #191d20
Padding: 8px 16px
Radius: 9px
Hover: opacity 0.9 or lighter shade
Focus: ring with #7170ff
```

### Build a Page Layout

```
Background: #ffffff
Max-width: 1280px, centered
Grid: 4px base
Responsive: mobile-first, breakpoints from Section 9
```

### Build a Stats Card

```
Surface: #f4f2f4
Label: #8b93a1 (muted, 12px, uppercase)
Value: #080808 (primary, 24-32px, bold)
Status: use success/warning/danger from Section 2
```

### Build a Form

```
Input bg: #ffffff
Input border: 1px solid #191d20
Focus: border-color #7170ff
Label: #8b93a1 12px
Spacing: 16px between fields
Radius: 9px
```

### General Component

```
1. Read DESIGN.md Sections 2-6 for tokens
2. Colors: only from palette
3. Font: Inter Variable, type scale from Section 3
4. Spacing: 4px grid
5. Components: match patterns from Section 4
6. Elevation: shadow tokens
```
