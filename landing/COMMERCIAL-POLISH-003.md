# LANDING-COMMERCIAL-POLISH-003

**PARTIAL — the requested resource-based fallbacks are implemented and locally validated.** No authorized populated ERP session or real sales destination was supplied. Native review authorization is not claimed. No commit, push, merge, reset, stash, or business-module changes.

## Outcome

| Before | After | Why |
| --- | --- | --- |
| Eight image tabs, seven without screenshots | Only available images enter the viewer; other modules use compact descriptions | No empty image surfaces or invented screens |
| Empty POS totals and credit warning in hero | Charcoal editorial composition with an authentic POS confirmation detail | Show a real feature without implying a populated dashboard or completed sale |
| Demo-request promises without reception | Unified product exploration when no channel is configured | Every action has a real destination |
| Wrapped category navigation | Single horizontal, keyboard-scrollable tab row | No isolated last category |
| Longer platform/journey/logistics pins | Shorter distances, existing engines unchanged | Less scrolling between information states |

## Modified in this task

- `src/config/commercialConfig.ts`: shared action resolver; form/hosted-demo, configured email, exploration priority; URI-safe mailbox encoding.
- `src/config/landingImages.ts`: bundled POS detail and optional override.
- `src/components/HeroSection.tsx`, `LandingHeader.tsx`, `FinalCta.tsx`: consistent resource-aware action and visitor-facing copy. Existing safe form adapter retained.
- `src/components/ProductPreview.tsx`: real cropped detail and editorial explanation; optional approved dashboard remains supported.
- `src/components/ProductGallery.tsx`: image-only tabs, compact descriptions, stable image stage, keyboard/Home/End/arrows, previous/next only for multiple images, native zoom/Escape/focus return; failed images leave the viewer.
- `src/components/LandingMotionShell.tsx`: platform `1/900px` minimum becomes `0.8/750px`; journey `0.64/620px` becomes `0.42/360px`; logistics `0.54/480px` becomes `0.42/360px` (viewport multipliers/minimums, not fixed heights).
- `src/styles/landing.module.css`: scoped composition, charcoal viewer, compact definition list, horizontal tabs, responsive layout and reduced-motion controls.
- `src/__tests__/commercial.test.tsx`, `landing.test.tsx`: new behavior, regression coverage, actual intrinsic image dimensions.
- `.env.example`: optional verified commercial email and approved detail asset override.

New: `public/images/landing/pos-confirmation.webp`, this report, and ten before/after PNGs under `evidence/LANDING-COMMERCIAL-POLISH-003/` (not published assets).

## Authentic asset provenance

`pos-confirmation.webp`: 390 × 210, 4,806 bytes, WebP quality 0.88, browser canvas crop from the pre-existing approved `pos-checkout.jpg`. Source crop x1295/y32/w380/h200; no generated UI or altered transaction values. This is one real POS **detail**, not a new dashboard, populated checkout, or proof of a completed sale. Original desktop/mobile JPEGs remain untouched. Unrelated repository screenshots were not promoted without authorization.

The browser session exposed only the public landing; no authorized ERP demo URL, account, or synthetic dataset was available. No customer data was accessed, seeded, or captured. Full Dashboard, inventory/CEDIS, logistics, drivers and collections captures remain blocked on that authorization.

## Commercial behavior

1. Configured HTTPS receiver + privacy URL enables the existing validated form; successful 2xx `{accepted:true}` is mandatory.
2. A configured HTTPS hosted demo URL enables its real link.
3. Otherwise a supplied, independently verified `VITE_LANDING_CONTACT_EMAIL` enables “Contactar por correo”. The code validates/encodes syntax; it cannot prove mailbox ownership or reception. Sending happens in the visitor's mail application; no success confirmation is shown.
4. No channel: “Explorar el ERP” links to `#erp-gallery`; hero secondary links to `#operation`. No form, fake confirmation, or internal blocker copy is published.

Current production-preview build exercises case 4: zero demo-request promises. No real lead submission was attempted, and no mock is described as live reception. Customer login remains separate and absent until a public ERP origin is configured. No localhost login destination is introduced.

## Validation

| Check | Result |
| --- | --- |
| Strict TDD | RED: three new contract failures; GREEN: 35/35 tests |
| ESLint / TypeScript / production build | PASS |
| Impeccable detector | `[]` (not a visual-quality guarantee) |
| Playwright 1440 / 1280 / 768 / 390 / 320 | No overflow, broken loaded images, invalid anchors, or ineffective demo promises |
| Zoom / Escape / restored focus / mobile menu Escape | PASS at all five widths |
| Gallery anchor and Back navigation | PASS: top ~92px below header bottom 77px/69px |
| Motion / reverse scrolling | Desktop pinned story and logistics retained; narrower layouts use normal flow; settled forward/reverse samples preserve readable panels |
| Reduced motion | Zero pin spacers; all story panels readable |
| Console page errors | None observed in final responsive run |
| `git diff --check -- landing` | PASS |

The final mailbox-encoding source correction produced exactly the same built JS/CSS hashes as the visually inspected preview (the absent-channel branch is unchanged). Bundle warning remains: JS 534.95 kB / 177.18 kB gzip, CSS 42.67 kB / 9.15 kB gzip. No Lighthouse/Web Vitals budgets, full screen-reader audit, or live lead delivery are claimed.

### Reproduce

```sh
OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh npm --prefix landing test
OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh npm --prefix landing run lint
OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh npm --prefix landing run typecheck
LANDING_VITE_CACHE_DIR=/tmp/landing-polish-cache OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh npm --prefix landing run build -- --outDir /tmp/landing-polish-delivery
OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh npm --prefix landing run preview -- --outDir /tmp/landing-polish-delivery --host 127.0.0.1 --port 5185
```

## Visual evidence

Comparisons use reduced motion for complete, consistent content coverage; normal motion was separately exercised.

| Width | Before | After |
| --- | --- | --- |
| 1440 | [Before](evidence/LANDING-COMMERCIAL-POLISH-003/before-1440.png) | [After](evidence/LANDING-COMMERCIAL-POLISH-003/after-1440.png) |
| 1280 | [Before](evidence/LANDING-COMMERCIAL-POLISH-003/before-1280.png) | [After](evidence/LANDING-COMMERCIAL-POLISH-003/after-1280.png) |
| 768 | [Before](evidence/LANDING-COMMERCIAL-POLISH-003/before-768.png) | [After](evidence/LANDING-COMMERCIAL-POLISH-003/after-768.png) |
| 390 | [Before](evidence/LANDING-COMMERCIAL-POLISH-003/before-390.png) | [After](evidence/LANDING-COMMERCIAL-POLISH-003/after-390.png) |
| 320 | [Before](evidence/LANDING-COMMERCIAL-POLISH-003/before-320.png) | [After](evidence/LANDING-COMMERCIAL-POLISH-003/after-320.png) |

## Sources and remaining gates

Verified existing router paths: `frontend/src/app/router.tsx`; focused canonical specs: `specs/modules/inventory/spec.md`, `routes-delivery/spec.md`, `billing-requests/spec.md`. Retained: inventory by location, delivery evidence, role-specific access, per-company context, and fiscal configuration/provider dependencies. No new business or deployment claims.

- **P0 external:** authorized synthetic demo session/screenshots and verified commercial channel. Allowed truthful fallbacks are active, not public placeholders.
- **P1:** full accessibility/runtime performance budgets not established; bundle warning retained. Keyboard category changes intentionally remain immediate.
- **Review authority:** mode status reports RDD on by default; no approval receipt has been fabricated. Native negotiated status returned `collect/intended_untracked_selection_required`: intended untracked assets/source must be explicitly selected before lifecycle START. No review was started, no consent assumed, and no receipt issued. This does not negate the local functional checks.

HEAD initial/final: `3235ad4b370a75c057c6b3ac093afcba531aebb8`. Working tree was already dirty on entry and remains dirty. Earlier task changes and unrelated `.playwright-mcp/` artifacts were preserved.
