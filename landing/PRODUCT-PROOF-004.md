# LANDING-PRODUCT-PROOF-004

**BLOCKED — BLOCKED_ASSETS. P0 is not accepted.** The local landing was inspected and validated, not redesigned. No implementation, business logic, existing asset, or configuration was changed. No synthetic data was inserted; no production data was accessed or modified. No commit, push, merge, reset, or stash.

Initial and final HEAD: `3235ad4b370a75c057c6b3ac093afcba531aebb8`.
The worktree was already dirty. Its existing tracked landing diff is unchanged (`cmp` against the entry snapshot passed). New deliverables are this report and ten landing QA screenshots under `evidence/LANDING-PRODUCT-PROOF-004/`. These are **landing evidence, not new ERP product assets**.

## Acceptance status

| Priority | Result | Evidence / missing prerequisite |
| --- | --- | --- |
| P0 hero | BLOCKED_ASSETS | Still an authentic confirmation-button detail, not a representative populated dashboard |
| P0 gallery | BLOCKED_ASSETS | One POS-detail tab; seven modules remain descriptions. This does not satisfy a navigable product gallery |
| P0 capture | BLOCKED_ASSETS | No authorized demo URL/session or approved populated screenshots available in task context or discovered local services |
| P1 CTA destinations | PASS, current unconfigured branch only | Public “Explorar el ERP” links to `#erp-gallery`; secondary hero links to `#operation`; no invalid fragment destinations |
| P1 real commercial reception | BLOCKED_CONTACT | No validated receiver, hosted demo destination, or mailbox supplied. No real submission or reception claimed |
| P1 authenticated access | Existing separation retained | Customer access is conditional on a configured public HTTPS ERP origin; absent in the inspected build, not redirected to localhost |
| P2 responsive / keyboard / reduced motion | Scoped checks passed | Four requested widths, native zoom/Escape/focus return, mobile menu/Escape, normal and reduced-motion scroll checks |
| P2 drivers screenshot | BLOCKED_ASSETS | Existing HTML mobile representation is not an authentic driver screenshot |

## Asset audit and provenance

Inspected `landing/public/images`, `frontend/public`, repository image-path discovery excluding dependencies/generated builds, and historical `.playwright-mcp` candidates. Existence alone does not authorize publishing customer data or prove correspondence to current HEAD.

| Existing asset | Dimensions | Assessment |
| --- | --- | --- |
| `docs/image.png` | 2172 × 724 | Authentic-looking empty checkout fragment, large surrounding whitespace, zero items/payments; not a complete populated POS or dashboard |
| `public/images/landing/pos-checkout.jpg` | 1680 × 255 | Existing desktop derivative of that checkout; incomplete and empty |
| `public/images/landing/pos-checkout-mobile.jpg` | 492 × 360 | Existing mobile derivative; not a new populated interface |
| `public/images/landing/pos-confirmation.webp` | 390 × 210 | Existing crop of the confirmation action. Prior local provenance documents crop x1295/y32/w380/h200 from desktop JPEG; no fresh ERP capture |
| `../docs/ui/rutas.jpg` | 943 × 725 | Google Maps image, NOT an ERP screen; rejected as product proof |
| `../.playwright-mcp/page-2026-08-14T21-23-31-253Z.png` | 1200 × 736 | Historical ERP planner, zero stops, partial form, development identity visible; incomplete and not current-HEAD proof |
| `../.playwright-mcp/element-2026-08-14T21-26-59-425Z.png` | 1036 × 544 | Historical map fragment with customer/location labels; no verified publication authorization or complete fleet UI |
| `../.playwright-mcp/element-2026-08-14T21-23-41-227Z.png` | 836 × 545 | Historical element crop, not a complete required product screen |
| `../docs/ui/comprobante_20260716T195908336181.png` | 1179 × 4290 | Receipt-format candidate, not one of the required dashboard/POS/inventory/fleet/driver screens; not promoted |
| `frontend/public` ticket/icons/favicon; older landing evidence | Various | Branding, receipts, or marketing-page captures; not replacement ERP proof |

At 1440px the same 390px-wide confirmation image rendered at 468px in the hero (1.20×) and 520px in the gallery (1.33×). Successful image loading is not evidence of acceptable representative product quality. Original files were preserved; no fake images, recreated screens, or enlarged assets were generated.

## Exact missing capture set

Provide an explicitly authorized, disposable synthetic-data demo session, or approved screenshots with provenance. Use lossless PNG/WebP, capture the actual current ERP UI, retain readable navigation/context, and review identity/location/payment information before public use. Recommended desktop capture: at least 1440 × 900 logical pixels, preferably at device scale 2. Do not edit values into images.

| Required capture | Must visibly include | Existing configuration input |
| --- | --- | --- |
| Dashboard | Populated operational summary, reporting period, consistent synthetic sales/inventory/collection totals | `VITE_LANDING_DASHBOARD_IMAGE` |
| Full POS | Product list/cart, synthetic customer, coherent quantities/prices/totals and payment state; not only F8 or an empty checkout | `VITE_LANDING_POS_IMAGE` |
| Inventory | Populated balances by operational location, products and traceable movement context | `VITE_LANDING_INVENTORY_IMAGE` |
| CEDIS | Actual CEDIS overview/supply/receipt interface with consistent synthetic branch and location data | `VITE_LANDING_CEDIS_IMAGE` (gallery wiring must be checked when supplied) |
| Fleet | Full vehicle/route monitoring interface with synthetic assignments; map-only external imagery is insufficient | `VITE_LANDING_FLEET_IMAGE` |
| Driver | Authenticated mobile assigned route/order, delivery state and evidence interface; use a synthetic driver/customer | `VITE_LANDING_DRIVER_IMAGE` |

The current gallery also needs approved screenshots for its additional Purchases, Collections and Billing categories if they are to appear as image tabs. Their existing optional inputs are `VITE_LANDING_PURCHASES_IMAGE`, `VITE_LANDING_COLLECTIONS_IMAGE`, and `VITE_LANDING_BILLING_IMAGE`. Do not remove capabilities to hide missing captures.

## Demo and commercial verification boundary

- Read-only local service discovery found landing pages at ports 5174–5177 and 5183–5184, not an authenticated ERP demo. Ports 3000 and 5173 refused connections. This is not proof that no remote demo exists; none was available/authorized in the task context.
- No credentials were supplied. Restricted environment/credential files were not read. No ERP seed, login guessing, destructive fixture reset, or authenticated customer capture was attempted.
- `.env.example` contains optional public image/channel inputs, not an independently validated commercial contact. The built landing rendered zero forms and no fictitious demo-request or customer-login destination.
- Existing source supports a configured receiver plus privacy URL, a hosted-demo URL, or a syntactically valid configured email, otherwise product exploration. Syntax validation does not prove ownership, durable lead reception, or availability. Live commercial acceptance remains outstanding.
- Canonical inventory and delivery spec headings/capabilities and the current router were sampled to identify the required operational-location and authenticated fleet/driver context. No capabilities or business rules were added.

## Validation performed on the current local implementation

| Check | Result |
| --- | --- |
| Vitest | PASS: 2 files, 35 tests |
| ESLint | PASS: zero-warning command exited 0 |
| TypeScript | PASS: `tsc -b` exited 0 |
| Production build | PASS: isolated `/tmp/product-proof-004-dist`; JS 534.95 kB / 177.18 kB gzip, CSS 42.69 kB / 9.16 kB gzip |
| Build warnings | JS chunk exceeds 500 kB; alternate outDir outside project root. Neither is a product-acceptance PASS |
| Playwright 1440 / 768 / 390 / 320 | No horizontal document overflow, broken loaded images, or invalid fragment anchors; one gallery tab and zero forms at every width |
| Gallery CTA | Fragment `#erp-gallery`; section top ~92px, below 77px desktop/tablet or 69px mobile sticky header |
| Zoom | Opens native dialog; Escape closes; focus returns to zoom trigger at all four widths |
| Tab keyboard | End preserves focus on sole available image tab; multi-image navigation cannot be accepted from this one-image build |
| Mobile menu | Open, Escape close and trigger-focus return passed at 768/390/320 |
| Reduced motion | Zero pin spacers; all content remains readable; forward/end/top scroll works |
| Normal motion | Desktop forward/reverse samples retained one visible platform panel, two pin spacers, no overflow, and returned to first panel at top. 768/390/320 use unpinned flow; gallery anchor and browser Back passed |
| Page errors | None observed in responsive interaction batch; not a full screen-reader, axe, performance-budget, or device-hardware audit |
| Headers | Incumbent light sections still compute dark `rgb(36,35,31)` headings; gallery headings are white and logistics/CTA headings off-white. The global white-heading instruction is NOT satisfied. Preserved under the explicit blocked-assets design-preservation requirement rather than turning pale-surface text white |
| `git diff --check -- landing` | PASS |

MCP initially reported a occupied-browser profile and refused localhost navigation. Selecting the available landing tab subsequently permitted inspection of the freshly built preview at port 5186. Local direct Chrome launch aborted, and bundled Chromium failed with `SystemAppearance`; no host repair or dependency installation was performed. Final responsive proof above comes from working MCP Playwright, not those failed local launches.

### Reproduce local checks

```sh
OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh npm --prefix landing test
OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh npm --prefix landing run lint
OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh npm --prefix landing run typecheck
LANDING_VITE_CACHE_DIR=/tmp/product-proof-004-cache OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh npm --prefix landing run build -- --outDir /tmp/product-proof-004-dist
OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh npm --prefix landing run preview -- --outDir /tmp/product-proof-004-dist --host 127.0.0.1 --port 5186 --strictPort
git diff --check -- landing
```

In Playwright, set each requested viewport to height 900; emulate reduced motion, navigate to the fresh preview, wait for network idle/fonts, capture full page, click the first “Explorar el ERP”, test sole tab End, zoom/Escape/focus return, and mobile menu/Escape. Repeat normal-motion forward/reverse scroll on desktop and anchor/Back on smaller widths. No forms or network submissions were simulated.

## Before / after evidence

**No UI correction was implemented:** “before” is baseline and “after” is the same source after interaction checks. These images do not represent an improved product presentation; minor focus/raster differences do not imply source changes. Full-page pairs use reduced motion for consistent content coverage.

| Before | After | Why |
| --- | --- | --- |
| [1440 baseline](evidence/LANDING-PRODUCT-PROOF-004/before-1440.png) | [1440 final check](evidence/LANDING-PRODUCT-PROOF-004/after-1440.png) | Preserve current design while assets are blocked |
| [768 baseline](evidence/LANDING-PRODUCT-PROOF-004/before-768.png) | [768 final check](evidence/LANDING-PRODUCT-PROOF-004/after-768.png) | Responsive verification, not redesign |
| [390 baseline](evidence/LANDING-PRODUCT-PROOF-004/before-390.png) | [390 final check](evidence/LANDING-PRODUCT-PROOF-004/after-390.png) | Responsive verification, not redesign |
| [320 baseline](evidence/LANDING-PRODUCT-PROOF-004/before-320.png) | [320 final check](evidence/LANDING-PRODUCT-PROOF-004/after-320.png) | Narrow-screen verification, not redesign |

Normal-motion detail evidence: [hero](evidence/LANDING-PRODUCT-PROOF-004/hero-1440.png), [gallery](evidence/LANDING-PRODUCT-PROOF-004/gallery-1440.png).

## Next acceptance gate

Obtain the six approved, populated captures and a validated commercial channel. Then replace the hero, recover the actual navigable gallery, complement drivers with the actual mobile UI, and re-run product-image quality and conversion acceptance. P0 must not be closed merely because images load or placeholders are absent.
