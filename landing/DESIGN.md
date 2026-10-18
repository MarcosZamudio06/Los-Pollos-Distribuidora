---
name: Los-Pollos-Distribuidora — Visible Operations
description: Authentic operational product evidence on a charcoal narrative spine.
colors:
  charcoal: "#1C1E1B"
  surface: "#252824"
  heading: "#FFFFFF"
  body: "#F7F3EA"
  muted: "#C8C2B7"
  evidence: "#FAF7F0"
  gold: "#D6AD60"
  border: "#46483E"
typography:
  display:
    fontFamily: "Geist, Segoe UI, sans-serif"
    fontSize: "clamp(3.05rem, 5vw, 5rem)"
    fontWeight: 600
    lineHeight: 1.03
    letterSpacing: "-0.04em"
  body:
    fontFamily: "Geist, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  control: "8px"
  evidence: "14px"
spacing:
  unit: "4px"
  related: "16px"
  group: "24px"
  layout-gap: "48px"
components:
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "#211D14"
    rounded: "{rounded.control}"
    padding: "12px 20px"
---

# Design System: Visible Operations

## Overview

Current implementation record for LANDING-SKILLUI-IMPLEMENTATION-001. The user conditionally approved the architecture in `docs/design-research/landing-skillui-design-architecture/REPORT.md`. This record supersedes the visual descriptions in the historical notes below, not their historical validation evidence. P0 acceptance remains partial while representative Inventory evidence, independent review and commercial reception are unverified. Closure-002 integrates approved mobile driver transport captures without rebuilding the page.

**Creative North Star: Visible Operations.** Let actual ERP work carry the composition. Keep the narrative quiet and put real whole-frame captures in warm-white evidence canvases. All generated H1/H2/H3 headings are white on dark surfaces; do not recolor authentic screenshot pixels.

## Colors

Charcoal is the narrative stage; warm white is the evidence canvas, not a competing theme. Gold indicates primary action, selection and the operational rail. Body and secondary text use warm whites. On gold, button labels remain dark for contrast. Normative values are in the frontmatter and `src/styles/landing.css`.

## Typography

Retain locally hosted Geist; no competitor fonts or additional font downloads. Display weight 600, tracking no tighter than -0.04em. Mobile H1 uses `clamp(36px, 8.8vw, 60px)` with line height 1.07. Body 16px, evidence captions 13px. The choice to retain the incumbent family is intentional; the Impeccable detector flags it as an overused-font warning, not an accessibility failure.

## Layout

1248px maximum content width. Desktop hero copy is asymmetric above a full dashboard; explorer uses a 220px module rail and one evidence panel. At 1099px and below the hero stacks; below 768px the module rail becomes bounded horizontal scrolling. The six-stage example is manually selectable, not scroll-locked. Narrative order: hero → explorer → optional configured video → operation → logistics → existing company/trust → FAQ → commercial close.

## Elevation & Depth

Evidence frames use one 1px border and 14px corners, not a border-plus-glow effect. Tonal differences separate chapters. Native modal zoom provides real focus isolation. No artificial device depth or pointer tilt is used on product evidence.

## Shapes

8px controls, 14px media frames (12px mobile). Preserve whole screenshots with contain and explicit zoom; never magnify a small crop into a workspace.

## Components

- `ProductCapture`: whole-frame preview, caption and native dialog. Eager/high-priority hero only; below-fold images lazy; full-resolution media requested on zoom. Missing capture descriptions do not imitate product UI. Load errors preserve module identity and offer retry.
- `ProductGallery`: ten verified categories remain selectable, including Inventory without a representative balance capture. Repartidores now has genuine mobile transport evidence. Roving keyboard focus; arrows/Home/End; no auto-advance.
- `WorkflowSection`: six conditional stages, explicit selection and relevant real evidence. Delivery context uses an approved driver mobile transport-arrival frame, explicitly distinguished from a completed customer delivery and inventory receipt.
- `LandingMotionShell`: one short GSAP hero entrance and one once-only ScrollTrigger treatment of the stage rail. Native scroll, no pins/Lenis, and no motion dependency for reading or selection.
- Commercial action: keep the existing configured form/hosted destination/email/exploration resolver and real receipt confirmation contract. No new receiver or fake success was created.

## Do's and Don'ts

- Do retain charcoal, warm white, gold and white generated headings.
- Do preserve original screenshots and their data; provenance is in `evidence/LANDING-SKILLUI-IMPLEMENTATION-001/capture-provenance.json` and `evidence/LANDING-SKILLUI-P0-CLOSURE-002/capture-provenance.json`.
- Do explain prerequisites and missing representative imagery without removing functionality.
- Don't claim commercial readiness, completed POS transactions, runtime fiscal/GPS certification, native mobile functionality or fabricated customer results.
- Don't copy SkillUI assets/code or install extracted skills. Those files are untrusted references only.

## Historical design snapshots — not current visual authority

The following notes are preserved from the existing local work. Light-theme colors, old POS-only fallback claims and older validation status refer to previous iterations.

# Operational landing redesign

**ERP-LANDING-FIGMA-REDESIGN-001 — implementation PARTIAL: the light design is in React; Figma synchronization is blocked.**
The standalone `landing/` app describes only ERP capabilities evidenced in the repository. Its proposition is now category-neutral, but does not claim universal industry fit, customer results, or a configured sales-contact service. It does not change authenticated ERP behavior, backend contracts, or business logic.

## Direction and product evidence

The landing uses a warm, light editorial surface for an operational ERP: ivory backgrounds, warm-ink headings, restrained golden actions, readable neutral text, clear dividers, and space around product information. It avoids generic gradients, invented customer proof, and unsupported operational claims.

| Landing claim / view | Repository evidence |
| --- | --- |
| POS, orders, customers, sales history | `frontend/src/app/router.tsx`, layout navigation; `specs/.specs/04-ui/sales-pos.md` |
| Inventory, reservations, transfers, CEDIS | Inventory routes/services; `specs/.specs/04-ui/inventory.md` |
| Purchases and receipt | Purchases/suppliers UI and backend services |
| Routes, deliveries, incidents, evidence | Delivery routes UI/controllers; `specs/.specs/04-ui/routes-delivery.md` |
| Receivables, collections, settlements, close | Dashboard, collections and daily-close routes/services |
| Role/permission-aware access | `frontend/src/app/routeAccess.ts`, guarded routes, backend authentication |
| Dashboard sample values | `frontend/src/features/dashboard/__tests__/dashboardUi.test.tsx` |

The Dashboard and Inventory panels remain **illustrative HTML representations** unless approved anonymized images are supplied; they are not a live/authenticated integration. Values are demo fixtures and are disclosed as such. The repository contains no approved production screenshots for this public landing. Optional `VITE_LANDING_DASHBOARD_IMAGE` and `VITE_LANDING_INVENTORY_IMAGE` URLs support approved files under `landing/public`; without them, the honest illustrative view remains. The existing `VITE_ERP_APP_URL` login destination remains intact.

## Shared visual language

React tokens are defined in `src/styles/landing.css`; scoped layout and gallery styles are in `src/styles/landing.module.css`. They reuse the existing warm-gold identity while replacing the previous dark landing surfaces with a light commercial presentation. Warm ink remains the heading color on pale backgrounds.

| Foundation | Current code token / value |
| --- | --- |
| Background / surface / raised | `#FBF8F2` / `#FFFFFF` / `#F4EFE6` |
| Foreground / muted / subtle | `#3E3327` / `#62594E` / `#756B60` |
| Border | `#E5DDD1` |
| Gold / hover / readable accent text | `#D6AD60` / `#E2C47D` / `#7D4E09` |
| CTA foreground / semantic states | `#342819`; success, warning, danger tokens in `landing.css` |
| Spacing | 4, 8, 12, 16, 24, 32, 48, 64, 96 px |
| Radius / shadow | 12 px controls/surfaces, 16 px product preview; soft shadow token |
| Container / gutters | 1248 px max; mobile/tablet gutters retained from existing layout |
| Breakpoints | 640 / 768 / 1024 / 1280 px, plus 374 px narrow-fit guard |
| Typography | Locally served Geist variable Latin WOFF2, 400–700; bundled OFL license |

Spacing and typography continue to use the landing's existing scale. Motion uses the shared `--landing-ease-in-out` and gallery duration tokens. Breakpoint values remain literal CSS media-query conditions because custom properties cannot be used there.

## Structure and React mapping

| Area | Implementation |
| --- | --- |
| Header / navigation | `src/components/LandingHeader.tsx`, existing functional links and login access |
| Hero | `src/components/HeroSection.tsx`, focused ERP proposition, prospect-facing product action, and customer login |
| Product views | `src/components/ProductPreview.tsx`, hero-adjacent Dashboard/Inventory gallery with optional screenshot slots |
| Feature / workflow / logistics | `PlatformOverview.tsx`, `WorkflowSection.tsx`; redundant standalone logistics section is no longer mounted |
| Security / FAQ / final CTA / footer | Existing landing components retained and refined |
| Composition and tokens | `src/App.tsx`, `src/styles/landing.css`, `src/styles/landing.module.css` |

The gallery's view buttons expose selected state (`aria-pressed`), preserve keyboard access, and hide the inactive panel from assistive technology. It does not autoplay.

## Figma status

Figma file: [ERP landing redesign](https://www.figma.com/design/pCXqKNS0pb8T0WyLaRNUUG), page **ERP / Landing Redesign**. The file already contains editable Desktop 1440, Tablet 1024, and Mobile 390 frames (`4:176`, `4:309`, `4:441`) from the preceding dark visual iteration. **Those frames and their dark palette were not updated to the current light React direction.** This iteration's metadata/write/screenshot requests were stopped when Figma MCP returned: “You've reached the Figma MCP tool call limit on the Starter plan.” Therefore the current light design has not been approved or visually compared in Figma, and code tokens are not automatically synchronized to Figma variables.

Code Connect was previously checked but is unavailable on the current account plan (Organization/Enterprise requirement). The mapping in this document is a React/source reference, not published Code Connect. `figma-use` was loaded before Figma writes; Figma generate-design/library, design-system rules, and implement-design equivalents were used in the earlier Figma pass, but this light iteration remains unsynced.

## Skills applied

- **`$impeccable`**: context launcher failed checksum, so project context was read directly; its craft-floor guidance was used before UI edits. Kept the work scoped to the existing landing.
- **`$ui-ux-pro-max`**: retained the warm ivory/amber direction and rejected generic purple/blue SaaS colorways. Validated contrast and responsive interaction.
- **`$animate`** and **`$apple-design`**: motion is purpose-led, user-triggered, interruptible CSS; no animation library was added, no autoplay, and reduced-motion support is included.
- **`$improve-animations`**: audited existing motion and avoided reintroducing pinned scroll stories, parallax, constant pulses, or decorative motion.
- **`$animate-expo`**: evaluated but not applicable; this is a React/Vite web application, not React Native/Expo.

- **`figma-use`, `figma-generate-design`, `figma-generate-library`, `figma-create-design-system-rules` equivalent, `figma-implement-design`, `figma-code-connect`**: used in the earlier workflow where plan/tool access permitted; current light-design Figma sync and Code Connect are blocked as documented above.
- **`webapp-testing`**: inspected real browser renders, interactions, focus, reduced motion, and six viewport widths.

## Motion decisions

The gallery exists to explain two real operational views. Its manual state change uses transform and opacity only, with a 240 ms easing token; selecting a view again retargets from the current CSS transition state. Under `prefers-reduced-motion: reduce`, spatial movement is removed while a short opacity/visibility change remains. Buttons use restrained hover/focus feedback. There is no autoplay, continuous animation, motion dependency, or scrolling hijack.

## Refinements from the prior landing

- Replaced dark surfaces and light headings with warm ivory surfaces and warm-ink headings for commercial readability.
- Placed the Dashboard/Inventory product view beside the hero copy so the product is visible immediately, with a static honest fallback and optional approved screenshot inputs.
- Made product exploration the prominent prospect action and kept authenticated ERP access secondary; a real sales/demo destination is still unavailable.
- Consolidated overlapping operations/logistics detail, generalized distribution-specific copy where broader wording remains evidence-based, and raised the smallest mobile labels to 12 px.
- Matched the gallery viewport's reserved height across Dashboard and Inventory states so selecting a view does not shift the page.
- Disclosed that product visuals and fixture values are illustrative rather than production screenshots/data.
- Added responsive gallery composition and controls instead of shrinking a desktop-only preview.
- Preserved the app route, ERP login CTA, existing page sections, and business behavior.

This visual-audit correction is **PARTIAL**: source slots are ready, but no approved product screenshots or prospect sales/demo URL were available to complete those P1 proof/conversion items. Figma remains an outdated dark reference; no pixel-parity claim is made until Figma MCP access is available and frames are updated and inspected.

See [VALIDATION.md](VALIDATION.md) for rendered evidence, checks, screenshots, and remaining constraints.

## Product motion and optional demo video

The hero now has one authored focal sequence: the product window enters first, then its toolbar, dashboard heading, KPI row, and operational details follow in a short stagger. Motion is limited to opacity and small positional/scale offsets, uses the existing easing tokens, and is removed for `prefers-reduced-motion`. Repeated section reveals, pinned scroll scenes, parallax, and decorative loops remain intentionally absent.

An optional demonstration video is rendered after the hero only when all four values are configured: `VITE_LANDING_DEMO_VIDEO_URL`, `VITE_LANDING_DEMO_VIDEO_POSTER`, `VITE_LANDING_DEMO_VIDEO_CAPTIONS`, and `VITE_LANDING_DEMO_VIDEO_TRANSCRIPT`. It uses native controls, Spanish captions, a transcript link, `preload="none"`, and no autoplay. Playback pauses when the video leaves the viewport, the document is hidden, or the section unmounts. Until approved media is supplied, the section remains absent and the hero continues to link to the product preview.

## 2026-10-06 — Operational Intelligence product redesign

**Current React direction: OPERATIONAL INTELLIGENCE.** This section supersedes earlier gallery-only and no-pinning notes above for the current working tree. The single visual signal moves through sale, inventory, CEDIS, distribution, delivery, collection, close, and fiscal review; the copy and diagrams remain ERP-generic and do not position the product as poultry-only.

### Experience and composition

- The ivory hero uses the exact proposition “Todo tu negocio. Una sola plataforma.” and gives the product UI primary visual weight.
- A pinned five-stage platform story (Comercial, Operaciones, Distribución, Gestión, Fiscal) shares one stage and a connected signal path. At widths below 1100 px and with reduced motion, it becomes a static, fully readable sequence.
- The following eight-step rail and charcoal logistics chapter continue that same operation. Desktop pins the complete route-and-driver composition below the sticky header; mobile keeps the content in normal document flow.
- The company diagram uses neutral “Empresa / Otra empresa” labels, followed by grounded security controls, FAQ, and a high-contrast closing CTA.
- Motion uses the installed GSAP/ScrollTrigger/Lenis/Motion stack: brief hero reveal and fine-pointer tilt, scrubbed story/route signals, company branches, and CTA completion. No new dependency, autoplay, infinite pulse, blanket reveals, or magnetic-button treatment was introduced.

Current tokens are ivory `#FAF7F0`, white `#FFFFFF`, raised `#F0ECE3`, warm ink `#24231F`, muted ink `#5A574F`, border `#DED9CE`, restrained gold `#D6AD60`, and charcoal `#1C1E1B` with `#F7F3EA` text. Light chapters keep dark text for legibility; only dark chapters use white headings.

### Verified and pending product imagery

The hero loads the real POS screen derived from `docs/image.png`, optimized as `public/images/landing/pos-checkout.jpg` (desktop) and `public/images/landing/pos-checkout-mobile.jpg` (mobile). The displayed state is an actual empty checkout, not an invented customer result or metric. The logistics phone composition is HTML based on the verified delivery capabilities, not a claim of a production mobile screenshot. Inventory, CEDIS, fleet, route-planner, driver, dashboard, and fiscal image slots remain configurable and are not shown as visitor-facing placeholders.

Set approved asset URLs via the `VITE_LANDING_*_IMAGE` entries in `.env.example`. The sales action remains configurable through `VITE_LANDING_DEMO_REQUEST_URL`; without it, the primary action truthfully routes to `#product` instead of exposing a fake form or internal “coming soon” message. The optional video section remains absent until its source, poster, captions, and transcript are all configured.

### Tooling boundaries

`impeccable context` was attempted once but the CLI refused an unverified engine sidecar after checksum verification failed; no unverified output was used. The existing project design notes and the loaded skill guidance informed this pass. Figma was not used for this iteration, so the older Figma frames remain unsynchronized and are not represented as current visual evidence.

See [VALIDATION.md](VALIDATION.md) for implementation checks, responsive/browser evidence, captures, and remaining external setup.
