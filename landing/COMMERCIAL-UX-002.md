# LANDING-COMMERCIAL-UX-002

## Status

**PARTIAL — local implementation verified; commercial acceptance blocked by external inputs.**

Initial and final HEAD: `3235ad4b370a75c057c6b3ac093afcba531aebb8`.
The working tree was already dirty, including the current landing redesign, assets and motion work. It remains dirty. No checkout, reset, stash, commit, push, merge, business API or database change was performed. New implementation is confined to `landing/`; MCP creates its own operational logs outside that directory.

The local recording was not attached, so no recording-to-code parity is claimed. All comparisons use the initial local rendered working tree, NOT remote main.

## Product evidence consulted

- `frontend/src/app/router.tsx`: sales, purchases, inventory, CEDIS, reports, accounts receivable, daily close, routes, live monitoring, fleet, driver routes, delivery evidence and billing requests.
- `specs/modules/sales/spec.md`: cash/credit sales, location stock, payment authority, internal documents, receivables.
- `specs/modules/inventory/spec.md`: no global stock, location balances, transfer reservations and CEDIS/sucursal supply rules.
- `specs/modules/compras/spec.md`: external purchases received at CEDIS; branch inventory via transfers.
- `specs/modules/routes-delivery/spec.md`: commercial and transport-only routes, vehicles, positions, evidence and geospatial services.
- `specs/modules/billing-requests/spec.md`: administrative requests are not CFDI; native fiscal issuance is a separate configured flow.
- Focused excerpts of `specs/modules/branch-supply-cycles/spec.md`, `specs/modules/auth/spec.md` and `specs/modules/billing-reportable-notes/spec.md` informed compatibility checks.

Deprecated Spanish sales/inventory/routes/fiscal aliases were resolved to canonical specs. Product-code/spec inspection does not prove deployed modules, PAC operation or production security.

## Changes in this task (distinct from pre-existing work)

| File | Change |
| --- | --- |
| `src/components/HeroSection.tsx` | Explicit ERP proposition, consistent demo intent, product exploration. |
| `src/components/LandingHeader.tsx` | Same demo label/destination; only configured public customer access; mobile menu retained. |
| `src/components/ProductPreview.tsx` | Approved dashboard slot takes priority; honest existing POS fallback and visible provenance. |
| `src/components/ProductGallery.tsx` (new) | Eight categories, roving keyboard tabs, previous/next, native zoom dialog, Escape and focus restoration, lazy images and honest unavailable/error states. |
| `src/components/WorkflowSection.tsx` | Six stages with module, action and operational value; explicitly an example, not a universal forced flow. |
| `src/components/FinalCta.tsx` | Configurable lead form; validation, consent, honeypot, dwell guard, loading/error/confirmed-success states. No form without receiver and privacy configuration. |
| `src/components/FaqSection.tsx` | Compatible operations, evaluation process, configuration dependencies and deployment/contract boundaries. |
| `src/components/LandingFooter.tsx` | Real configured legal links only. |
| `src/components/LandingMotionShell.tsx` | Shorter existing pinned chapters; existing GSAP/Lenis ownership retained. |
| `src/config/commercialConfig.ts`, `publicUrl.ts` (new) | Fail-closed public HTTPS configuration; no localhost, literal IPs, credentials or insecure URLs. |
| `src/config/landingConfig.ts`, `landingImages.ts` | Remove local ERP default; additional approved image slots; preserve other configuration. |
| `src/services/demoRequest.ts`, `seoTags.ts` (new) | Lead receiver contract and public SEO URL validation. |
| `src/App.tsx`, `index.html`, `vite.config.ts` | Gallery composition, configured canonical/social metadata, build-time WebPage JSON-LD and social tags for non-JS crawlers; optional isolated local Vite cache. |
| `src/styles/landing.module.css` | Existing palette/layout retained; white navigation header, compact rhythm, responsive gallery/form, smaller mobile header without clipped brand. |
| `src/__tests__/commercial.test.tsx` (new), `landing.test.tsx` | New safety, acceptance-state and gallery tests; updated expectations for deliberate CTA/dashboard behavior changes. |
| `.env.example` | Public configuration documented; no secrets or production hostname invented. |

No library added, no fictitious customer/price/metric/testimonial/certification, no analytics added, no ERP authentication token used.

## Visual comparison

Captures use reduced motion on BOTH sides so all content is visible and screenshots are comparable. Normal-motion scrolling was checked separately. Screenshot evidence is not published under `public/`.

| Before | After | Why |
| --- | --- | --- |
| [1440](evidence/LANDING-COMMERCIAL-UX-002/landing-commercial-before-1440.png) | [1440](evidence/LANDING-COMMERCIAL-UX-002/landing-commercial-after-1440.png) | Unified sales intent; product gallery; operational explanation and fuller commercial FAQ. |
| [768](evidence/LANDING-COMMERCIAL-UX-002/landing-commercial-before-768.png) | [768](evidence/LANDING-COMMERCIAL-UX-002/landing-commercial-after-768.png) | Responsive module navigation and reading flow. |
| [390](evidence/LANDING-COMMERCIAL-UX-002/landing-commercial-before-390.png) | [390](evidence/LANDING-COMMERCIAL-UX-002/landing-commercial-after-390.png) | Compact mobile rhythm; clear demo intent. |
| [320](evidence/LANDING-COMMERCIAL-UX-002/landing-commercial-before-320.png) | [320](evidence/LANDING-COMMERCIAL-UX-002/landing-commercial-after-320.png) | Narrow header preserves brand/menu; demo CTA remains in hero and mobile menu. |

The hero/selected POS gallery still show the existing empty POS screen. It is NOT a new populated demo capture. Other categories disclose absent imagery instead of fabricating UI. Existing logistical diagrams are narrative illustrations, NOT real screenshots. The dashboard becomes the protagonist only once its approved asset is provided.

## Validation results

- Baseline: 25 pre-existing tests passed; new lead tests initially failed due to absent implementation (RED).
- Final: **33/33 tests PASS**, lint PASS, typecheck PASS, build PASS.
- Build artifact: `/tmp/landing-commercial-final`; CSS ~40.86 kB (8.86 kB gzip), JS ~534.00 kB (176.74 kB gzip). Existing motion stack still produces a >500 kB chunk warning; threshold was not weakened.
- Impeccable mechanical detector: `[]` for changed UI targets. Context loaded once; Emil and frontend-design guidance applied. No subagents used.
- Playwright production preview: 1440, 768, 390 and 320 px; no horizontal overflow or clipped visible header controls; no broken loaded images/local ERP links/invalid fragment links.
- Gallery keyboard selection, zoom, Escape/focus restoration and mobile menu Escape passed.
- Normal-motion forward/reverse sequence: one active platform panel at each sample, returned to Comercial on reverse; anchor gallery top ~92 px while sticky header bottom ~77 px; browser Back worked.
- Reduced-motion: zero pin spacers, all five operational platform panels readable.
- Form browser verification uses an isolated fixture build and an intercepted network request: loading disabled submit, HTTP-success without `accepted:true` shows error, explicit acceptance shows confirmed success and disables resubmission. This is **MOCK PROOF ONLY**, not delivery to a real receiver.
- SEO fixture structural readback: configured canonical, WebPage JSON-LD, Open Graph image and Twitter large card PASS; fixture domains are NOT deployment values.
- Browser fixture console: zero errors. No Lighthouse or field Web Vitals budget PASS is claimed; CLS/LCP/INP and screen-reader/manual-device acceptance remain unmeasured.
- Dev Vite initially hit EPERM in its dependency cache and later served stale source. The isolated cache override plus fresh production preview was used to validate built bytes, without reading/repairing node_modules.

## Lead receiver contract and activation

Set public HTTPS values at build time:

```text
VITE_LANDING_LEAD_ENDPOINT
VITE_LANDING_PRIVACY_URL
VITE_ERP_APP_URL
VITE_LANDING_CANONICAL_URL
VITE_LANDING_SOCIAL_IMAGE
VITE_LANDING_TERMS_URL
```

`VITE_LANDING_DEMO_REQUEST_URL` remains an optional genuine hosted sales destination when there is no embedded form. Navigation and hero always lead to `#demo`, where the configured route or truthful unavailable state is shown.

Receiver input: POST JSON with `name`, `email`, `company`, `message`, `consent`, `website`, `source: "landing-demo"` and `consentVersion: "demo-contact-v1"`. The browser uses no credentials, a 15-second timeout and rejects redirects. Confirmation requires HTTP 2xx AND JSON `{"accepted":true}`. The receiver must return this only after durable acceptance; no lead payload is stored in browser storage or logs.

**Server responsibilities remain external:** validation and length limits, Origin/CORS allowlisting, request-size limits, rate limits, honeypot enforcement, idempotency/deduplication, spam checks, durable storage/delivery, privacy retention and provider credentials. Client controls are bypassable and do not establish server-side anti-spam/security. A failed/timed-out submission can have an unknown server outcome; server deduplication is required before activation. Do not set fake example domains in a production build.

Image variables in `.env.example` accept approved local or hosted assets. Capture authorization must precede authenticated ERP browsing: isolated demo data, no customer/employee/financial identifiers, no destructive actions. No authenticated demo URL/account or explicit demo dataset authorization was supplied in this task.

## Outstanding acceptance by priority

### P0 — blocked external inputs

1. Authorized populated demo session plus sanitized dashboard, POS, inventory/CEDIS, purchases, fleet, driver, collections/close and fiscal captures. Current POS remains empty.
2. Genuine receiver/hosted demo destination, server controls and published privacy notice; prove a request reaches the actual sales destination. Current default collects nothing.
3. Confirm deployed ERP origin for each environment. Missing configuration hides customer access; no localhost fallback.

### P1 — pending evidence/refinement

- Validate configurable/deployed module availability during a real demonstration, especially monitoring and fiscal capabilities.
- Measure performance/Web Vitals on deployment and evaluate splitting the existing motion bundle. No new dependency or threshold exception introduced.
- Screen-reader/manual touch-device review; gallery category changes are instant (no added decorative motor), existing narrative motion retained.

### P2 — pending deployment configuration

- Approved social image, final canonical origin, privacy and terms URLs. SEO tags and WebPage structured data emit only with valid public configuration; no ratings/prices invented.
- No analytics until a valid provider and applicable consent flow are agreed. None added.

## Reproduction

```sh
OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh npm --prefix landing test
OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh npm --prefix landing run lint
OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh npm --prefix landing run typecheck
LANDING_VITE_CACHE_DIR=/tmp/landing-commercial-cache OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh npm --prefix landing run build -- --outDir /tmp/landing-commercial-check
OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh npm --prefix landing run preview -- --host 127.0.0.1 --port 5177 --outDir /tmp/landing-commercial-check
```

Open the preview at 1440/768/390/320 px. Use module arrow keys/Home/End, zoom/Escape, menu/Escape, CTA fragment links and browser Back; scroll both directions with motion enabled, then toggle reduced motion. Test the configured lead contract only with an authorized receiver; the fixture proof above intercepted requests and did not send any real lead.
