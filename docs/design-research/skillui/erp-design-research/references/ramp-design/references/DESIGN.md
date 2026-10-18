# ramp DESIGN.md

> Auto-generated design system — reverse-engineered via static analysis by skillui.
> Frameworks: None detected
> Colors: 20 · Fonts: 3 · Components: 11
> Icon library: not detected · State: not detected
> Primary theme: dark · Dark mode toggle: no · Motion: expressive

## Visual Reference

**Match this design exactly** — study colors, fonts, spacing, and component shapes before writing any UI code.

![ramp Homepage](../screenshots/homepage.png)

---

## 1. Visual Theme & Atmosphere

This is a **dark-themed** interface with a cool tone. Depth is expressed through layered shadows and subtle surface color variation. Typography pairs **Lausanne** for display/headings with **IBM Plex Sans** for body text, creating clear visual hierarchy through type contrast. Spacing follows a **4px base grid** (compact density), with scale: 2, 4, 6, 8, 10, 12, 16, 20px. The accent color **#0066ff** anchors interactive elements (buttons, links, focus rings). Motion is expressive — spring physics, layout animations, and staggered reveals are part of the visual language.

---

## 2. Color Palette & Roles

| Token | Hex | Role | Use |
|---|---|---|---|
| background | `#000000` | background | Page background, darkest surface |
| surface | `#1f1f1d` | surface | Card and panel backgrounds |
| tw-ring-offset-color | `#ffffff` | text-primary | Headings and body text |
| color-gray-500 | `#6a7282` | text-muted | Captions, placeholders, secondary info |
| color-gray-600 | `#4a5565` | border | Dividers, card borders, outlines |
| accent | `#0066ff` | accent | CTAs, links, focus rings, active states |
| danger | `#e96516` | danger | Error states, destructive actions |
| success | `#18a957` | success | Success states, positive indicators |
| warning | `#f3ece1` | warning | Warning states, caution indicators |
| spring | `#5683d2` | info | Informational highlights |
| color-gray-100 | `#f3f4f6` | unknown | Palette color |
| color-gray-200 | `#e5e7eb` | unknown | Palette color |
| border-primary | `#d2cecb` | unknown | Palette color |
| text-primary | `#0c0a08` | unknown | Palette color |
| color-gray-300 | `#d1d5dc` | unknown | Palette color |
| color-cyan-400 | `#00d2ef` | unknown | Palette color |
| unknown | `#2a0a3c` | unknown | Palette color |
| unknown | `#5ab570` | unknown | Palette color |
| unknown | `#b2c7eb` | unknown | Palette color |
| color-blue-600 | `#155dfc` | unknown | Palette color |

### CSS Variable Tokens

```css
--tw-border-spacing-x: 0;
--tw-border-spacing-y: 0;
--tw-border-style: solid;
--text-color-primary: var(--text-primary);
--text-color-primaryReverse: var(--text-primaryReverse);
--background-color-black: var(--black);
--background-color-solar: var(--solar);
--background-color-solarLight: var(--solarLight);
--background-color-smolder: var(--smolder);
--background-color-grayLight: var(--grayLight);
--background-color-grayMedium: var(--grayMedium);
--background-color-grayDark: var(--grayDark);
--background-color-white: var(--white);
--background-color-springLight: var(--springLight);
--background-color-spring: var(--spring);
--background-image-midnight: var(--midnight);
--background-image-dusk: var(--dusk);
--background-image-daylight: var(--daylight);
--border-color-primary: var(--border-primary);
--accent-color-primary: var(--text-primary);
```


---

## 3. Typography Rules

**Font Stack:**
- **IBM Plex Sans** — Heading 1, Heading 2, Heading 3
- **Lausanne** — Body, Caption
- **IBM Plex Mono** — Code

**Font Sources:**

```css
@font-face {
  font-family: "Lausanne";
  src: url("fonts/Lausanne-Regular.woff2") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "Lausanne";
  src: url("fonts/Lausanne-700.woff2") format("woff2");
  font-weight: 700;
}
@font-face {
  font-family: "IBM Plex Mono";
  src: url("fonts/IBMPlexMono-Bold.ttf") format("truetype");
  font-weight: 700;
}
@font-face {
  font-family: "IBM Plex Mono";
  src: url("fonts/IBMPlexMono-Regular.ttf") format("truetype");
  font-weight: 400;
}
@font-face {
  font-family: "IBM Plex Sans";
  src: url("fonts/IBMPlexSans-Bold.ttf") format("truetype");
  font-weight: 700;
}
@font-face {
  font-family: "IBM Plex Sans";
  src: url("fonts/IBMPlexSans-Regular.ttf") format("truetype");
  font-weight: 400;
}
@font-face {
  font-family: "IBM Plex Sans JP";
  src: url("fonts/IBMPlexSansJP-Bold.ttf") format("truetype");
  font-weight: 700;
}
@font-face {
  font-family: "IBM Plex Sans JP";
  src: url("fonts/IBMPlexSansJP-Regular.ttf") format("truetype");
  font-weight: 400;
}
```

| Role | Font | Size | Weight |
|---|---|---|---|
| Heading 1 | IBM Plex Sans | clamp(9rem,28.5vw,25.625rem) | 700 |
| Heading 2 | IBM Plex Sans | 140px | 700 |
| Heading 3 | IBM Plex Sans | clamp(6rem,29vw,8rem) | 700 |
| Body | Lausanne | 20px | 400 |
| Caption | Lausanne | 18px | 400 |
| Code | IBM Plex Mono | 14px | 400 |

**Typographic Rules:**
- Limit to 3 font families max per screen
- Use **IBM Plex Sans** for body/UI text, **Lausanne** for display/headings
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
- Variants: `:scale-102`

**Badge** — `html`

**List** — `html`

### Data Input (2)

**Button** — `html`
- Animation: 

**Input** — `html`
- State: :focus, :placeholder

### Overlay (1)

**Modal** — `html`

### Media (3)

**Image** — `html`

**Icon** — `html`

**Map/Canvas** — `html`



---

## 5. Layout Principles

- **Base spacing unit:** 4px
- **Spacing scale:** 2, 4, 6, 8, 10, 12, 16, 20, 22, 24, 28, 30
- **Border radius:** 0px 0px 12px 12px, .1875rem, .25rem, 2px, 3px, 4px, 6px, 8px, 10px, 12px, 14px, 16px, 18px, 20px, 24px, 28px, 32px, 60px, 100px, clamp(2px,.5vw,6px), 999px, inherit
- **Max content width:** 1023px

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

- `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(255, 255, 255, 0.6) 0px 0px 2px 0px inset`

### Overlay — full-screen overlays, top-level dialogs

- `0 0 30px #1111112c`
- `0 8px 30px #00000014`
- `rgba(0, 0, 0, 0.008) 0px 232px 65px 0px, rgba(0, 0, 0, 0.03) 0px 35px 59px 0px, rgba(0, 0, 0, 0.09) 0px 20px 50px 0px, rgba(0, 0, 0, 0.067) 0px 37px 37px 0px, rgba(0, 0, 0, 0.086) 0px 9px 20px 0px, rgba(0, 0, 0, 0.08) 0px 0px 0px 0px`

### Z-Index Scale

`0, 1, 2, 3, 4, 5, 10, 12, 20, 30, 40, 50, 60, 500`



---

## 7. Animation & Motion

This project uses **expressive motion**. Animations are an integral part of the experience.

### CSS Animations

- `@keyframes skeleton`
- `@keyframes arrow-slide`
- `@keyframes accordion-down`
- `@keyframes accordion-up`
- `@keyframes slideDownAndFade`
- `@keyframes slideLeftAndFade`
- `@keyframes slideUpAndFade`
- `@keyframes slideRightAndFade`

### Animated Components

- **Button**: 

### Motion Guidelines

- Duration: 150-300ms for micro-interactions, 300-500ms for page transitions
- Easing: `ease-out` for enters, `ease-in` for exits
- Always respect `prefers-reduced-motion`


---

## 8. Do's and Don'ts

### Do's

- Use `#0066ff` for interactive elements (buttons, links, focus rings)
- Use `#000000` as the primary page background
- Pair **IBM Plex Sans** (body) with **Lausanne** (display) — these are the only allowed fonts
- Follow the **4px** spacing grid for all margins, padding, and gaps
- Use the defined shadow tokens for elevation — see Section 6
- Use border-radius from the scale: 0px 0px 12px 12px, .1875rem, .25rem, 2px, 3px
- Reuse existing components from Section 4 before creating new ones

### Don'ts

- Don't introduce colors outside this palette — extend the design tokens first
- Don't introduce additional font families beyond IBM Plex Sans and Lausanne and IBM Plex Mono
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
| md | 47.999rem | css |
| xs | 380px | css |
| xs | 480px | css |
| sm | 500px | css |
| md | 767px | css |
| md | 768px | css |
| lg | 860px | css |
| lg | 991px | css |
| lg | 992px | css |
| lg | 1023px | css |
| lg | 1024px | css |
| xl | 1100px | css |
| xl | 1280px | css |
| 2xl | 1360px | css |
| 2xl | 1440px | css |

**Approach:** Use `@media (min-width: ...)` queries matching the breakpoints above.


---

## 10. Agent Prompt Guide

Use these as starting points when building new UI:

### Build a Card

```
Background: #1f1f1d
Border: 1px solid #4a5565
Radius: 16px
Padding: 16px
Font: IBM Plex Sans
Use shadow tokens from Section 6.
```

### Build a Button

```
Primary: bg #0066ff, text white
Ghost: bg transparent, border #4a5565
Padding: 8px 16px
Radius: 16px
Hover: opacity 0.9 or lighter shade
Focus: ring with #0066ff
```

### Build a Page Layout

```
Background: #000000
Max-width: 1023px, centered
Grid: 4px base
Responsive: mobile-first, breakpoints from Section 9
```

### Build a Stats Card

```
Surface: #1f1f1d
Label: #6a7282 (muted, 12px, uppercase)
Value: #ffffff (primary, 24-32px, bold)
Status: use success/warning/danger from Section 2
```

### Build a Form

```
Input bg: #000000
Input border: 1px solid #4a5565
Focus: border-color #0066ff
Label: #6a7282 12px
Spacing: 16px between fields
Radius: 16px
```

### General Component

```
1. Read DESIGN.md Sections 2-6 for tokens
2. Colors: only from palette
3. Font: IBM Plex Sans, type scale from Section 3
4. Spacing: 4px grid
5. Components: match patterns from Section 4
6. Elevation: shadow tokens
```
