# Interaction Reference

> Micro-interactions extracted from live DOM. Recreate these exactly for authentic feel.

## Coverage

| Component Type | Count | States Captured |
|----------------|-------|----------------|
| Button | 1 | default, hover, focus |
| Link | 3 | default, focus, hover |
| Input | 3 | default, hover, focus |

## Transition System

These transition declarations were extracted from interactive elements:

```css
transition: color 0.15s ease-in-out, background-color 0.15s ease-in-out, border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
transition: all;
transition: color 0.15s ease-in-out, background-color 0.15s ease-in-out, border-color 0.15s ease-in-out;
transition: background-position 0.15s ease-in-out;
transition: opacity 0.2s;
```

Apply these to all interactive elements. Never invent new durations or easings.

## Button Interactions

### Button 1 — `English`

**States:**

- Default: `../screens/states/button-1-default.png`
- Hover: `../screens/states/button-1-hover.png`
- Focus: `../screens/states/button-1-focus.png`

**On focus:**

```css
/* color: rgb(173, 181, 189) → */ color: rgb(255, 255, 255);
/* border-color: rgb(173, 181, 189) → */ border-color: rgb(255, 255, 255);
/* outline: rgb(173, 181, 189) none 3px → */ outline: rgb(255, 255, 255) none 0px;
/* outline-color: rgb(173, 181, 189) → */ outline-color: rgb(255, 255, 255);
```

**Transition:** `color 0.15s ease-in-out, background-color 0.15s ease-in-out, border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out`

## Link Interactions

### Link 1 — `Odoo`

**States:**

- Default: `../screens/states/link-1-default.png`
- Focus: `../screens/states/link-1-focus.png`

**On focus:**

```css
/* color: rgb(55, 65, 81) → */ color: rgb(17, 24, 39);
/* border-color: rgb(55, 65, 81) → */ border-color: rgb(17, 24, 39);
/* outline: rgb(55, 65, 81) none 3px → */ outline: rgb(17, 24, 39) none 3px;
/* outline-color: rgb(55, 65, 81) → */ outline-color: rgb(17, 24, 39);
```

**Transition:** `all`

### Link 2 — `Sign in`

**States:**

- Default: `../screens/states/link-2-default.png`
- Focus: `../screens/states/link-2-focus.png`

**On focus:**

```css
/* color: rgb(55, 65, 81) → */ color: rgb(17, 24, 39);
/* border-color: rgb(55, 65, 81) → */ border-color: rgb(17, 24, 39);
/* box-shadow: none → */ box-shadow: rgba(113, 75, 103, 0.25) 0px 0px 0px 4px;
/* outline: rgb(55, 65, 81) none 3px → */ outline: rgb(17, 24, 39) none 3px;
/* outline-color: rgb(55, 65, 81) → */ outline-color: rgb(17, 24, 39);
```

**Transition:** `color 0.15s ease-in-out, background-color 0.15s ease-in-out, border-color 0.15s ease-in-out`

### Link 3 — `Try it free`

**States:**

- Default: `../screens/states/link-3-default.png`
- Hover: `../screens/states/link-3-hover.png`
- Focus: `../screens/states/link-3-focus.png`

**On hover:**

```css
/* background-color: rgb(113, 75, 103) → */ background-color: rgb(96, 64, 88);
/* border-color: rgb(113, 75, 103) → */ border-color: rgb(90, 60, 82);
```

**On focus:**

```css
/* background-color: rgb(113, 75, 103) → */ background-color: rgb(96, 64, 88);
/* border-color: rgb(113, 75, 103) → */ border-color: rgb(90, 60, 82);
/* box-shadow: none → */ box-shadow: rgba(134, 102, 126, 0.5) 0px 0px 0px 4px;
/* outline: rgb(255, 255, 255) none 3px → */ outline: rgb(255, 255, 255) none 0px;
```

**Transition:** `color 0.15s ease-in-out, background-color 0.15s ease-in-out, border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out`

## Input Interactions

### Input 1 — `checkbox`

**States:**

- Default: `../screens/states/input-1-default.png`
- Hover: `../screens/states/input-1-hover.png`
- Focus: `../screens/states/input-1-focus.png`

**On hover:**

```css
/* border-color: color(srgb 0.0666667 0.0941176 0.152941 / 0.15) → */ border-color: rgb(113, 75, 103);
```

**On focus:**

```css
/* border-color: color(srgb 0.0666667 0.0941176 0.152941 / 0.15) → */ border-color: rgb(184, 165, 179);
/* box-shadow: none → */ box-shadow: rgba(113, 75, 103, 0.25) 0px 0px 0px 4px;
/* outline: rgb(17, 24, 39) none 3px → */ outline: rgb(17, 24, 39) none 0px;
```

**Transition:** `background-position 0.15s ease-in-out`

### Input 2 — `range`

**States:**

- Default: `../screens/states/input-2-default.png`
- Hover: `../screens/states/input-2-hover.png`
- Focus: `../screens/states/input-2-focus.png`

**Transition:** `opacity 0.2s`

_No visible style changes detected for this element._

### Input 3 — `range`

**States:**

- Default: `../screens/states/input-3-default.png`
- Hover: `../screens/states/input-3-hover.png`
- Focus: `../screens/states/input-3-focus.png`

**Transition:** `opacity 0.2s`

_No visible style changes detected for this element._

## Interaction Rules

- Accent color `#ffc107` is used for focus rings, active states, and hover highlights
- Hover effects include **color transitions** — use the extracted values, not approximations
- Focus states use **outline** (not box-shadow) — always match the extracted focus ring
- Transition durations in use: `0.15s`, `0.2s`
- Always respect `prefers-reduced-motion` — set all transitions to `0s` when enabled

