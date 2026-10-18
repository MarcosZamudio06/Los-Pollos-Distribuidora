# Landing redesign validation

## P1/P2 visual-audit correction — 2026-10-05

**Status: PARTIAL.** The hero now exposes the product preview and a prospect-facing exploration CTA; customer login is secondary. The page copy is neutral about business category, repeated standalone logistics content was removed, mobile microcopy was raised to 12 px, and dashboard/inventory view heights no longer jump. The screenshot inputs are configurable, but approved product captures were not present; the current preview remains clearly disclosed illustrative UI. A verified sales/demo contact destination was also unavailable, so the prospect CTA opens the product preview rather than submitting a lead.

### Reproduce

```sh
OPENSSL_CONF=/dev/null npm --prefix landing --script-shell=/bin/sh test -- --reporter=dot
OPENSSL_CONF=/dev/null npm --prefix landing --script-shell=/bin/sh run lint
OPENSSL_CONF=/dev/null npm --prefix landing --script-shell=/bin/sh run typecheck
OPENSSL_CONF=/dev/null npm --prefix landing --script-shell=/bin/sh run build -- --outDir /tmp/pollos-landing-p1-p2 --emptyOutDir
git diff --check
```

### Current results

| Check | Result |
| --- | --- |
| TDD | Two screenshot-config/static-metadata assertions failed before correction; both pass after implementation |
| Vitest | **17/17 pass** |
| ESLint | **PASS**, zero warnings |
| TypeScript | **PASS** |
| Vite production build | **PASS** to `/tmp/pollos-landing-p1-p2`; CSS 28.69 kB, JS 242.28 kB |
| Diff whitespace | **PASS** (`git diff --check`) |
| Browser widths | **PASS**, no horizontal overflow at 1440, 1280, 1024, 768, 390, and 360 px |
| Preview stability | Dashboard and inventory heights match at 380 px desktop, 416 px at 390 px, and 432 px at 360 px |
| Mobile type | 14 px disclosure text at 390 px; headings remain responsive |
| Actual product images | **Unavailable**; browser shows 0 product images until approved anonymized screenshots are supplied |

### Current captures

- [Desktop hero at 1440 px](../.playwright-mcp/landing-p1-p2-after-desktop-1440.png)
- [Mobile hero at 390 px](../.playwright-mcp/landing-p1-p2-after-mobile-390.png)

Both captures use the honest illustrative fallback. To supply approved images, place anonymized files under `landing/public/images/landing/` and set `VITE_LANDING_DASHBOARD_IMAGE=/images/landing/dashboard.webp` and `VITE_LANDING_INVENTORY_IMAGE=/images/landing/inventory.webp` in the landing build environment. No production screenshot, customer data, lead endpoint, authenticated flow, or deployment is claimed.

**2026-10-04 — React implementation checks pass; overall Figma workflow remains PARTIAL.** No commit, push, backend change, authenticated login, or production deployment was performed.

## Reproduce checks

From the repository root:

```sh
OPENSSL_CONF=/dev/null npm --prefix landing --script-shell=/bin/sh test -- --reporter=dot
OPENSSL_CONF=/dev/null npm --prefix landing --script-shell=/bin/sh run lint
OPENSSL_CONF=/dev/null npm --prefix landing --script-shell=/bin/sh run typecheck
OPENSSL_CONF=/dev/null npm --prefix landing --script-shell=/bin/sh run build -- --outDir /tmp/pollos-landing-light-refined --emptyOutDir
```

The isolated build output avoids clearing the repository's existing `landing/dist` directory. In this environment, npm scripts require `--script-shell=/bin/sh`; the plain default-shell test invocation exits without useful output. The development/browser preview used for screenshots was served from the isolated build.

## Technical checks

| Check | Result |
| --- | --- |
| TDD | Two new theme/gallery acceptance tests failed before implementation; final suite passes |
| Vitest | **16/16 pass** |
| ESLint | **PASS**, zero warnings |
| TypeScript | **PASS** |
| Vite production build | **PASS** to `/tmp/pollos-landing-light-refined`; JS 241.33 kB / 75.04 kB gzip, CSS 26.77 kB / 5.78 kB gzip |
| Browser console | **0 errors** |
| Contrast from shipped tokens | Heading/background 11.60:1; muted/background 6.48:1; readable accent/background 6.68:1; CTA text/fill 6.84:1 |
| Scope | Landing only; no dependency, API, backend, authentication, or route-contract change |

The main `landing/dist` build target was not overwritten. A successful build to a fresh temporary output verifies the bundle without modifying existing generated files.

## Visual and interaction checks

The running standalone app was inspected in Chromium with the real React implementation. Final captures were made and inspected at each required viewport:

| Width | Screenshot | Result |
| --- | --- | --- |
| 1440 | [Desktop](../.playwright-mcp/erp-landing-light-final-1440.png) | Editorial hero, light product gallery, no overflow |
| 1280 | [Desktop compact](../.playwright-mcp/erp-landing-light-final-1280.png) | Navigation and content remain fitted |
| 1024 | [Tablet](../.playwright-mcp/erp-landing-light-final-1024.png) | Responsive composition and gallery fit |
| 768 | [Tablet compact](../.playwright-mcp/erp-landing-light-final-768.png) | No horizontal scrolling; readable layout |
| 390 | [Mobile](../.playwright-mcp/erp-landing-light-final-390.png) | Touch controls and paired CTAs fit |
| 360 | [Narrow mobile](../.playwright-mcp/erp-landing-light-final-360.png) | CTA stack and gallery fit narrow width |

At all six widths, document/body widths matched the viewport and no element overflowed horizontally. Headings rendered with warm ink (`rgb(62, 51, 39)`); the gallery remained within its responsive viewport. The inventory selector was exercised by click and by keyboard (Tab, Enter); selected/inactive states update `aria-pressed` and `aria-hidden` as intended, and keyboard focus is visible. With `prefers-reduced-motion: reduce`, the gallery removes spatial transform movement and retains only the short opacity transition.

The preview panels are illustrative HTML based on existing modules and disclosed fixture values. They are not production ERP screenshots or proof of authenticated/live data. No real production imagery was available in the landing assets.

## Figma constraints and remaining proof

- Figma MCP Starter quota returned “You've reached the Figma MCP tool call limit on the Starter plan”; the existing Desktop 1440, Tablet 1024 and Mobile 390 frames still show the previous dark design and were not synchronized to this light React pass.
- Code Connect was previously blocked by its Organization/Enterprise plan requirement.
- Browser proof covers the local landing only; no Lighthouse, Safari/physical-device certification, complete screen-reader audit, or authenticated ERP end-to-end login is claimed.
- Final React screenshots have been inspected; Figma screenshots and React-vs-Figma comparison remain blocked until MCP access is available and Figma is updated.

## 2026-10-05 — Motion and optional demo video

| Check | Result |
| --- | --- |
| Test-first behavior | **PASS** — optional video is absent without complete config; configured markup, CTA, offscreen pause, motion keyframes, and reduced-motion overrides are covered |
| Vitest | **PASS**, 21/21 |
| ESLint | **PASS**, zero warnings |
| TypeScript | **PASS** |
| Isolated Vite build | **PASS** to `/tmp/pollos-landing-motion-video` |
| Browser preview | **PASS** at 1440 px and 390 px; 0 current console errors |
| Demo playback | **Not exercised** — no real media assets were supplied; optional markup is verified by component tests |

Captures: [desktop](../.playwright-mcp/landing-motion-video-desktop.png) and [mobile 390 px](../.playwright-mcp/landing-motion-video-mobile-390.png). The browser was served from the isolated build directory so the existing `landing/dist` output was not replaced. Run npm scripts with `--script-shell=/bin/sh` in this environment; omitting it exits with code 255 before test output.

## 2026-10-05 — LANDING-WOW-PRODUCT-REDESIGN

**Result: COMPLETED for the local landing implementation.** No backend lead endpoint, product video, sales contact, customer logo, metric, testimonial, or certification was invented. External asset/configuration and release/browser limitations are listed below.

### Design and motion evidence

- Hero proposition and real POS product screenshot are visible immediately; desktop and mobile use separate optimized, dimensioned sources with high-priority eager loading.
- Five pinned platform chapters were sampled forward and backward. The stage remains 350 px, clears the 77 px sticky header by 20 px, switches `aria-hidden`/`inert` in sync with the visible stage, and crossfades without an all-hidden interval.
- The logistics route advances and reverses its signal/checkpoints while pinning the shared route-and-driver wrapper. The complete phone composition remains below the sticky header.
- At `prefers-reduced-motion: reduce`, pins are removed and all five chapters return to reading order. Resizing from desktop to narrower breakpoints also restores all panels.
- Fine-pointer desktop tilt was exercised; keyboard menu navigation and FAQ activation were exercised. No video element or placeholder form renders without complete external configuration.

### Verification

| Check | Result |
| --- | --- |
| TDD / Vitest | **PASS**, 23/23; regression assertions cover globally-scoped pin CSS and dark-chapter/light-device heading contrast |
| TypeScript | **PASS** — `OPENSSL_CONF=/dev/null npm --prefix landing --script-shell=/bin/sh run typecheck` |
| ESLint | **PASS**, zero warnings — `OPENSSL_CONF=/dev/null npm --prefix landing --script-shell=/bin/sh run lint` |
| Production build | **PASS** to `/private/tmp/pollos-landing-wow-product-redesign-final`; CSS 36.64 kB / 8.05 kB gzip, JS 522.04 kB / 172.97 kB gzip |
| Build warning | One Vite warning remains: the minified JS chunk exceeds 500 kB. The limit was not raised and the warning was not hidden. |
| Diff whitespace | **PASS** — `git diff --check` |
| Browser responsive | **PASS**, no horizontal overflow at 1440, 1280, 1024, 768, or 390 px; hero image sources loaded at desktop/mobile sizes |
| Pinned behavior | **PASS** — two desktop pins; zero pins at widths <=1099 px or reduced motion; platform and route sequences advance and reverse |
| Interactions | **PASS** — mobile menu opens, navigates to `#operation`, closes; FAQ opens with keyboard; anchors resolve |
| Browser console | **0 errors**, no ScrollTrigger warnings; Motion emitted its informational “Reduced Motion enabled” warning during reduced-motion emulation |
| Dependency install | Not run; current landing dependencies were available |

### Final visual captures

- [Desktop hero, 1440 px](../.playwright-mcp/landing-wow-verified-desktop-1440.png)
- [Mobile hero, 390 px](../.playwright-mcp/landing-wow-verified-mobile-390.png)
- [Pinned distribution chapter, 1440 px](../.playwright-mcp/landing-wow-verified-platform-distribution-1440.png)
- [Pinned logistics/driver chapter, 1440 px](../.playwright-mcp/landing-wow-verified-logistics-1440.png)

### Remaining external inputs and proof

- `VITE_LANDING_DEMO_REQUEST_URL` is unset; the CTA uses a working `#product` fallback. Configure a real sales destination to activate “Solicitar demostración”. There is no lead form/backend in this scope.
- No approved product demo video, poster, captions, or transcript was supplied; the accessible native video section remains feature-gated and does not autoplay.
- Only the real POS desktop/mobile screenshots are bundled. Other product-image slots are ready but blank; no placeholder text or illustrative dashboard metrics are exposed.
- Production must set `VITE_ERP_APP_URL` to the ERP's actual origin; `.env.example` intentionally retains `http://localhost:3000` for local development.
- The Figma MCP design was not updated or used for this pass; older frames remain stale. `impeccable context` failed checksum verification for its sidecar, so no output from that command was accepted.
- Browser evidence is local Chromium only. A Lighthouse/60-fps benchmark, Safari/physical-device checks, complete screen-reader audit, authenticated production flow, and deployed lead/video proof are not claimed.
