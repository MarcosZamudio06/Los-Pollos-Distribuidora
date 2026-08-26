# ADR-007: Native CFDI issue UI inside BillingRequest detail

- **Status:** Accepted
- **Date:** 2026-08-23
- **Scope:** `BillingRequestDetailPage` and `InvoiceReconciliationPanel`

## Context

The existing ERP flow captured an external invoice by allowing operators to
enter series, folio, UUID and arbitrary amounts. CFDI-08 already exposes a
provider-neutral issuance command from `BillingRequest.APPROVED`, so a second
fiscal UI would create two competing workflows and invite client-owned fiscal
identity.

## Decision

Reuse `InvoiceReconciliationPanel` as the native CFDI review and issuance
surface. The billing-request detail API supplies a read-only `cfdiReview`
calculated by the backend and a safe `nativeInvoice` summary after reservation.
The UI may submit only `expectedVersion`, a stable `Idempotency-Key`, and the
allowed fiscal decisions (`cfdiUse`, payment method/form, export code and
permitted exchange rate).

The review displays issuer/receiver profiles, SAT concept keys, taxes and
authoritative totals. UUID, TFD, seals, certificates, provider status, XML/PDF
and totals are never editable or accepted from the browser. The backend remains
the authority for catalog validation, Decimal recalculation, saldo and
idempotency.

Only `ADMIN` and `BILLING` receive the emission CTA. The panel keeps distinct
loading, validation, `STAMPING`, `STAMP_UNKNOWN`, `STAMP_ERROR` and `STAMPED`
states. `UNKNOWN` is rendered as an indeterminate reconciliable result and
never as a generic error or an invitation to issue a second CFDI. After
`STAMPED`, XML/PDF actions request short-lived signed URLs and do not expose
`storageKey`.

## Consequences

### Positive

- One operator workflow replaces external-invoice capture without a parallel
  module.
- Fiscal identity and calculated totals stay server-owned.
- The existing issuance idempotency and timeout semantics are visible in the
  UI instead of being hidden behind a generic failure.
- Legacy external-invoice service contracts remain available for migration and
  historical records, but are not the native APPROVED path.

### Tradeoffs

- `cfdiReview` is a transient preview of mutable commercial data; the fiscal
  snapshot is still created only by the issuance transaction.
- Artifact buttons can remain pending while ObjectStorage reconciliation runs.
- Authenticated browser and real ObjectStorage checks require runtime
  infrastructure beyond Vitest.

## Rejected alternatives

- Creating a new `cfdi` frontend feature/module: rejected because it duplicates
  routing, request context and RBAC already owned by billing requests.
- Keeping editable external invoice inputs in the APPROVED path: rejected
  because UUID, seals, PAC data and totals must be server-owned.
