# Layout Reference

> Auto-extracted from live DOM. Use this to understand how the site is structured spatially.

## Spacing System

**Base grid:** 4px

**Scale:** `2, 4, 6, 8, 10, 12, 16, 20, 22, 24, 28, 30, 32, 36, 40` px

| Spacing | Semantic Use |
|---------|-------------|
| 4px | Tight — within a component |
| 8px | Medium — between sibling items |
| 16px | Wide — between sections |
| 32px | Vast — major section breaks |

## Flex Layouts

| Element | Direction | Justify | Align | Gap | Children |
|---------|-----------|---------|-------|-----|----------|
| `div.flex.flex-col` | column | — | — | — | 1 |
| `div.fixed.top-0` | column | space-between | — | — | 3 |
| `div.body-s.relative` | row | center | center | — | 2 |
| `div.relative.mx-auto` | row | — | center | — | 2 |
| `section.PersonalizeClient-module__bf7S1a__focusExperience.re` | column | center | — | — | 1 |
| `div.hidden.w-full` | row | space-between | center | — | 2 |
| `div.mt-6.flex` | row | — | center | 12px | 2 |
| `div.sticky.top-[var(--nav-height)]` | row | center | center | — | 1 |
| `div.flex.flex-col` | column | — | — | 128px | 4 |
| `div.flex.flex-col` | row | space-between | center | 24px | 3 |
| `div.mt-6.flex` | row | center | — | — | 1 |
| `div.flex.flex-col` | column | — | center | — | 2 |
| `div.flex.min-w-0` | row | — | center | 16px | 2 |
| `div.flex.items-center` | row | — | center | 16px | 1 |

## Grid Layouts

| Element | Template Columns | Gap | Children |
|---------|-----------------|-----|----------|
| `section.relative.isolate` | `1440px` | — | 2 |
| `div.grid.grid-cols-1` | `198.656px 198.672px 198.672px 198.656px 198.672px ` | 48px 24px | 9 |
| `div.mt-8.md:mt-12` | `644px 644px` | 24px | 2 |
| `div.mt-6.grid` | `421.328px 421.328px 421.344px` | 24px | 3 |
| `div.grid.grid-cols-1` | `644px 644px` | 24px | 2 |
| `div.grid.gap-px` | `162.875px 162.875px 162.875px 162.875px 162.875px ` | 1px | 13 |
| `div.grid.grid-cols-1` | `533px 755px` | 24px | 3 |
| `div.grid.grid-cols-1` | `755px 533px` | 24px | 3 |
| `div.grid.grid-cols-1` | `533px 755px` | 24px | 3 |

## Structural Containers

### `<nav>` 

```
display:          block
children:         2
```

### `<main>` 

```
display:          block
children:         2
```

### `<footer>` (`footer.relative`)

```
display:          block
children:         2
```

### `<header>` (`header.fixed.inset-x-0`)

```
display:          block
children:         2
```

### `<section>` (`section.relative`)

```
display:          block
children:         3
```

### `<section>` 

```
display:          block
children:         1
```

### `<section>` (`section.hidden.spacer-t-l`)

```
display:          block
children:         1
```

### `<section>` (`section.spacer-t-l`)

```
display:          block
children:         1
```

### `<section>` (`section.relative.isolate`)

```
display:          grid
grid-template-columns: 1440px
padding:          128px 0px
children:         2
```

### `<section>` (`section.spacer-t-l`)

```
display:          block
children:         1
```

### `<section>` (`section.mt-10.md:spacer-t-l`)

```
display:          block
children:         1
```

### `<section>` (`section.spacer-t-l`)

```
display:          block
children:         1
```

## Layout Rules

- **Container max-width:** `1440px` — always center with `margin: auto`
- Primary layout system: **Flexbox**
- Secondary layout system: **CSS Grid** (used for card grids and multi-column layouts)
- Every spacing value must be a multiple of **4px**
- Never use arbitrary margin/padding values outside the spacing scale

