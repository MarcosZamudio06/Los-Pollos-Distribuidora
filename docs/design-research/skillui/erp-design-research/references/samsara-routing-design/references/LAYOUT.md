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
| `div#ketch-banner.ketch-fixed.ketch-flex` | row | — | — | — | 1 |
| `div#ketch-consent-banner.ketch-w-full.ketch-flex` | column | stretch | — | — | 1 |
| `div.ketch-flex.ketch-max-h-full` | column | — | — | — | 2 |
| `div#header-cont-2.text--all-white.mx-1/12` | row | space-between | center | — | 2 |
| `div#ketch-banner-content.ketch-flex.ketch-max-h-full` | row | space-between | center | 32px | 2 |
| `section#2jCxQBcfowHc31OKWTXace.accordions__base-accordion.re` | column | — | — | — | 10 |
| `div#ketch-banner-buttons-container-standard.ketch-w-full.ket` | row | — | end | 12px | 3 |
| `div.flex.w-full` | row | — | — | — | 2 |
| `div.ketch-flex.ketch-flex-1` | column | — | — | 16px | 2 |
| `div.flex.flex-col` | row | — | — | 40px | 2 |
| `div.mt-s80.flex` | row | — | — | 40px | 2 |
| `div.columns-wrapper.flex` | row | — | — | — | 2 |
| `div.columns-wrapper.flex` | row | — | — | — | 2 |
| `div.columns-wrapper.flex` | row | — | — | — | 2 |
| `div.columns-wrapper.flex` | row | — | — | — | 1 |

## Structural Containers

### `<main>` (`main#main-content`)

```
display:          block
children:         10
```

### `<footer>` (`footer#site-footer.footer-redesign.relative`)

```
display:          block
children:         3
```

### `<section>` (`section#7IQ84gDvtqAuQpyyUq7Uf1.pt-s70.md:pt-s50`)

```
display:          block
padding:          40px 0px 80px
children:         2
```

### `<section>` (`section#2jCxQBcfowHc31OKWTXace.accordions__base-accordion.re`)

```
display:          flex
flex-direction:   column
justify-content:  —
align-items:      —
padding:          64px 24px 96px
max-width:        942px
children:         10
```

### `<section>` (`section.bg-gray-50`)

```
display:          block
children:         1
```

### `<nav>` (`nav.top-s20.tn--nav`)

```
display:          block
padding:          0px 24px
children:         1
```

## Layout Rules

- **Container max-width:** `942px` — always center with `margin: auto`
- Primary layout system: **Flexbox**
- Every spacing value must be a multiple of **4px**
- Never use arbitrary margin/padding values outside the spacing scale

