# odoo DESIGN.md

> Auto-generated design system — reverse-engineered via static analysis by skillui.
> Frameworks: None detected
> Colors: 20 · Fonts: 3 · Components: 11
> Icon library: not detected · State: not detected
> Primary theme: dark · Dark mode toggle: no · Motion: expressive

## Visual Reference

**Match this design exactly** — study colors, fonts, spacing, and component shapes before writing any UI code.

![odoo Homepage](../screenshots/homepage.png)

---

## 1. Visual Theme & Atmosphere

This is a **dark-themed** interface with a warm tone. Depth is expressed through layered shadows and subtle surface color variation. Typography pairs **odoo_ui_icons** for display/headings with **MarshmallowIcons** for body text, creating clear visual hierarchy through type contrast. Spacing follows a **4px base grid** (compact density), with scale: 2, 4, 6, 8, 10, 12, 14, 16px. The accent color **#ffc107** anchors interactive elements (buttons, links, focus rings). Motion is expressive — spring physics, layout animations, and staggered reveals are part of the visual language.

---

## 2. Color Palette & Roles

| Token | Hex | Role | Use |
|---|---|---|---|
| o-cc4-btn-primary | `#111827` | background | Page background, darkest surface |
| emphasis-color | `#000000` | surface | Card and panel backgrounds |
| o-cc5-btn-secondary | `#f8f9fa` | text-primary | Headings and body text |
| body-color | `#374151` | text-muted | Captions, placeholders, secondary info |
| light-text-emphasis | `#495057` | border | Dividers, card borders, outlines |
| warning | `#ffc107` | accent | CTAs, links, focus rings, active states |
| danger | `#dc3545` | danger | Error states, destructive actions |
| success | `#28a745` | success | Success states, positive indicators |
| o-color-7 | `#fbb130` | warning | Warning states, caution indicators |
| o-color-2 | `#017e84` | info | Informational highlights |
| o-color-1 | `#714b67` | unknown | Palette color |
| primary-bg-subtle | `#e3dbe1` | unknown | Palette color |
| dark-border-subtle | `#adb5bd` | unknown | Palette color |
| pagination-hover-border-color | `#e7e8e9` | unknown | Palette color |
| btn-disabled-color | `#6c757d` | unknown | Palette color |
| btn-hover-border-color | `#5a3c52` | unknown | Palette color |
| primary-text-emphasis | `#65435c` | unknown | Palette color |
| unknown | `#03f9e3` | unknown | Palette color |
| background-color | `#222933` | unknown | Palette color |
| table-border-color | `#caccd0` | unknown | Palette color |

### CSS Variable Tokens

```css
--o-cc5-btn-secondary-border: ;
--o-cc5-btn-secondary: #f8f9fa;
--o-cc5-btn-primary-border: ;
--o-cc5-btn-primary: ;
--o-cc4-btn-secondary-border: ;
--o-cc4-btn-secondary: #f8f9fa;
--o-cc4-btn-primary-border: ;
--o-cc4-btn-primary: #111827;
--o-cc3-btn-secondary-border: ;
--o-cc3-btn-secondary: #f8f9fa;
--o-cc3-btn-primary-border: ;
--o-cc3-btn-primary: ;
--o-cc2-btn-secondary-border: ;
--o-cc2-btn-secondary: ;
--o-cc2-btn-primary-border: ;
--o-cc2-btn-primary: ;
--o-cc1-btn-secondary-border: ;
--o-cc1-btn-secondary: ;
--o-cc1-btn-primary-border: ;
--o-cc1-btn-primary: ;
```


---

## 3. Typography Rules

**Font Stack:**
- **MarshmallowIcons** — Heading 1, Heading 2, Heading 3
- **odoo_ui_icons** — Body, Caption
- **SFMono-Regular** — Code

**Font Sources:**

```css
@font-face {
  font-family: "odoo_ui_icons";
  src: url("https://odoocdn.com/web/assets/ef84e3c/web.odoo_ui_icons.min.woff2") format("woff2");
  font-weight: 400;
}
@font-face {
  font-family: "MarshmallowIcons";
  src: url("https://odoocdn.com/openerp_website/static/src/fonts/MarshmallowIcons.woff2") format("woff2");
  font-weight: 900;
}
@font-face {
  font-family: "Inter";
  src: url("https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjQ.ttf") format("truetype");
  font-weight: 400;
}
@font-face {
  font-family: "Caveat";
  src: url("https://fonts.gstatic.com/s/caveat/v23/WnznHAc5bAfYB2QRah7pcpNvOx-pjRV6eIWpZA.ttf") format("truetype");
  font-weight: 700;
}
```

| Role | Font | Size | Weight |
|---|---|---|---|
| Heading 1 | MarshmallowIcons | 128px | 700 |
| Heading 2 | MarshmallowIcons | 112px | 700 |
| Heading 3 | MarshmallowIcons | 96px | 700 |
| Body | odoo_ui_icons | 1rem | 400 |
| Caption | odoo_ui_icons | 0.875rem | 400 |
| Code | SFMono-Regular | 14px | 400 |

**Typographic Rules:**
- Limit to 3 font families max per screen
- Use **MarshmallowIcons** for body/UI text, **odoo_ui_icons** for display/headings
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
- Variants: `body`

**Badge** — `html`

**List** — `html`

### Data Input (2)

**Button** — `html`
- Variants: `sm`, `outline-secondary`, `close`, `link`, `primary`
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
- **Spacing scale:** 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24
- **Border radius:** inherit, 0.0rem, 0px 0px 11px 11px, .1em, 0.25rem, 0.3rem, 0.375rem, 0.4rem, 0.5rem, 0.625rem, 0.75rem, .75rem, 1rem, 1.2em, 1.25rem, 1.5rem, 2em, 2px, 3rem, 3px, 4px, 4.8px, 5px, 6px, 6.4px, 8rem, 8px, 10rem, 11px 11px 0px 0px, 12px, 20px, 22px, 50rem, 62.5rem, 100px, , 25px, 32px, 100em, 100%, 800px, 999px
- **Max content width:** 991.98px

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

- `inset 0 0 0 1px #714b67`
- `inset 0 0 0 1px rgba(var(--border-rgb),0.5)`
- `inset 0 0 0 1px rgba(255,255,255,0.9)`

### Raised — cards, buttons, interactive elements

- `inherit`
- `0 0 0 0.25rem rgba(113,75,103,0.25)`
- `0 0 0 2px #fff,0 0 0 3px #714b67`

### Floating — dropdowns, popovers, modals

- `0 0 5px 10px rgba(240,8,0,0.4)`
- `0 6px 10px 0 rgba(0,0,0,0.1),0 2px 2px 0 rgba(0,0,0,0.05)`
- `0 0 20px rgba(0,0,0,0.25)`

### Overlay — full-screen overlays, top-level dialogs

- `inset 0 0 0 9999px var(--table-bg-state,var(--table-bg-type,var(--table-accent-bg)))`
- `0 0 40px #000000`
- `0 0 40px 2px rgba(var(--TourPointer__border-color-rgb),0.5)`

### Z-Index Scale

`0, 1, 2, 3, 4, 5, 6, 7, 10, 19, 20, 21, 99, 100, 999, 1000, 1001, 1020, 1029, 1030, 1031, 1040, 1044, 1045, 1046, 1049, 1050, 1054, 1055, 1056, 1057, 1070, 1080, 1090, 1095, 2000, 2147483647`



---

## 7. Animation & Motion

This project uses **expressive motion**. Animations are an integral part of the experience.

### CSS Animations

- `@keyframes animate-red`
- `@keyframes progress-bar-stripes`
- `@keyframes spinner-border`
- `@keyframes spinner-grow`
- `@keyframes placeholder-glow`
- `@keyframes placeholder-wave`
- `@keyframes fa-spin`
- `@keyframes bounceIn`

### Animated Components

- **Button**: 

### Motion Guidelines

- Duration: 150-300ms for micro-interactions, 300-500ms for page transitions
- Easing: `ease-out` for enters, `ease-in` for exits
- Always respect `prefers-reduced-motion`


---

## 8. Do's and Don'ts

### Do's

- Use `#ffc107` for interactive elements (buttons, links, focus rings)
- Use `#111827` as the primary page background
- Pair **MarshmallowIcons** (body) with **odoo_ui_icons** (display) — these are the only allowed fonts
- Follow the **4px** spacing grid for all margins, padding, and gaps
- Use the defined shadow tokens for elevation — see Section 6
- Use border-radius from the scale: inherit, 0.0rem, 0px 0px 11px 11px, .1em, 0.25rem
- Reuse existing components from Section 4 before creating new ones

### Don'ts

- Don't introduce colors outside this palette — extend the design tokens first
- Don't introduce additional font families beyond MarshmallowIcons and odoo_ui_icons and SFMono-Regular
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
| xs | 340px | css |
| xs | 476px | css |
| xs | 480px | css |
| sm | 575.98px | css |
| sm | 576px | css |
| sm | 600px | css |
| md | 650px | css |
| md | 651px | css |
| md | 767px | css |
| md | 767.98px | css |
| md | 768px | css |
| lg | 769px | css |
| lg | 770px | css |
| lg | 991px | css |
| lg | 991.98px | css |
| lg | 992px | css |
| lg | 1024px | css |
| xl | 1199.98px | css |
| xl | 1200px | css |
| 2xl | 1399.98px | css |
| 2xl | 1400px | css |
| 2xl | 1900px | css |
| 2xl | 1920px | css |

**Approach:** Use `@media (min-width: ...)` queries matching the breakpoints above.


---

## 10. Agent Prompt Guide

Use these as starting points when building new UI:

### Build a Card

```
Background: #000000
Border: 1px solid #495057
Radius: 4.8px
Padding: 16px
Font: MarshmallowIcons
Use shadow tokens from Section 6.
```

### Build a Button

```
Primary: bg #ffc107, text white
Ghost: bg transparent, border #495057
Padding: 8px 16px
Radius: 4.8px
Hover: opacity 0.9 or lighter shade
Focus: ring with #ffc107
```

### Build a Page Layout

```
Background: #111827
Max-width: 991.98px, centered
Grid: 4px base
Responsive: mobile-first, breakpoints from Section 9
```

### Build a Stats Card

```
Surface: #000000
Label: #374151 (muted, 12px, uppercase)
Value: #f8f9fa (primary, 24-32px, bold)
Status: use success/warning/danger from Section 2
```

### Build a Form

```
Input bg: #111827
Input border: 1px solid #495057
Focus: border-color #ffc107
Label: #374151 12px
Spacing: 16px between fields
Radius: 4.8px
```

### General Component

```
1. Read DESIGN.md Sections 2-6 for tokens
2. Colors: only from palette
3. Font: MarshmallowIcons, type scale from Section 3
4. Spacing: 4px grid
5. Components: match patterns from Section 4
6. Elevation: shadow tokens
```
