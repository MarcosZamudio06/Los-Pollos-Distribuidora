# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The approved landing brief addresses people evaluating an ERP for distribution operations. ERP users have role- and location-scoped access; public visitors do not access authenticated operations through the landing.

## Product Purpose

Present the real capabilities of Los-Pollos-Distribuidora: sales/POS, location-aware inventory, CEDIS supply, purchases, delivery operations, receivables and operational close. The landing's commercial action must match available authorized services.

## Capabilities and Constraints

Canonical business rules live in `specs/.specs/` and `specs/modules/`. No global stock. Collection payments apply to one receivable. Daily location close and route settlement are different. Company separation means independent deployments, not a shared tenant switcher. Fiscal issuance and geospatial features require approved scope/configuration/runtime; administrative requests are not CFDI. No offline/native-app or live-traffic promises.

## Brand Commitments

The user approved the Visible Operations architecture conditionally, with charcoal, warm white and gold. Generated UI headings are white. Public UI copy extends the existing neutral Spanish surface. Installed design skills are guidance, not authority to change business rules.

## Evidence on Hand

The user approved `screenshots erp/`, including newly named `dashboard.png` and `POS.png`. Whole-frame derivatives and hashes are recorded in the implementation evidence manifest. This task did not generate synthetic records, log into an ERP or confirm the original dataset independently. Capture values are not customer outcomes. Representative inventory-balance evidence is still missing. Closure-002 adds genuine approved mobile driver assignment and CEDIS transport-arrival captures; these do not prove a completed customer delivery. Real sales reception is not verified in the observed public build.

## Product Principles

- Show actual product evidence; never pass generated screens off as real.
- Preserve operational scope and traceability.
- Preserve every verified category even when imagery is unavailable.
- A configurable CTA is not proof of a working commercial receiver.
