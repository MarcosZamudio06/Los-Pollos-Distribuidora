# Layout Reference

> Auto-extracted from live DOM. Use this to understand how the site is structured spatially.

## Spacing System

**Base grid:** 4px

**Scale:** `2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30` px

| Spacing | Semantic Use |
|---------|-------------|
| 4px | Tight — within a component |
| 8px | Medium — between sibling items |
| 16px | Wide — between sections |
| 32px | Vast — major section breaks |

## Flex Layouts

| Element | Direction | Justify | Align | Gap | Children |
|---------|-----------|---------|-------|-----|----------|
| `div.row` | row | — | — | — | 2 |
| `div.position-absolute.top-0` | row | center | center | — | 1 |
| `div#s_wd_users_mosaic.d-flex.flex-wrap` | row | space-between | — | — | 60 |
| `div.d-flex.align-items-center` | row | space-between | center | — | 1 |
| `div.row.justify-content-center` | row | center | — | — | 1 |
| `div.row.justify-content-center` | row | center | — | — | 1 |
| `div.row.justify-content-center` | row | center | — | — | 1 |
| `div.row.justify-content-center` | row | center | — | — | 2 |
| `div.row` | row | — | — | — | 2 |
| `div.row.g-0` | row | space-between | — | — | 2 |

## Grid Layouts

| Element | Template Columns | Gap | Children |
|---------|-----------------|-----|----------|
| `div.row.o_grid_mode` | `107.328px 107.328px 107.344px 107.328px 107.328px ` | 0px | 5 |

## Structural Containers

### `<header>` (`header#top.o_no_autohide_menu.o_affix_enabled`)

```
display:          block
children:         2
```

### `<main>` 

```
display:          block
children:         2
```

### `<footer>` (`footer#bottom.o_footer.o_colored_level`)

```
display:          block
children:         2
```

### `<section>` (`section.pt-5.pb-6`)

```
display:          block
padding:          48px 0px 64px
children:         1
```

### `<section>` (`section.bg-200.o_colored_level`)

```
display:          block
padding:          64px 0px
children:         3
```

### `<section>` (`section.bg-200.o_colored_level`)

```
display:          block
padding:          0px 0px 64px
children:         1
```

### `<section>` (`section.bg-200.o_colored_level`)

```
display:          block
padding:          64px 0px 0px
children:         1
```

### `<section>` (`section.bg-200.o_colored-level`)

```
display:          block
padding:          0px 0px 192px
children:         1
```

### `<section>` (`section.bg-200.py-5`)

```
display:          block
padding:          96px 0px
children:         2
```

### `<section>` (`section.text-lg-center.pb-5`)

```
display:          block
padding:          96px 0px 48px
children:         1
```

### `<section>` (`section.s_wd_features.py-5`)

```
display:          block
padding:          96px 0px
children:         1
```

### `<section>` (`section.s_wd_users`)

```
display:          block
children:         1
```

## Layout Rules

- **Container max-width:** `1320px` — always center with `margin: auto`
- Primary layout system: **Flexbox**
- Secondary layout system: **CSS Grid** (used for card grids and multi-column layouts)
- Every spacing value must be a multiple of **4px**
- Never use arbitrary margin/padding values outside the spacing scale

