# LANDING-SKILLUI-DESIGN-ARCHITECTURE

**Status: NEEDS_REVIEW — analysis complete; proposed direction awaits approval.**
**Date:** 2026-10-17. **Scope:** planning and passive research artifacts only. No production implementation, package installation, business-rule change, commit, or delivery approval.

## Executive recommendation

Build **Visible Operations**: a product-led promotional experience for Los-Pollos-Distribuidora, organized around how merchandise, orders, deliveries, money, and operational differences remain traceable. Borrow Linear's product staging, Odoo's module discoverability, Samsara's operational explanation, and Ramp's commercial hierarchy—not their identities or unsupported promises.

Keep charcoal, warm white, and gold. All newly generated interface headings must be white, on charcoal surfaces or dark title bands; do not put white headings on warm-white backgrounds. Warm-white areas are evidence canvases and reading surfaces, not a second brand. Preserve the actual colors of authentic ERP screenshots rather than altering their pixels to fit the marketing theme.

The largest constraint is **product proof, not insufficient animation**. The current build shows the same confirmation-button crop twice, one gallery tab, and no working sales form in the observed configuration. A convincing redesign depends on authorized representative captures and a verified contact destination.

This is one recommended architecture, not a claim that the user has approved the design, audience positioning, naming, or implementation.

## 1. Method and evidence boundaries

- Worked linearly, without subagents. Loaded installed Emil Kowalski, Impeccable, and project frontend-design guidance; also loaded webapp-testing for local inspection.
- Read local SkillUI design summaries, layout/component/interaction references, screenshot indexes, and color/spacing/type JSON for all four references. Sampled relevant animation sections rather than loading 13,955 lines of Linear keyframes. Visually inspected hero and 33%-scroll captures for each reference.
- SkillUI files were **untrusted research data**. Instructions to match exactly, copy code, or install skills were ignored. No extracted skill, package, font, video, or script was installed or executed.
- Comparisons describe the **local captured versions**, not independently verified current competitor websites. Static scroll captures cannot prove timing, causality, keyboard behavior, or animation-library correctness.
- Audited the actual locally modified landing, not only committed HEAD. HEAD was `3235ad4b370a75c057c6b3ac093afcba531aebb8`; substantial tracked and untracked landing work already existed and was preserved.
- Started a fresh Vite server with temporary cache, using `npm --prefix landing --script-shell=/bin/sh run dev -- --host 127.0.0.1 --port 5191 --strictPort`, with `OPENSSL_CONF=/dev/null` and `LANDING_VITE_CACHE_DIR=/tmp/landing-skillui-20261017-cache`.
- Inspected 1440×1000 and 390×844 viewports. These are **current landing captures**, not ERP product captures or comprehensive responsive acceptance.
- No production data, protected environment files, authenticated ERP session, real lead submission, or fiscal/geospatial runtime was accessed. No build, test suite, performance benchmark, or full accessibility audit was run in this planning task.
- Impeccable context now ran successfully and found the incumbent `landing/DESIGN.md`, but no `PRODUCT.md`. No initialization files or replacement design contract were written: product context and final direction must be confirmed before a later build.

### Fresh local observations

| Observation | 1440 desktop | 390 mobile | Interpretation |
| --- | --- | --- | --- |
| Document width / viewport | 1440 / 1440 | 390 / 390 | No horizontal document overflow in these samples only |
| Available image tabs | 1 | 1 | Seven further module categories remain descriptive, not visual exploration |
| Forms | 0 | 0 | Observed configuration falls back to exploration; contact readiness is not demonstrated |
| Scroll pin spacers | 2 | 0 | Desktop scroll choreography exists already; mobile uses unpinned flow |
| Product images | Same `pos-confirmation.webp` twice | Same source twice | Asset diversity is absent in this configuration |
| Intrinsic / rendered image width | 390 / 525 hero; 390 / 520 gallery | Smaller rendering | Desktop magnifies a small detail rather than revealing a complete workspace |
| Main title color | `rgb(36,35,31)` | Dark incumbent heading | Conflicts with the requested white-heading rule |

Fresh evidence: [desktop](current-desktop-1440.png), [mobile](current-mobile-390.png), [mobile gallery](current-gallery-390.png). These files show the current implementation, not the proposal.

## 2. Comparative reference audit

| Reference | What the capture actually demonstrates | Difference from current landing | Adopt | Do not adopt |
| --- | --- | --- | --- | --- |
| **Linear** | Charcoal stage, oversized white thesis, restrained navigation, broad contextual product interface; deeper interface fragments communicate concrete work | Current editorial typography is strong, but its main visual is an enlarged confirmation action, not a workspace | One dominant product stage; thin separators; disciplined density; progressive detail; product-led rather than icon-led storytelling | Purple identity, AI/team-development claims, unreadable decorative micro-UI, perpetual dot grids, wholesale cinematic keyframes |
| **Odoo** | Bright open page, highly recognizable handwritten headline, clear app families, obvious entry points; contextual product compositions deeper down | Current capabilities are divided among platform stages, a workflow, and text-only gallery descriptions; no unified navigable module model | Plain-language module taxonomy, clear scope, rapid access to the area the buyer needs | Handwriting, multicolor icon marketplace, giant app catalog, free-trial/pricing promises, AI features not evidenced here |
| **Samsara Routing** | Routing-specific proposition, operational outcomes, benefit rows, demonstration content and sales entry; cookie/chat overlays visibly obscure captures | Existing logistics shows a generic curve and invented HTML phone composition instead of actual fleet/driver interfaces | Explain planning → assignment → delivery → evidence; use genuine desktop/mobile views with constraints alongside them | Vehicle Gateway/hardware identity, live traffic, self-correcting routes, automatic allocation claims, savings metrics, intrusive assistant/cookie overlay composition |
| **Ramp** | Immediate benefit hierarchy and commercial action; strong contrast between fragmented processes and connected tools; white/lime captured identity | Current page spends multiple sections explaining connectedness before the buyer sees a useful interface; fallback CTA returns to the same gallery | Problem → mechanism → evidence → action; deliberate CTA hierarchy; fewer, more meaningful chapters | Lime identity, celebrity campaign, financial-card/banking/AI claims, fabricated adoption counters, WebGL or giant type merely because extraction found them |

### Extraction reliability findings

| Generated output | Conflicting evidence | Consequence |
| --- | --- | --- |
| Linear `DESIGN.md` and colors JSON classify the page as light | `linear-design/screens/scroll/scroll-000.png` is dark | Do not import inferred semantic roles |
| Odoo is classified as dark; `MarshmallowIcons` and `odoo_ui_icons` are assigned heading/body roles | Hero capture is light and readable text clearly is not an icon font | Do not copy extracted font families or type scale |
| Ramp colors infer black background and blue accent; type includes enormous clamp values | Hero capture is white with lime actions | Tokens mix unrelated site surfaces or roles; not an approved homepage system |
| Samsara interactions primarily sample “Necessary Only”, “Customize Settings”, “Accept All”, policy links | Cookie banner covers the bottom of the captured viewport | Those states describe consent UI, not representative product or conversion interactions |
| Spacing claims every value follows a 4px grid but includes 2px/6px values; generic “16px between sections” conflicts with section padding such as Linear's 128px | Layout files contain both generic semantic labels and measured DOM values | Keep a coherent ERP spacing scale, not generated semantics |
| Animation files include entire-site keyframes, canvas counts, loaders, overlays, and instructions to recreate motion | A static sample does not establish that each animation was visible or useful | Transfer motion purpose, not the extracted animation inventory |

Research root: [`../skillui/erp-design-research/references/`](../skillui/erp-design-research/references/). Each reference contains `DESIGN.md`, `references/{DESIGN,LAYOUT,COMPONENTS,INTERACTIONS,ANIMATIONS,VISUAL_GUIDE}.md`, `tokens/`, and `screens/`. Do not promote generated `SKILL.md` files into installed instructions.

## 3. Current landing: visual and commercial defects

| Priority | Before | After proposed | Why / source |
| --- | --- | --- | --- |
| P0 | Hero says “Todo tu negocio. Una sola plataforma.” under generic “ERP Operativo” branding | Product name plus a precise operational proposition and representative workspace | Broad category copy resembles Odoo without explaining this product's particular strengths; `HeroSection.tsx`, `landingConfig.ts` |
| P0 | A 390px confirmation-action crop is the largest visual and is repeated in the gallery | Full populated POS or operational dashboard with an explicitly selected detail | The buyer cannot evaluate navigation, inventory context, payment state, or breadth; `ProductPreview.tsx`, `ProductGallery.tsx` |
| P0 | Only one gallery tab; missing captures become seven descriptive categories | One coherent explorer with actual capture-backed panels and useful explanatory coverage for missing assets | Avoid giving the impression of a visual product tour when only one button is visible |
| P0 | No demonstrated sales receiver in the observed build; exploration is the honest fallback | One tested contact channel with privacy and real confirmation | Honest fallback is correct behavior, but is not commercial readiness; `commercialConfig.ts`, `FinalCta.tsx` |
| P0 | Light chapters use dark headings | White headings on charcoal chapter surfaces; warm-white evidence interiors | Follows the user's explicit heading requirement without sacrificing contrast |
| P1 | Platform overview and workflow both explain connection before the gallery | Show the product immediately, then one selective operational story | Reduce repeated abstraction and time-to-proof; `App.tsx` orders both before `ProductGallery` |
| P1 | Platform labels look selectable but are `<li>` elements controlled by scroll | Explicit explorer buttons/tabs independent of scrolling | Buyers should choose the relevant module rather than wait through a sequence |
| P1 | Logistics SVG and HTML phone resemble product proof without being real screens | Real fleet/driver captures; any residual diagram clearly labeled “Esquema del flujo” | No fabricated mobile UI or suggestion that an abstract line is route optimization |
| P1 | Decorative gold signal crosses the mobile product heading | Gold rail lives outside readable content and indicates a selected real stage | Current 390 capture shows avoidable interference; new motion must explain, not obscure |
| P1 | Company separation receives a full generic diagram | Concise deployment/permission explanation in the trust chapter | Database-per-company architecture is real, but a shared company switcher is not evidenced |
| P1 | Seven desktop navigation labels; “Producto” and “Funcionalidades” lead into the same conceptual area | Four buyer destinations: Producto, Operación, Confianza, Demostración | Reduce competing pathways; keep customer login secondary and configuration-dependent |
| P2 | Multiple animation dependencies and a large centralized motion shell | CSS for feedback; one owner for each remaining narrative motion | Inspect actual bundle use before removing anything; no library migration justified by aesthetics alone |

Preserve strengths: local Geist font, warm/gold identity, authentic crop disclosure, conditional CTA destinations, form receipt validation, native image dialog, keyboard-aware gallery, reduced-motion branch, explicit operational constraints, and public/authenticated application separation.

## 4. Product truth and promotional claim boundaries

**Evidence level below is static code/spec alignment, NOT runtime certification, production readiness, customer results, or proof of commercial availability.** Captures must come from a separately authorized synthetic-data demo.

| Proposed message | Canonical evidence | Implementation evidence inspected | Safe commercial scope |
| --- | --- | --- | --- |
| Operational overview | `specs/.specs/04-ui/dashboard.md` | `backend/src/modules/reports/reports.controller.ts` → `getDashboard`; `reports.service.ts` exposes generation/freshness/staleness | Summary by permissions/date/location; do not call all metrics instantaneous or a global inventory |
| Cash/credit sales connected to payments and location | `specs/.specs/04-ui/sales-pos.md` | ERP router's POS route; `backend/src/modules/sales/sales.service.ts` sale/payment/receivable/inventory relationships | POS, customers, payment conditions, internal document; ticket is not CFDI |
| Inventory and availability by location | `specs/modules/inventory/spec.md` | `backend/src/modules/inventory/inventory-balance.service.ts` validates physical/reserved/available balances | Location-level stock, reserves and traceable transfers; never stock without location |
| CEDIS supplies and branch returns | `specs/modules/branch-supply-cycles/spec.md` | `backend/src/modules/cedis/branch-supply-cycles.service.ts`, `branch-supply-receipts.service.ts`, router | Direct child branches, linked transfers, receipts and reconciliation; distinguish CEDIS supply from customer delivery |
| Purchases received at CEDIS | `specs/.specs/04-ui/purchases.md`; inventory and branch-cycle rules constrain recipients | `backend/src/modules/purchases/purchases.service.ts::assertLocationAvailable` requires `DISTRIBUTION_CENTER`; purchase routes | Supplier purchases into authorized CEDIS; branches receive linked supply, not direct external purchases |
| Route planning and fleet visibility | `specs/modules/routes-delivery/spec.md`, `specs/.specs/04-ui/routes-delivery.md` | Planning controller; `fleet.controller.ts` exposes protected live/history/heatmap/geofence endpoints | Single-vehicle planning and GPS-fed visibility require authorized roles, positions, coordinates and enabled GIS services; not live traffic or autonomous dispatch |
| Driver delivery, incident and evidence workflow | Same delivery specs | Driver routes in router; delivery navigation service and fleet publication guards | Authenticated assigned work and evidence; no promised offline sync, native mobile app or background device tracking |
| Receivables and collections | `specs/modules/accounts-receivable/spec.md` | `accounts-receivable.service.ts::registerPayment` validates the account ID and updates transactionally | Partial/full collection per receivable; never claim MVP payments allocated freely across multiple receivables |
| Daily close and route settlement | `specs/modules/point-of-sale-closing/spec.md`, delivery settlement sections | `point-of-sale-daily-close.service.ts`; separate daily-close and route-settlement router entries | Cash/inventory differences remain visible; location close and route settlement are distinct operations |
| Controlled access and separate company deployments | Inventory/delivery permission specs; `docs/architecture/multi-company-silo.md` | Router uses ProtectedRoute/RoleRoute/PermissionRoute; fleet controller uses permissions | Roles and authorized scope; one isolated deployment/data plane per company, not consolidated cross-company reporting or instant session switching |
| Administrative billing workflow | `specs/modules/billing-requests/spec.md`, `specs/.specs/04-ui/billing-requests.md` | Billing-request controller's `issue-cfdi` delegates to optional issuance service | Administrative requests are evidenced. Any fiscal issuance promotion stays conditional on approved post-MVP scope, provider/configuration and runtime evidence |

### Contradictions and blocked claims

1. **Fiscal scope:** AGENTS' MVP guard excludes CFDI implementation, but current canonical billing specs explicitly describe an approved post-MVP issuance path, and the controller/service exists. This is phase scope, not permission to promise unconditional fiscal readiness. Keep the core marketing story administrative; require a human scope decision and provider/environment evidence before making CFDI a headline feature. Do not implement or alter fiscal rules in this task.
2. **Navigation:** the delivery module excludes turn-by-turn/automatic rerouting, while current UI specs describe a constrained dynamic OSRM navigation layer with normalized instructions. Keep promotional language to route planning, assigned deliveries and conditional tracking; do not extrapolate into autonomous rerouting or full turn-by-turn capability until reconciled.
3. **Industry breadth:** existing landing is category-neutral, while canonical close/inventory rules are distribution-specific. Prefer “para operaciones de distribución” over “todo tipo de empresa.” Broader market positioning remains a product decision, not something a designer can establish.
4. **Trust claims:** no customer testimonials, public case studies, certifications, savings percentages, uptime/SLA, deployment timelines, pricing or included services were verified. Their absence is not a license to invent them. Replace social proof with demonstrable workflow evidence and clear evaluation terms.

## 5. Recommended section architecture

### A. Header — orientation and one commercial action

- Charcoal, white product identity, thin divider, quiet secondary navigation. Preserve an approved existing brand mark; do not invent a new logo.
- Show Los-Pollos-Distribuidora as product name rather than only “ERP Operativo”; validate final wordmark length and spelling before implementation.
- Four anchors, one gold commercial CTA, conditional secondary “Acceso clientes.” Mobile menu must retain Escape, outside-click dismissal and focus return.
- Purpose: make identity and next step understandable without becoming a sitemap.

### B. Hero — proposition plus immediate product proof

- Proposed Spanish copy, not yet approved: **“De la venta al cierre. Tu operación, conectada.”** Supporting line: “Ventas, inventario por ubicación, distribución y cobranza para coordinar la operación de tu distribuidora.”
- Asymmetric editorial hierarchy: headline left, short explanation/action right, large genuine product workspace directly below. No logos strip or invented numbers.
- Use a populated POS first if it explains the product better than the dashboard; use a dashboard only if representative and approved. A confirmed full POS is preferable to an invented overview.
- One dominant capture, not layered fake devices. At most one intentional detail callout outside the screenshot. Label demo context without claiming a completed customer transaction.
- Primary “Solicitar demostración” only when the destination works; otherwise preserve truthful exploration. Secondary “Explorar el producto” leads directly to the explorer.
- Signature: a quiet gold **operation rail**, connecting selected stages to corresponding real views. It describes causal context, not live data synchronization or obligatory routing for every sale.

### C. Product explorer — primary evaluation surface

- Place immediately after the hero, before a long conceptual story. Merge useful ideas from current `PlatformOverview` and `ProductGallery`; do not retain two competing explorers.
- Desktop: compact grouped rail beside one large image, short capability description, two explanatory bullets and accessible enlarge action. Warm-white image frame on a charcoal stage; no marketing decoration over controls.
- Taxonomy: **Venta y gestión** (POS, Dashboard); **Mercancía** (Inventario, CEDIS, Compras); **Distribución** (Planeación/flota, Repartidor); **Control** (Cobranza, Cierres). Administrative billing is a qualified supporting capability, not an unconditional fiscal pillar.
- Each selection changes the image, title, explanation, evidence label and relevant CTA together. Tabs do not auto-advance. CEDIS gets an explicit capture mapping; the current configured `cedis` slot is not used by the gallery's combined inventory tab.
- Missing assets: retain useful factual descriptions, but mark them outside the visitor-facing image tour; never manufacture a screenshot or call the section a complete visual tour. Internal release readiness must flag missing required captures rather than silently accept one tab.
- Keep native dialog zoom, Escape and focus return. Module selection must work without hover, animation or scroll pinning. Every selected panel has a stable accessible name and reserved media dimensions.

### D. Operational story — one coherent example, not a forced universal process

- Heading: **“Cada movimiento conserva su contexto.”** One six-stage example: Venta → Inventario → Ruta → Entrega → Cobranza → Cierre.
- Every stage explains: the operator's task, what is recorded, the next area's reference, and the real supporting screen.
- Explicit branches: a counter sale can finish without a route; cash and credit differ; collection may happen later; CEDIS supply is not a customer delivery; a route settlement is not a daily location close.
- Desktop: sticky evidence canvas beside normally scrolling short chapters. Mobile: selected stage plus corresponding screenshot in document order. No long pin distances just to consume scroll.
- This replaces the duplicated “signal” explanation, not an additional section repeating it a third time.

### E. Distribution in practice — differentiated product evidence

- Fleet/route planning screenshot and actual authenticated mobile driver screenshot, with evidence flow explained alongside them. Real browser-mobile view, not a claim of a native app.
- Explain assignment, delivery state, incident and evidence handling. Clearly distinguish a routing plan from received positions and from live traffic.
- Put service/permission prerequisites in nearby concise text. Avoid a giant “GPS” headline until enabled runtime and image provenance are verified.
- Gold rail connects conceptual stages outside the media. If a diagram remains, label it as a diagram and keep it visually subordinate to captures.

### F. Trust and fit — prove discipline without fabricated social proof

- Show three concrete controls: roles/permissions; location-aware balances; traceable sales/payments/differences. Use short evidence-linked explanations rather than generic shield-icon cards.
- Add compact company isolation wording: “Despliegues independientes por empresa.” No central tenant selector or multi-company aggregate dashboard illustration.
- Explain evaluation: review workflow and locations, validate selected modules with demonstration data, agree deployment/migration/training/support scope. These are proposed evaluation steps, not already included contracted services or turnaround promises.
- Add customer evidence only when approved and attributable. Until then, product evidence is the trust mechanism.

### G. Buying questions — reduce uncertainty

- Retain factual answers for inventory by location, credit, driver workflow, permissions, deployment and configuration dependencies.
- Keep fiscal conditions and absence of offline guarantees clear without turning every headline into defensive legal copy.
- Native disclosure behavior is sufficient; every question title is white on its charcoal row, with visible focus and a large touch target.

### H. Commercial close and footer — turn interest into a real conversation

- Heading: **“Veamos cómo encaja en tu operación.”** State what an evaluation covers; do not promise a response time or free service without agreement.
- Reuse one action resolver across header, hero, explorer and close. Prefer a verified hosted destination or the existing receiver contract, not a new backend invented for the redesign.
- Native form can retain name, email, company, optional need, explicit consent; preserve loading/error/success, duplicate-submission protection and confirmation semantics. HTTP success alone is not durable lead reception.
- Validate privacy/terms destinations, sender/receiver ownership, and actual received request before promotion. If unavailable, retain exploration but report commercial release as blocked.
- Footer: approved product identity, meaningful navigation, conditional customer access and real legal destinations. No dead legal anchors or fictional prices.

Optional video belongs inside the relevant product chapter after the main screenshot, not automatically between hero and explorer. Keep the existing requirement for source, poster, captions and transcript; play on request, never auto-loop.

## 6. Reusable patterns and visual tokens

These are proposed responsibilities, not new files already implemented.

| Pattern | Reuse / evolution | Contract |
| --- | --- | --- |
| SectionHeading / ChapterHeading | Existing SectionHeading | White titles; dark background; consistent eyebrow, max text width and heading hierarchy |
| ProductEvidenceFrame | Evolve LandingProductImage + ProductPreview | Approved source, dimensions, alt, demo disclosure, loading/error fallback; no fake product UI |
| ProductExplorer | Evolve ProductGallery; absorb selected platform navigation | Explicit selection, stable media slot, accessible controls, no auto-advance |
| OperationalStory | Evolve WorkflowSection | Conditional branches, real sequence, stage-to-evidence relation |
| CaptureZoom | Existing native dialog | Escape, focus return, scroll containment, readable full image |
| CommercialAction | Existing getCommercialAction / LandingButton | Destination and label agree; consistent fallback; no simulated conversion |
| TrustRows / FitPanel | Evolve SecuritySection, CompanySection, FAQ | Verifiable control and constraint, not certification styling |
| MotionBoundary | Simplify LandingMotionShell after review | Own cleanup and reduced-motion; one system owns each animated property |

Proposed content model: one typed module registry carrying identifier, label, supported capability text, canonical spec/code references, capture key, prerequisites and readiness. Separate internal evidence metadata from public copy. Keep public marketing independent of authenticated ERP imports and credentials. Do not introduce APIs, entities, permissions or a shared application-runtime package for the landing.

| Token family | Proposal | Rationale |
| --- | --- | --- |
| Charcoal / raised charcoal | `#1C1E1B` / `#252824` | Existing operational identity, quiet heading stage |
| Heading white / warm canvas | `#FFFFFF` / `#FAF7F0` | White titles; warm-white product evidence interiors |
| Gold / gold hover | `#D6AD60` / `#E2C47D` | Actions and selected stage, not paragraph highlighting |
| Dark-surface body / muted | `#F7F3EA` / `#C8C2B7` | Reading hierarchy without dim white-on-black text |
| Light-canvas body | `#24231F` | Body labels/captions on light evidence surfaces, not generated headings |
| CTA label | `#211D14` on gold | A button label is not a heading; white-on-gold would weaken contrast |
| Typography | Keep locally hosted Geist for display/body; tabular numerals for actual data | Distinction comes from composition and authentic operations, not unlicensed competitor fonts |
| Type scale | Desktop H1 64–80, H2 40–56; mobile H1 36–44, H2 28–36; body 16–18; labels 13–14 px | Proposed starting ranges; validate actual text at 320px and 200% zoom |
| Grid | Max content 1248px; desktop 12 columns, tablet 8, mobile 4; 16–24px mobile gutters | Reuse existing container, allow actual product image to dominate |
| Spacing / shape | 4, 8, 12, 16, 24, 32, 48, 64, 96, 128px; 8px controls, 12–16px media frames | Consistent rhythm; not a collection of unrelated cards |

Keep Tailwind as the approved styling route for future changes, with theme variables as the permitted global CSS. Current landing uses CSS Modules plus existing global theme/Tailwind entry; do not make a full styling migration a hidden prerequisite. No new library is required for this proposal. Validate contrast in the eventual implementation; do not treat these proposed tokens as an accessibility certification.

## 7. Motion and responsive strategy

Emil principle: motion must explain state, preserve spatial continuity or give feedback. It must not delay product evaluation.

| Interaction | Proposed behavior | Boundaries |
| --- | --- | --- |
| Hero | Short first entrance, opacity + 8–16px translate, 400–600ms; main content available immediately | No scroll-dependent text visibility, no blur/tilt obscuring product, no long serial intro |
| Module pointer selection | Immediate selection state; optional image crossfade 160–220ms | Latest selection wins; cancel stale transitions; keyboard selection is immediate |
| Operational rail | 250–400ms highlight after explicit stage selection | Communicates selected context, not real-time data transport; no perpetual drawing |
| Button feedback | Color/border 120–160ms; subtle pointer press only | No transform-heavy hover, no layout shift, always-visible focus |
| Dialog | Optional opacity/scale .98→1, 160–220ms | Accessible immediately; keyboard opening/closing must not wait for animation |
| Section entry | Optional one-time opacity/translate, 300–450ms | Never hide content indefinitely if observer/animation setup fails |
| Video | User-initiated, controls/captions/transcript; pause offscreen | No autoplay, repeated loops, or heavyweight preloading |

- Prefer native scroll and CSS sticky for the story. Existing GSAP can support one bounded explanatory moment if testing justifies it; do not add Motion/GSAP/WAAPI layers to the same property. Lenis is not a requirement—retain only if demonstrable benefit outweighs scroll complexity.
- Respect `prefers-reduced-motion`: no scrub, pinned timelines, parallax or reveal dependency. Selection, focus, dialog and all reading content remain functional.
- Desktop ≥1100px: split hero copy, large workspace below; vertical module rail; optional sticky narrative image without artificial scroll budget.
- Tablet 768–1099px: stacked text, full-width media; simplified grouped controls; no pins. Do not squeeze desktop navigation to fit.
- Mobile 320–767px: single-column hero; primary CTA first; grouped module buttons with explicit current selection; stage text next to its image in reading order. No horizontal document scroll; only an intentionally bounded control rail may scroll.
- Product screens use contain for a full-context view and explicit zoom for detail. Do not shrink a 1440px interface into illegible “proof,” crop out context silently, or upscale a 390px detail as a workspace.
- Test 320, 360, 390, 768, 1024, 1280, 1440; keyboard, 200% zoom, reduced motion, coarse pointer and real mobile device where available. These are planned checks, not completed acceptance.

## 8. Implementation sequence and acceptance gates

| Priority | Work package | Depends on | Acceptance / evidence |
| --- | --- | --- | --- |
| **P0.1** | Confirm product name, distribution-focused positioning, fiscal/navigation claim boundaries and proposed visual direction | Human approval | One approved brief; no invented market scope; reconcile named spec contradictions before promoting disputed capabilities |
| **P0.2** | Capture real synthetic-data Dashboard or full POS, Inventory/CEDIS, Fleet, Driver and Collections/Close | Authorized disposable demo or approved source files | Actual current UI, coherent non-customer data, provenance and public-use permission; retain full context; ≥1440×900 desktop logical pixels, preferably DPR2; actual mobile viewport capture |
| **P0.3** | Validate one commercial channel and privacy/legal destinations | Approved receiver/hosted URL/mailbox | A real test request confirmed at the receiver with consent/error handling; no simulated success; no localhost or dead destination |
| **P0.4** | Implement approved header, white-heading system, hero and unified product explorer | P0.1 + approved primary assets | Full workspace visible, meaningful module selection, explicit CEDIS wiring, no repeated button crop masquerading as tour; no unverified claims |
| **P1.1** | Consolidate operational story and logistics proof | P0.2 + P0.4 | One understandable example, optional branches, genuine fleet/driver screens, diagrams labeled |
| **P1.2** | Consolidate trust, fit, FAQ and commercial close | P0.1 + P0.3 | Honest company-silo wording; differentiated close/settlement; terms/conditions; working public CTA |
| **P1.3** | Harden responsive, keyboard, capture failures and image budgets | P0/P1 surfaces | Multi-width browser evidence, zoom/Escape/focus, image failure with no misleading fallback, no horizontal overflow, reduced-motion parity |
| **P2.1** | Add purposeful motion and optional real demonstration video | Static architecture accepted | No lost keyboard/reading behavior; interruptible transitions; captions/transcript; no loops or gratuitous pins |
| **P2.2** | Optimize asset delivery, bundle ownership, metadata and conversion measurement | Stable approved implementation and privacy decision | Measure baseline then report target budgets; verified canonical/social image; minimal privacy-respecting action events, no PII payloads |

Implementation method: ordinary scoped work, no automatic SDD route. Respect the repository's strict TDD for behavior changes: RED → GREEN → REFACTOR for module selection, configuration fallback, image failure, keyboard/focus and genuine receipt handling. Tests do not substitute for browser or real receiver evidence.

Suggested release budgets (targets, not measured results): LCP ≤2.5s, CLS ≤0.1, INP ≤200ms under an agreed measurement profile; hero media preferably ≤350kB with explicit dimensions; lazy-load below-fold assets, do not load all full-resolution gallery captures at entry. Adjust media budgets if legibility requires it, and document the tradeoff.

Future verification commands, **not executed in this planning task**:

```sh
OPENSSL_CONF=/dev/null npm --prefix landing --script-shell=/bin/sh test
OPENSSL_CONF=/dev/null npm --prefix landing --script-shell=/bin/sh run lint
OPENSSL_CONF=/dev/null npm --prefix landing --script-shell=/bin/sh run typecheck
OPENSSL_CONF=/dev/null npm --prefix landing --script-shell=/bin/sh run build
```

If normal build/cache locations are protected, use an isolated temporary output/cache without deleting existing outputs. Preserve all pre-existing local work. Do not read dependencies or protected credential files to complete validation.

## 9. Visual artifact and tradeoffs

[Desktop/mobile architecture wireframe](architecture-wireframe.svg), also available as a [rendered PNG preview](architecture-wireframe-preview.png), is a **low-fidelity concept**, not an implemented interface, real ERP screenshot or final pixel-level comp. Explicit evidence slots intentionally replace product imagery that has not been approved. It shows hierarchy, dark heading surfaces, section order and mobile stacking. Spanish production copy remains a proposal; wireframe annotations are English.

The SVG parsed successfully and its browser rendering was visually inspected. The initial SVG navigation call timed out, but the subsequent browser state confirmed the correct document and produced the preview. The static preview server logged only a missing `favicon.ico` request; this is not a production landing error. Local report links and referenced source paths were checked. The tracked `landing/` diff SHA256 remained `db5b41794ac3c11d930b239760937ab516e59c8e40d21198d367cd64f500baa4` before and after artifact creation; this verifies preservation of the existing tracked diff, not a complete runtime or all-untracked-files audit.

- Dark narrative + light evidence frames preserves white headings and product legibility, but needs restrained tonal variation to avoid a monotonous dark page. Do not alternate backgrounds mechanically.
- Real screenshots have greater credibility than fictional interactive dashboards, but require capture work and careful mobile zoom. Prefer that cost to a misleading “premium” simulation.
- Direct selection loses some cinematic control but improves buyer agency, keyboard access and time-to-evidence. Keep one explanatory motion signature, not multiple competing scroll shows.
- A technical-control trust section can be honest before customer references exist; it cannot stand in for actual testimonials, certifications or deployment guarantees.

## 10. Handoff and limits

**Analysis deliverables: complete. Design approval: pending. Product-proof readiness: blocked on authorized representative assets. Commercial readiness: not demonstrated. Production implementation: not started.**

No capability is approved for promotion merely because it has a route or a spec. The claim matrix narrows acceptable wording; operating-environment, image-publication and commercial availability checks remain separate gates.

Files created by this task: this report, the architecture SVG and its PNG preview, and three current-landing viewport PNGs. Existing `landing/`, SkillUI research, backend, frontend and specs remain untouched. Browser tooling also writes ordinary diagnostic snapshots under `.playwright-mcp/`.
