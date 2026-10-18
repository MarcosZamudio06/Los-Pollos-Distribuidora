# Component Reference

> Repeated DOM patterns detected by structural analysis. Each component appeared 3+ times.

## Detected Components

| Component | Category | Instances | Key Classes |
|-----------|----------|-----------|-------------|
| **Block** | card | 9× | `.block`, `.card`, `.flex` |
| **Px Gap2** | unknown | 5× | `.px-gap2`, `.row-container`, `.w-full` |
| **!Ketch Border [  K Banner Buttons Tertiary Background Color]** | button | 3× | `.!ketch-border-[--k-banner-buttons-tertiary-background-color]`, `.!ketch-outline-2`, `.!ketch-outline-ketch-black-black-100` |
| **Group/Row** | unknown | 3× | `.group/row`, `.row` |
| **C  Collection Card** | card | 3× | `.c--collection-card`, `.card`, `.card--collection-card` |
| **Card Logo Container** | card | 3× | `.card-logo-container` |
| **Card Image** | card | 3× | `.card-image`, `.flex`, `.items-start` |
| **H Full** | unknown | 3× | `.h-full`, `.image--wrapper`, `.w-full` |
| **Mb Gap** | unknown | 3× | `.mb-gap`, `.overflow-hidden`, `.rounded-[5px]` |
| **Block** | unknown | 3× | `.block`, `.image`, `.overflow-hidden` |
| **H Full** | unknown | 3× | `.h-full`, `.object-contain`, `.w-full` |
| **Card Content** | card | 3× | `.card-content`, `.h-full` |
| **Rc  Rich Content** | card | 3× | `.rc__rich-content`, `.type--card-headings` |
| **Ds Nav Item** | card | 3× | `.ds-nav-item`, `.duration-300`, `.ease-out` |
| **Cursor Pointer** | unknown | 3× | `.cursor-pointer`, `.flex`, `.flex-col` |
| **Font Normal** | unknown | 3× | `.font-normal` |
| **Not Last:Mb Gap2** | unknown | 3× | `.not-last:mb-gap2`, `.px-s25`, `.w-full` |
| **Block** | unknown | 3× | `.block`, `.content-module__text`, `.relative` |
| **Rc  Rich Content** | unknown | 3× | `.rc__rich-content`, `.relative` |
| **Benefits Card** | card | 3× | `.benefits-card`, `.border-black`, `.border-t` |

## Cards

### Block

**Instances found:** 9

**CSS classes:** `.block` `.card` `.flex` `.flex-col` `.h-auto` `.li-list-item`

**HTML structure:**

```html
<div class="li-list-item relative flex flex-col card mb-0 pb-space1 md:mb-1 h-auto lg:w-[calc(33.333333%_-_13.333333px)] md:w-[calc(33.333333%_-_13.333333px)] w-full block text-left transition-all" list-item-data-id="0" data-v-4bbbf889="" data-v-84bc0525=""><div class="c--collection-card relative flex h-full flex-col rounded-[5px] transition-all duration-300 ease-in-out card card--collection-card" data-v-84bc0525="" data-v-388550e2=""><div class="card-logo-container" data-v-388550e2=""><div class="card-image flex items-start" data-v-388550e2=""><div class="image--wrapper h-full w-full" data-v-
```

**Base styles (from design tokens):**

```css
.block {
  background: #f5f4f1;
  border: 1px solid #403d37;
  border-radius: 5px;
  padding: 8px;
}```

### C  Collection Card

**Instances found:** 3

**CSS classes:** `.c--collection-card` `.card` `.card--collection-card` `.duration-300` `.ease-in-out` `.flex`

**HTML structure:**

```html
<div class="c--collection-card relative flex h-full flex-col rounded-[5px] transition-all duration-300 ease-in-out card card--collection-card" data-v-84bc0525="" data-v-388550e2=""><div class="card-logo-container" data-v-388550e2=""><div class="card-image flex items-start" data-v-388550e2=""><div class="image--wrapper h-full w-full" data-v-388550e2=""><div class="mb-gap overflow-hidden rounded-[5px]" data-v-388550e2=""><span class="whitespace-normal image block overflow-hidden rounded-[5px]" data-v-388550e2=""><picture class="contents" data-not-lazy=""><source data-not-lazy="" type="image/avif
```

**Base styles (from design tokens):**

```css
.c--collection-card {
  background: #f5f4f1;
  border: 1px solid #403d37;
  border-radius: 5px;
  padding: 8px;
}```

### Card Logo Container

**Instances found:** 3

**CSS classes:** `.card-logo-container`

**HTML structure:**

```html
<div class="card-logo-container" data-v-388550e2=""><div class="card-image flex items-start" data-v-388550e2=""><div class="image--wrapper h-full w-full" data-v-388550e2=""><div class="mb-gap overflow-hidden rounded-[5px]" data-v-388550e2=""><span class="whitespace-normal image block overflow-hidden rounded-[5px]" data-v-388550e2=""><picture class="contents" data-not-lazy=""><source data-not-lazy="" type="image/avif" sizes="(max-width: 768px) 768px, 1352px" srcset="//images.ctfassets.net/bx9krvy0u3sx/1Wexrj8MAkHQaKSXH1MBsQ/5eb4608a35cc34b585679fe8bd847196/Route-Planning.png?w=320&amp;fm=avif&a
```

**Base styles (from design tokens):**

```css
.card-logo-container {
  background: #f5f4f1;
  border: 1px solid #403d37;
  border-radius: 5px;
  padding: 8px;
}```

### Card Image

**Instances found:** 3

**CSS classes:** `.card-image` `.flex` `.items-start`

**HTML structure:**

```html
<div class="card-image flex items-start" data-v-388550e2=""><div class="image--wrapper h-full w-full" data-v-388550e2=""><div class="mb-gap overflow-hidden rounded-[5px]" data-v-388550e2=""><span class="whitespace-normal image block overflow-hidden rounded-[5px]" data-v-388550e2=""><picture class="contents" data-not-lazy=""><source data-not-lazy="" type="image/avif" sizes="(max-width: 768px) 768px, 1352px" srcset="//images.ctfassets.net/bx9krvy0u3sx/1Wexrj8MAkHQaKSXH1MBsQ/5eb4608a35cc34b585679fe8bd847196/Route-Planning.png?w=320&amp;fm=avif&amp;q=80 320w, //images.ctfassets.net/bx9krvy0u3sx/1W
```

**Base styles (from design tokens):**

```css
.card-image {
  background: #f5f4f1;
  border: 1px solid #403d37;
  border-radius: 5px;
  padding: 8px;
}```

### Card Content

**Instances found:** 3

**CSS classes:** `.card-content` `.h-full`

**HTML structure:**

```html
<div class="card-content h-full" data-v-388550e2=""><div class="layout-wrapper relative w-full flex md:flex-col flex-col justify-start items-start content-start" style="" data-v-388550e2=""><!----><!--[--><!--[--><!----><!--[--><!----><div class="rc__rich-content type--card-headings"><!--[--><p></p><h4>Route planning</h4><p>Generate smarter, optimized routes, whet…</p><!--]--></div><!--]--><!----><!----><!----><!----><!--]--><!--]--></div></div>
```

**Base styles (from design tokens):**

```css
.card-content {
  background: #f5f4f1;
  border: 1px solid #403d37;
  border-radius: 5px;
  padding: 8px;
}```

### Rc  Rich Content

**Instances found:** 3

**CSS classes:** `.rc__rich-content` `.type--card-headings`

**HTML structure:**

```html
<div class="rc__rich-content type--card-headings"><!--[--><p></p><h4>Route planning</h4><p>Generate smarter, optimized routes, whet…</p><!--]--></div>
```

**Base styles (from design tokens):**

```css
.rc__rich-content {
  background: #f5f4f1;
  border: 1px solid #403d37;
  border-radius: 5px;
  padding: 8px;
}```

### Ds Nav Item

**Instances found:** 3

**CSS classes:** `.ds-nav-item` `.duration-300` `.ease-out` `.flex-col` `.grow` `.relative`

**HTML structure:**

```html
<li data-index="1" class="ds-nav-item relative w-[190px] grow flex-col self-end transition-all duration-300 ease-out" data-v-4bb5c38a=""><span class="cursor-pointer hover:opacity-100 opacity-70 flex h-full flex-grow flex-col transition-all" data-v-4bb5c38a=""><!----><h3 class="p font-normal p" data-v-4bb5c38a="">Optimized routes</h3><span class="indicator absolute bottom-0 z-10 block h-[5px] w-full overflow-hidden" data-v-4bb5c38a=""><span class="indicator-animated opacity-1 absolute z-20 h-[5px] w-full origin-left scale-0 bg-blue" data-v-4bb5c38a=""></span><span class="bg-blue-dark absolute b
```

**Base styles (from design tokens):**

```css
.ds-nav-item {
  background: #f5f4f1;
  border: 1px solid #403d37;
  border-radius: 5px;
  padding: 8px;
}```

### Benefits Card

**Instances found:** 3

**CSS classes:** `.benefits-card` `.border-black` `.border-t` `.group-[.text--all-white]/content-module:border-white` `.group-[.text--all-white]/row:border-white`

**HTML structure:**

```html
<article class="benefits-card border-t border-black group-[.text--all-white]/content-module:border-white group-[.text--all-white]/row:border-white" data-v-374f6aab=""><div class="benefits-card__content flex flex-col" data-v-374f6aab=""><span class="size-[46px] lg:size-[56px] [&amp;_svg]:size-full icon-without-image flex justify-center items-center icon benefits-card__icon shrink-0 overflow-hidden text-black" data-v-374f6aab="" data-v-394ee1a0=""><!----><!----><svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" title="Routing icon [REUSABLE] " class="s
```

**Base styles (from design tokens):**

```css
.benefits-card {
  background: #f5f4f1;
  border: 1px solid #403d37;
  border-radius: 5px;
  padding: 8px;
}```

## Buttons

### !Ketch Border [  K Banner Buttons Tertiary Background Color]

**Instances found:** 3

**CSS classes:** `.!ketch-border-[--k-banner-buttons-tertiary-background-color]` `.!ketch-outline-2` `.!ketch-outline-ketch-black-black-100` `.!ketch-outline-offset-2` `.!ketch-rounded-[--k-banner-buttons-tertiary-cornerRadius]` `.!ketch-text-[--k-banner-buttons-tertiary-text-color]`

**HTML structure:**

```html
<button aria-label="Necessary Only" id="ketch-banner-button-tertiary" data-nav="eyJleHBlcmllbmNlIjoia2V0Y2gtY29uc2VudC1iYW5uZXIiLCJuYXYtaW5kZXgiOjJ9" class="ketch-relative ketch-inline-flex ketch-items-center ketch-justify-center ketch-font-semibold ketch-transition ketch-duration-300 ketch-ease-in-out ketch-cursor-pointer ketch-shadow-none focus-visible:ketch-outline focus-visible:ketch-outline-2 focus-visible:ketch-outline-default-outline ketch-overflow-hidden ketch-rounded-none ketch-border-[1.5px] ketch-border-black ketch-border-solid ketch-text-black ketch-bg-transparent ketch-gap-3 activ
```

**Base styles (from design tokens):**

```css
.!ketch-border-[--k-banner-buttons-tertiary-background-color] {
  color: #1c1917;
  border-radius: 5px;
  padding: 4px 8px;
  cursor: pointer;
}```

## Other Components

### Px Gap2

**Instances found:** 5

**CSS classes:** `.px-gap2` `.row-container` `.w-full` `.z-10`

**HTML structure:**

```html
<div class="row-container w-full px-gap2 lg:container z-10"><div class="columns-wrapper flex -mx-s25 flex-wrap md:pt-2 md:pb-4 md:mt-0 md:mb-0 pb-3 pt-3 mt-0 mb-0"><!--[--><!--[--><!----><!--[--><div id="7GYOlkUyDpcx4uRRJEaCTb" class="column group/column px-s25 whitespace-pre-wrap md:w-6/12 w-12/12 md:ml-0 sm:ml-0 visible" style=""><!--[--><div class="breadcrumbs my-1 inline-flex max-w-full rounded-sm group-[.text--all-white]/content-module:text-gray-300 group-[.text--all-white]/row:text-gray-300" id="6axPsVmASYwewWwFQ911tp" data-v-82e331e0=""><ol itemscope="" itemtype="https://schema.org/Brea
```

**Base styles (from design tokens):**

```css
.px-gap2 {
  background: #f5f4f1;
  padding: 4px;
}```

### Group/Row

**Instances found:** 3

**CSS classes:** `.group/row` `.row`

**HTML structure:**

```html
<div class="row group/row"><div class="row-container w-full px-gap2 lg:container z-10"><div class="columns-wrapper flex -mx-s25 flex-wrap md:pt-4 md:pb-2 md:mt-0 md:mb-0 pb-1 pt-4 mt-0 mb-0"><!--[--><!--[--><!----><!--[--><div id="27HPmWEqYWOT1bhpIQl3lY" class="column group/column px-s25 whitespace-pre-wrap md:w-12/12 w-12/12 md:ml-0 sm:ml-0 fade-slide visible" style=""><!--[--><h2>Finish routes with fewer miles and vehic…</h2><p></p><!--]--><!----></div><!--]--><!--]--><section id="" class="pt-space2 md:px-gap2 lw-wrapper w-full" style="--v622d42d8:0;" data-v-4bbbf889=""><div class="align-str
```

**Base styles (from design tokens):**

```css
.group/row {
  background: #f5f4f1;
  padding: 4px;
}```

### H Full

**Instances found:** 3

**CSS classes:** `.h-full` `.image--wrapper` `.w-full`

**HTML structure:**

```html
<div class="image--wrapper h-full w-full" data-v-388550e2=""><div class="mb-gap overflow-hidden rounded-[5px]" data-v-388550e2=""><span class="whitespace-normal image block overflow-hidden rounded-[5px]" data-v-388550e2=""><picture class="contents" data-not-lazy=""><source data-not-lazy="" type="image/avif" sizes="(max-width: 768px) 768px, 1352px" srcset="//images.ctfassets.net/bx9krvy0u3sx/1Wexrj8MAkHQaKSXH1MBsQ/5eb4608a35cc34b585679fe8bd847196/Route-Planning.png?w=320&amp;fm=avif&amp;q=80 320w, //images.ctfassets.net/bx9krvy0u3sx/1Wexrj8MAkHQaKSXH1MBsQ/5eb4608a35cc34b585679fe8bd847196/Route-
```

**Base styles (from design tokens):**

```css
.h-full {
  background: #f5f4f1;
  padding: 4px;
}```

### Mb Gap

**Instances found:** 3

**CSS classes:** `.mb-gap` `.overflow-hidden` `.rounded-[5px]`

**HTML structure:**

```html
<div class="mb-gap overflow-hidden rounded-[5px]" data-v-388550e2=""><span class="whitespace-normal image block overflow-hidden rounded-[5px]" data-v-388550e2=""><picture class="contents" data-not-lazy=""><source data-not-lazy="" type="image/avif" sizes="(max-width: 768px) 768px, 1352px" srcset="//images.ctfassets.net/bx9krvy0u3sx/1Wexrj8MAkHQaKSXH1MBsQ/5eb4608a35cc34b585679fe8bd847196/Route-Planning.png?w=320&amp;fm=avif&amp;q=80 320w, //images.ctfassets.net/bx9krvy0u3sx/1Wexrj8MAkHQaKSXH1MBsQ/5eb4608a35cc34b585679fe8bd847196/Route-Planning.png?w=480&amp;fm=avif&amp;q=80 480w, //images.ctfass
```

**Base styles (from design tokens):**

```css
.mb-gap {
  background: #f5f4f1;
  padding: 4px;
}```

### Block

**Instances found:** 3

**CSS classes:** `.block` `.image` `.overflow-hidden` `.rounded-[5px]` `.whitespace-normal`

**HTML structure:**

```html
<span class="whitespace-normal image block overflow-hidden rounded-[5px]" data-v-388550e2=""><picture class="contents" data-not-lazy=""><source data-not-lazy="" type="image/avif" sizes="(max-width: 768px) 768px, 1352px" srcset="//images.ctfassets.net/bx9krvy0u3sx/1Wexrj8MAkHQaKSXH1MBsQ/5eb4608a35cc34b585679fe8bd847196/Route-Planning.png?w=320&amp;fm=avif&amp;q=80 320w, //images.ctfassets.net/bx9krvy0u3sx/1Wexrj8MAkHQaKSXH1MBsQ/5eb4608a35cc34b585679fe8bd847196/Route-Planning.png?w=480&amp;fm=avif&amp;q=80 480w, //images.ctfassets.net/bx9krvy0u3sx/1Wexrj8MAkHQaKSXH1MBsQ/5eb4608a35cc34b585679fe8b
```

**Base styles (from design tokens):**

```css
.block {
  background: #f5f4f1;
  padding: 4px;
}```

### H Full

**Instances found:** 3

**CSS classes:** `.h-full` `.object-contain` `.w-full`

**HTML structure:**

```html
<img data-not-lazy="" class="h-full w-full object-contain" style="" alt="Map with routes in distinct colors" width="1352" height="1924" sizes="(max-width: 768px) 768px, 1352px" loading="lazy" fetchpriority="auto" decoding="async" src="//images.ctfassets.net/bx9krvy0u3sx/1Wexrj8MAkHQaKSXH1MBsQ/5eb4608a35cc34b585679fe8bd847196/Route-Planning.png?w=1352&amp;q=80" srcset="//images.ctfassets.net/bx9krvy0u3sx/1Wexrj8MAkHQaKSXH1MBsQ/5eb4608a35cc34b585679fe8bd847196/Route-Planning.png?w=320&amp;q=80 320w, //images.ctfassets.net/bx9krvy0u3sx/1Wexrj8MAkHQaKSXH1MBsQ/5eb4608a35cc34b585679fe8bd847196/Route
```

**Base styles (from design tokens):**

```css
.h-full {
  background: #f5f4f1;
  padding: 4px;
}```

### Cursor Pointer

**Instances found:** 3

**CSS classes:** `.cursor-pointer` `.flex` `.flex-col` `.flex-grow` `.h-full` `.opacity-70`

**HTML structure:**

```html
<span class="cursor-pointer hover:opacity-100 opacity-70 flex h-full flex-grow flex-col transition-all" data-v-4bb5c38a=""><!----><h3 class="p font-normal p" data-v-4bb5c38a="">Optimized routes</h3><span class="indicator absolute bottom-0 z-10 block h-[5px] w-full overflow-hidden" data-v-4bb5c38a=""><span class="indicator-animated opacity-1 absolute z-20 h-[5px] w-full origin-left scale-0 bg-blue" data-v-4bb5c38a=""></span><span class="bg-blue-dark absolute bottom-0 z-10 h-[5px] w-full opacity-[0.06]" data-v-4bb5c38a=""></span></span></span>
```

**Base styles (from design tokens):**

```css
.cursor-pointer {
  background: #f5f4f1;
  padding: 4px;
}```

### Font Normal

**Instances found:** 3

**CSS classes:** `.font-normal`

**HTML structure:**

```html
<h3 class="p font-normal p" data-v-4bb5c38a="">Optimized routes</h3>
```

**Base styles (from design tokens):**

```css
.font-normal {
  background: #f5f4f1;
  padding: 4px;
}```

### Not Last:Mb Gap2

**Instances found:** 3

**CSS classes:** `.not-last:mb-gap2` `.px-s25` `.w-full`

**HTML structure:**

```html
<div class="not-last:mb-gap2 w-full px-s25 md:w-4/12" data-v-522c4979=""><!----><!----><div class="content-module__text relative block" data-v-522c4979=""><!----><!--[--><!----><div class="rc__rich-content relative"><!--[--><article class="benefits-card border-t border-black group-[.text--all-white]/content-module:border-white group-[.text--all-white]/row:border-white" data-v-374f6aab=""><div class="benefits-card__content flex flex-col" data-v-374f6aab=""><span class="size-[46px] lg:size-[56px] [&amp;_svg]:size-full icon-without-image flex justify-center items-center icon benefits-card__icon s
```

**Base styles (from design tokens):**

```css
.not-last:mb-gap2 {
  background: #f5f4f1;
  padding: 4px;
}```

### Block

**Instances found:** 3

**CSS classes:** `.block` `.content-module__text` `.relative`

**HTML structure:**

```html
<div class="content-module__text relative block" data-v-522c4979=""><!----><!--[--><!----><div class="rc__rich-content relative"><!--[--><article class="benefits-card border-t border-black group-[.text--all-white]/content-module:border-white group-[.text--all-white]/row:border-white" data-v-374f6aab=""><div class="benefits-card__content flex flex-col" data-v-374f6aab=""><span class="size-[46px] lg:size-[56px] [&amp;_svg]:size-full icon-without-image flex justify-center items-center icon benefits-card__icon shrink-0 overflow-hidden text-black" data-v-374f6aab="" data-v-394ee1a0=""><!----><!----
```

**Base styles (from design tokens):**

```css
.block {
  background: #f5f4f1;
  padding: 4px;
}```

### Rc  Rich Content

**Instances found:** 3

**CSS classes:** `.rc__rich-content` `.relative`

**HTML structure:**

```html
<div class="rc__rich-content relative"><!--[--><article class="benefits-card border-t border-black group-[.text--all-white]/content-module:border-white group-[.text--all-white]/row:border-white" data-v-374f6aab=""><div class="benefits-card__content flex flex-col" data-v-374f6aab=""><span class="size-[46px] lg:size-[56px] [&amp;_svg]:size-full icon-without-image flex justify-center items-center icon benefits-card__icon shrink-0 overflow-hidden text-black" data-v-374f6aab="" data-v-394ee1a0=""><!----><!----><svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000
```

**Base styles (from design tokens):**

```css
.rc__rich-content {
  background: #f5f4f1;
  padding: 4px;
}```

## Component Rules

- Match class names exactly from the patterns above
- Each component instance must be visually identical to others of its type
- Do not add extra wrappers or change the DOM structure
- Use `#403d37` for all dividers within components

