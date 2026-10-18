# Interaction Reference

> Micro-interactions extracted from live DOM. Recreate these exactly for authentic feel.

## Coverage

| Component Type | Count | States Captured |
|----------------|-------|----------------|
| Button | 3 | default, hover, focus |
| Link | 3 | default, hover, focus |
| Input | 3 | default, hover, focus |

## Transition System

These transition declarations were extracted from interactive elements:

```css
transition: all;
transition: color 0.24s cubic-bezier(0.45, 0.05, 0.55, 0.95);
transition: color 0.15s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), outline-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), fill 0.15s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-from 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-via 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1);
```

Apply these to all interactive elements. Never invent new durations or easings.

## Button Interactions

### Button 1 — `button`

**States:**

- Default: `../screens/states/button-1-default.png`
- Hover: `../screens/states/button-1-hover.png`
- Focus: `../screens/states/button-1-focus.png`

**On focus:**

```css
/* outline: lab(100 0 0) none 3px → */ outline: rgb(0, 95, 204) none 1px;
/* outline-color: lab(100 0 0) → */ outline-color: rgb(0, 95, 204);
```

**Transition:** `all`

### Button 2 — `Products`

**States:**

- Default: `../screens/states/button-2-default.png`
- Hover: `../screens/states/button-2-hover.png`
- Focus: `../screens/states/button-2-focus.png`

**On focus:**

```css
/* outline: lab(2.83994 0.367254 0.969091) none 3px → */ outline: rgb(0, 95, 204) none 1px;
/* outline-color: lab(2.83994 0.367254 0.969091) → */ outline-color: rgb(0, 95, 204);
```

**Transition:** `color 0.24s cubic-bezier(0.45, 0.05, 0.55, 0.95)`

### Button 3 — `Solutions`

**States:**

- Default: `../screens/states/button-3-default.png`
- Hover: `../screens/states/button-3-hover.png`
- Focus: `../screens/states/button-3-focus.png`

**On hover:**

```css
/* color: oklab(0.1465 0.00202257 0.00533167 / 0.951624) → */ color: lab(2.83994 0.367254 0.969091);
/* border-color: oklab(0.1465 0.00202257 0.00533167 / 0.951624) → */ border-color: lab(2.83994 0.367254 0.969091);
/* outline: oklab(0.1465 0.00202257 0.00533167 / 0.951624) none 3px → */ outline: lab(2.83994 0.367254 0.969091) none 3px;
/* outline-color: oklab(0.1465 0.00202257 0.00533167 / 0.951624) → */ outline-color: lab(2.83994 0.367254 0.969091);
```

**On focus:**

```css
/* color: oklab(0.1465 0.00202257 0.00533167 / 0.951624) → */ color: lab(2.83994 0.367254 0.969091);
/* border-color: oklab(0.1465 0.00202257 0.00533167 / 0.951624) → */ border-color: lab(2.83994 0.367254 0.969091);
/* outline: oklab(0.1465 0.00202257 0.00533167 / 0.951624) none 3px → */ outline: rgb(0, 95, 204) none 1px;
/* outline-color: oklab(0.1465 0.00202257 0.00533167 / 0.951624) → */ outline-color: rgb(0, 95, 204);
```

**Transition:** `color 0.24s cubic-bezier(0.45, 0.05, 0.55, 0.95)`

## Link Interactions

### Link 1 — `Switch to the Mexico site`

**States:**

- Default: `../screens/states/link-1-default.png`
- Hover: `../screens/states/link-1-hover.png`
- Focus: `../screens/states/link-1-focus.png`

**On focus:**

```css
/* outline: lab(100 0 0) none 3px → */ outline: rgb(0, 95, 204) auto 1px;
/* outline-color: lab(100 0 0) → */ outline-color: rgb(0, 95, 204);
```

**Transition:** `all`

### Link 2 — `a`

**States:**

- Default: `../screens/states/link-2-default.png`
- Hover: `../screens/states/link-2-hover.png`
- Focus: `../screens/states/link-2-focus.png`

**On focus:**

```css
/* outline: lab(2.83994 0.367254 0.969091) none 3px → */ outline: rgb(0, 95, 204) auto 1px;
/* outline-color: lab(2.83994 0.367254 0.969091) → */ outline-color: rgb(0, 95, 204);
```

**Transition:** `all`

### Link 3 — `How Notion uses Ramp
See how Notion save`

**States:**

- Default: `../screens/states/link-3-default.png`
- Hover: `../screens/states/link-3-hover.png`
- Focus: `../screens/states/link-3-focus.png`

**On focus:**

```css
/* outline: lab(2.83994 0.367254 0.969091) none 3px → */ outline: rgb(0, 95, 204) none 1px;
/* outline-color: lab(2.83994 0.367254 0.969091) → */ outline-color: rgb(0, 95, 204);
```

**Transition:** `all`

## Input Interactions

### Input 1 — `Enter your work email`

**States:**

- Default: `../screens/states/input-1-default.png`
- Hover: `../screens/states/input-1-hover.png`
- Focus: `../screens/states/input-1-focus.png`

**On focus:**

```css
/* border-color: rgba(33, 33, 33, 0.1) → */ border-color: rgba(33, 33, 33, 0.2);
/* outline: lab(2.83994 0.367254 0.969091) none 3px → */ outline: rgb(0, 95, 204) solid 0px;
/* outline-color: lab(2.83994 0.367254 0.969091) → */ outline-color: rgb(0, 95, 204);
```

**Transition:** `color 0.15s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), outline-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), fill 0.15s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-from 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-via 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1)`

### Input 2 — `Enter your work email`

**States:**

- Default: `../screens/states/input-2-default.png`
- Hover: `../screens/states/input-2-hover.png`
- Focus: `../screens/states/input-2-focus.png`

**On focus:**

```css
/* border-color: rgba(33, 33, 33, 0.1) → */ border-color: rgba(33, 33, 33, 0.2);
/* outline: lab(2.83994 0.367254 0.969091) none 3px → */ outline: rgb(0, 95, 204) solid 0px;
/* outline-color: lab(2.83994 0.367254 0.969091) → */ outline-color: rgb(0, 95, 204);
```

**Transition:** `color 0.15s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), outline-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), fill 0.15s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-from 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-via 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1)`

### Input 3 — `Enter your work email`

**States:**

- Default: `../screens/states/input-3-default.png`
- Hover: `../screens/states/input-3-hover.png`
- Focus: `../screens/states/input-3-focus.png`

**On focus:**

```css
/* border-color: rgba(255, 255, 255, 0.3) → */ border-color: rgba(255, 255, 255, 0.4);
/* outline: lab(100 0 0) none 3px → */ outline: rgb(0, 95, 204) solid 0px;
/* outline-color: lab(100 0 0) → */ outline-color: rgb(0, 95, 204);
```

**Transition:** `color 0.15s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), outline-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 0.15s cubic-bezier(0.4, 0, 0.2, 1), fill 0.15s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-from 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-via 0.15s cubic-bezier(0.4, 0, 0.2, 1), --tw-gradient-to 0.15s cubic-bezier(0.4, 0, 0.2, 1)`

## Interaction Rules

- Accent color `#0066ff` is used for focus rings, active states, and hover highlights
- Hover effects include **color transitions** — use the extracted values, not approximations
- Focus states use **outline** (not box-shadow) — always match the extracted focus ring
- Transition durations in use: `0.24s`, `0.15s`
- Always respect `prefers-reduced-motion` — set all transitions to `0s` when enabled

