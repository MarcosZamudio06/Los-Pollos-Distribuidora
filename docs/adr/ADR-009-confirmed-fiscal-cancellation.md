# ADR-009: Confirm fiscal cancellation before releasing billable balance

- Status: Accepted
- Date: 2026-08-23
- Scope: CFDI-13

## Context

The legacy `InvoiceCancellationService` marked `Invoice` as cancelled and
reversed sale-document applications before any PAC/SAT confirmation. For a
native CFDI this can free billable balance while the fiscal document remains
active, creating divergent commercial and fiscal truth.

## Decision

The existing endpoint remains the command boundary, but native cancellation is
split into two short PostgreSQL transactions around one provider call:

1. Lock and validate `ACTIVE/STAMPED`, `expectedVersion`, idempotency, motive,
   provider reference, and optional replacement. Persist `PENDING`, the
   normalized fields, one `CANCEL` attempt, and audit evidence. Do not reverse
   applications.
2. Call `FiscalProviderPort.cancel` without database locks.
3. Persist the normalized result. Pending, rejected, timeout, and ambiguous
   results keep `Invoice.status=ACTIVE` and applications reserved. Only a
   confirmed `CANCELLED` response changes the legacy status and reverses both
   document and item applications atomically.

Motive `01` accepts only `replacementInvoiceId`. The backend loads an already
stamped replacement, validates fiscal order and legal entity, and derives
`replacementUuid`. The original UUID is never updated.

`cancellationReason`, `substitutionUuid`, and `substitutedByInvoiceId` remain
legacy compatibility fields. New native commands use
`cancellationMotiveCode`, `internalReason`, `replacementInvoiceId`, and
`replacementUuid` as their authoritative metadata.

## Consequences

- Billable balance cannot be released by a request that SAT later rejects.
- Concurrent keys are serialized by the Invoice row and the persisted pending
  state, while identical replays avoid another PAC call.
- Timeout remains an explicit unknown/error state and requires later status
  reconciliation; automatic cancellation re-dispatch is not allowed.
- Cancellation acknowledgment storage is post-confirmation and recoverable; an
  ObjectStorage failure cannot downgrade fiscal cancellation.
