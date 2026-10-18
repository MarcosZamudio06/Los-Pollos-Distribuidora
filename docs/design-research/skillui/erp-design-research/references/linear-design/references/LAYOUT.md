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
| `div._5l06ia_container.MwJdiW_root` | column | — | — | — | 3 |
| `main._5l06ia_content` | column | — | — | — | 2 |
| `nav.TZTsQG_menuRoot` | row | — | center | — | 1 |
| `section.dYXc1G_homepagePrefooter` | column | center | center | 40px | 2 |
| `div.ImRUSq_root.ImRUSq_column` | column | — | — | 8px | 2 |
| `div.ImRUSq_root.ImRUSq_column` | column | — | — | 8px | 2 |
| `div.ImRUSq_root.ImRUSq_column` | column | — | — | 8px | 2 |
| `header.qM9FAa_header` | row | space-between | center | — | 2 |
| `header._9Zs8oG_initiativesBoxHeader` | row | — | center | — | 1 |
| `div.ImRUSq_root.ImRUSq_column` | column | — | — | — | 5 |
| `div.ImRUSq_root.ImRUSq_column` | column | — | — | — | 5 |
| `div.ImRUSq_root.ImRUSq_column` | column | — | — | — | 5 |
| `div.ImRUSq_root.ImRUSq_column` | column | — | — | — | 5 |
| `div.Dc5tqa_authorInfoDesktop.ImRUSq_root` | column | — | — | — | 2 |
| `div.Dc5tqa_authorInfoDesktop.ImRUSq_root` | column | — | — | — | 2 |

## Structural Containers

### `<main>` (`main._5l06ia_content`)

```
display:          flex
flex-direction:   column
justify-content:  —
align-items:      —
padding:          72px 0px 0px
children:         2
```

### `<footer>` (`footer.Jmh1Wq_footer`)

```
display:          block
max-width:        100%
children:         1
```

### `<header>` (`header.TZTsQG_header`)

```
display:          block
children:         1
```

### `<nav>` (`nav.TZTsQG_menuRoot`)

```
display:          flex
flex-direction:   row
justify-content:  —
align-items:      center
children:         1
```

### `<section>` (`section.b-30Va_root.b-30Va_rootHomepage`)

```
display:          block
padding:          128px 0px
children:         3
```

### `<section>` (`section.b-30Va_root.b-30Va_rootHomepage`)

```
display:          block
padding:          128px 0px
children:         3
```

### `<section>` (`section.b-30Va_root.b-30Va_rootHomepage`)

```
display:          block
padding:          128px 0px
children:         3
```

### `<section>` (`section.b-30Va_root.b-30Va_rootHomepage`)

```
display:          block
padding:          128px 0px
children:         3
```

### `<section>` (`section#customers.Dc5tqa_container.hide-laptop`)

```
display:          block
children:         3
```

### `<section>` (`section.dYXc1G_homepagePrefooter`)

```
display:          flex
flex-direction:   column
justify-content:  center
align-items:      center
gap:              40px
children:         2
```

### `<header>` (`header.qM9FAa_header`)

```
display:          flex
flex-direction:   row
justify-content:  space-between
align-items:      center
padding:          20px 23px 19px
children:         2
```

### `<header>` (`header._9Zs8oG_initiativesBoxHeader`)

```
display:          flex
flex-direction:   row
justify-content:  —
align-items:      center
padding:          24px 32px 0px
children:         1
```

## Layout Rules

- **Container max-width:** `100%` — always center with `margin: auto`
- Primary layout system: **Flexbox**
- Every spacing value must be a multiple of **4px**
- Never use arbitrary margin/padding values outside the spacing scale

