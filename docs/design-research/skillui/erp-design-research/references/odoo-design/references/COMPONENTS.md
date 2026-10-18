# Component Reference

> Repeated DOM patterns detected by structural analysis. Each component appeared 3+ times.

## Detected Components

| Component | Category | Instances | Key Classes |
|-----------|----------|-----------|-------------|
| **Dropdown Item** | card | 122× | `.dropdown-item` |
| **S Wd Users Box** | unknown | 60× | `.s_wd_users_box` |
| **Col 4** | unknown | 24× | `.col-4`, `.col-lg-2`, `.col-sm-3` |
| **Img Thumbnail** | unknown | 24× | `.img-thumbnail`, `.mb-3`, `.rounded-1` |
| **Small** | unknown | 24× | `.small`, `.text-o-color-5`, `.text-truncate` |
| **O Nav App Family** | unknown | 16× | `.o_nav_app_family` |
| **D Inline** | card | 7× | `.d-inline`, `.dropdown-item` |
| **S Wd Features Title** | unknown | 6× | `.s_wd_features_title` |
| **Row** | unknown | 5× | `.row` |
| **O Nav Com Family** | unknown | 4× | `.o_nav_com_family` |
| **Row** | unknown | 4× | `.row` |
| **Img Thumbnail** | unknown | 4× | `.img-thumbnail`, `.o_anim_fade_in`, `.o_animate` |
| **Btn** | button | 4× | `.btn`, `.btn-primary` |
| **O Footer Title** | unknown | 4× | `.o_footer_title` |
| **Dropdown** | list-item | 3× | `.dropdown` |
| **Container** | unknown | 3× | `.container` |
| **S Wd Features Item** | card | 3× | `.s_wd_features_item` |
| **Mb 4** | unknown | 3× | `.mb-4` |
| **List Unstyled** | unknown | 3× | `.list-unstyled`, `.o_footer_links` |

## Cards

### Dropdown Item

**Instances found:** 122

**CSS classes:** `.dropdown-item`

**HTML structure:**

```html
<a class="dropdown-item" href="/app/accounting">Accounting</a>
```

**Base styles (from design tokens):**

```css
.dropdown-item {
  background: #000000;
  border: 1px solid #495057;
  border-radius: 4.8px;
  padding: 8px;
}```

### D Inline

**Instances found:** 7

**CSS classes:** `.d-inline` `.dropdown-item`

**HTML structure:**

```html
<a target="_blank" href="https://github.com/odoo/odoo" class="d-inline dropdown-item"><i class="fa fa-fw fa-github" focusable="false"></i><span class="visually-hidden">Github</span></a>
```

**Base styles (from design tokens):**

```css
.d-inline {
  background: #000000;
  border: 1px solid #495057;
  border-radius: 4.8px;
  padding: 8px;
}```

### S Wd Features Item

**Instances found:** 3

**CSS classes:** `.s_wd_features_item`

**HTML structure:**

```html
<div class="s_wd_features_item"> <h4 class="s_wd_features_title">40k+ community apps</h4> <p class="mb-4">Thanks to its open source development mo…</p> <a href="//apps.odoo.com/apps" target="_blank" class="btn btn-primary">Browse Community Apps</a> </div>
```

**Base styles (from design tokens):**

```css
.s_wd_features_item {
  background: #000000;
  border: 1px solid #495057;
  border-radius: 4.8px;
  padding: 8px;
}```

## List Items

### Dropdown

**Instances found:** 3

**CSS classes:** `.dropdown`

**HTML structure:**

```html
<li class="dropdown"> <a href="#" aria-label="Apps: use the dropdown menu to switch apps" data-bs-toggle="dropdown" data-bs-display="static" aria-expanded="false" class="dropdown-toggle x_wd_no_caret">Apps</a> <div class="start-0 dropdown-menu o_secondary_nav" data-bs-parent="o_primary_nav"> <div class="container"> <div class="row"> <div class="col-lg-3 o_finance_apps "> <div class="o_nav_app_family">Finance</div> <ul> <li><a class="dropdown-item" href="/app/accounting">Accounting</a></li> <li><a class="dropdown-item" href="/app/invoicing">Invoicing</a></li> <li></li> </ul> </div> </div> </div
```

**Base styles (from design tokens):**

```css
.dropdown {
  padding: 4px 0;
  border-bottom: 1px solid #495057;
}```

## Buttons

### Btn

**Instances found:** 4

**CSS classes:** `.btn` `.btn-primary`

**HTML structure:**

```html
<a href="/page/editions" class="btn btn-primary">Compare Editions</a>
```

**Base styles (from design tokens):**

```css
.btn {
  background: #ffc107;
  color: #f8f9fa;
  border-radius: 4.8px;
  padding: 4px 8px;
  cursor: pointer;
}```

## Other Components

### S Wd Users Box

**Instances found:** 60

**CSS classes:** `.s_wd_users_box`

**HTML structure:**

```html
<div class="s_wd_users_box" style="background-position: 0px 0px;"></div>
```

**Base styles (from design tokens):**

```css
.s_wd_users_box {
  background: #000000;
  padding: 4px;
}```

### Col 4

**Instances found:** 24

**CSS classes:** `.col-4` `.col-lg-2` `.col-sm-3` `.mb-3` `.p-0` `.text-center`

**HTML structure:**

```html
<a href="/app/accounting" class="x_wd_app_entry text-center mb-3 col-4 col-sm-3 col-lg-2 p-0"> <figure> <img width="80px" class="img-thumbnail rounded-1 mb-3" src="//download.odoocdn.com/icons/accountant/static/description/icon.svg" alt="Odoo Accounting icon" loading="lazy" style=""> <figcaption class="text-truncate small text-o-color-5">Accounting</figcaption> </figure> </a>
```

**Base styles (from design tokens):**

```css
.col-4 {
  background: #000000;
  padding: 4px;
}```

### Img Thumbnail

**Instances found:** 24

**CSS classes:** `.img-thumbnail` `.mb-3` `.rounded-1`

**HTML structure:**

```html
<img width="80px" class="img-thumbnail rounded-1 mb-3" src="//download.odoocdn.com/icons/accountant/static/description/icon.svg" alt="Odoo Accounting icon" loading="lazy" style="">
```

**Base styles (from design tokens):**

```css
.img-thumbnail {
  background: #000000;
  padding: 4px;
}```

### Small

**Instances found:** 24

**CSS classes:** `.small` `.text-o-color-5` `.text-truncate`

**HTML structure:**

```html
<figcaption class="text-truncate small text-o-color-5">Accounting</figcaption>
```

**Base styles (from design tokens):**

```css
.small {
  background: #000000;
  padding: 4px;
}```

### O Nav App Family

**Instances found:** 16

**CSS classes:** `.o_nav_app_family`

**HTML structure:**

```html
<div class="o_nav_app_family">Finance</div>
```

**Base styles (from design tokens):**

```css
.o_nav_app_family {
  background: #000000;
  padding: 4px;
}```

### S Wd Features Title

**Instances found:** 6

**CSS classes:** `.s_wd_features_title`

**HTML structure:**

```html
<h4 class="s_wd_features_title">Open source</h4>
```

**Base styles (from design tokens):**

```css
.s_wd_features_title {
  background: #000000;
  padding: 4px;
}```

### Row

**Instances found:** 5

**CSS classes:** `.row`

**HTML structure:**

```html
<div class="row"> <div class="col-lg-3 o_finance_apps "> <div class="o_nav_app_family">Finance</div> <ul> <li><a class="dropdown-item" href="/app/accounting">Accounting</a></li> <li><a class="dropdown-item" href="/app/invoicing">Invoicing</a></li> <li><a class="dropdown-item" href="/app/expenses">Expenses</a></li> <li><a class="dropdown-item" href="/app/sign">Sign</a></li> <li></li> </ul> </div> </div>
```

**Base styles (from design tokens):**

```css
.row {
  background: #000000;
  padding: 4px;
}```

### O Nav Com Family

**Instances found:** 4

**CSS classes:** `.o_nav_com_family`

**HTML structure:**

```html
<div class="o_nav_com_family">Learn</div>
```

**Base styles (from design tokens):**

```css
.o_nav_com_family {
  background: #000000;
  padding: 4px;
}```

### Row

**Instances found:** 4

**CSS classes:** `.row`

**HTML structure:**

```html
<div class="row"> <div class="col-lg-6 pt40 d-none d-lg-block text-start"> <div class="form-check form-switch d-inline-block ps-3 x_wd_corner_highlight_04"> <input class="form-check-input m-0" type="checkbox" role="switch" id="x_wd_apps_switcher" style="width: 3rem; height: 1.5rem;"> <label class="form-check-label fw-bold text-o-color-1 px-3" for="x_wd_apps_switcher">Imagine without odoo</label> </div> </div> <div class="col-lg-6 pt40 text-end"> <a href="/page/all-apps">View all Apps<img src="https://odoocdn.com/openerp_website/static/src/img/arrows/secondary_arrow_sm_03.svg" width="40px" clas
```

**Base styles (from design tokens):**

```css
.row {
  background: #000000;
  padding: 4px;
}```

### Img Thumbnail

**Instances found:** 4

**CSS classes:** `.img-thumbnail` `.o_anim_fade_in` `.o_animate`

**HTML structure:**

```html
<img src="https://odoocdn.com/openerp_website/static/src/img/apps/home/speed_1.webp" class="img-thumbnail o_anim_fade_in o_animate" alt="" loading="lazy" style="visibility: visible; animation-play-state: paused;">
```

**Base styles (from design tokens):**

```css
.img-thumbnail {
  background: #000000;
  padding: 4px;
}```

### O Footer Title

**Instances found:** 4

**CSS classes:** `.o_footer_title`

**HTML structure:**

```html
<span class="o_footer_title">Community</span>
```

**Base styles (from design tokens):**

```css
.o_footer_title {
  background: #000000;
  padding: 4px;
}```

### Container

**Instances found:** 3

**CSS classes:** `.container`

**HTML structure:**

```html
<div class="container"> <div class="row"> <div class="col-lg-3 o_learn_com"> <div class="o_nav_com_family">Learn</div> <ul> <li><a class="dropdown-item" href="/slides/all/tag/odoo-tutorials-9">Tutorials</a></li> <li><a class="dropdown-item" href="/page/docs">Documentation</a></li> <li><a class="dropdown-item" href="/slides/all?slide_category=certification">Certifications</a></li> <li><a class="dropdown-item" href="/training-events">Training</a></li> </ul> </div> </div> </div>
```

**Base styles (from design tokens):**

```css
.container {
  background: #000000;
  padding: 4px;
}```

### Mb 4

**Instances found:** 3

**CSS classes:** `.mb-4`

**HTML structure:**

```html
<p class="mb-4">Thanks to its open source development model, Odoo became the world's largest business apps store. Imagine getting an app for every business needs.</p>
```

**Base styles (from design tokens):**

```css
.mb-4 {
  background: #000000;
  padding: 4px;
}```

### List Unstyled

**Instances found:** 3

**CSS classes:** `.list-unstyled` `.o_footer_links`

**HTML structure:**

```html
<ul class="o_footer_links list-unstyled"> <li><a href="/page/download">Download</a></li> <li class="divider"></li> <li><a href="https://github.com/odoo/odoo">Github</a></li> <li><a href="https://runbot.odoo.com/">Runbot</a></li> <li><a href="https://github.com/odoo/odoo/wiki/Translations">Translations</a></li> </ul>
```

**Base styles (from design tokens):**

```css
.list-unstyled {
  background: #000000;
  padding: 4px;
}```

## Component Rules

- Match class names exactly from the patterns above
- Each component instance must be visually identical to others of its type
- Do not add extra wrappers or change the DOM structure
- Use `#495057` for all dividers within components
- Use `#ffc107` for all interactive/active states

