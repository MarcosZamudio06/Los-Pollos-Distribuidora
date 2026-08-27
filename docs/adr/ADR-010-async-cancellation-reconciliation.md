# ADR-010: Reconcile fiscal cancellation asynchronously

- Status: Accepted
- Date: 2026-08-23
- Scope: CFDI-14

## Context

The PAC can accept a cancellation request while the HTTP response is delayed,
and receptor acceptance can complete after the command returns. Retrying the
`cancel` POST from a timeout risks a second fiscal operation. Browser polling
would also create unbounded provider traffic and would not be an authoritative
state machine.

## Decision

Use one scheduled NestJS job, `CancellationStatusJob`, as the automatic
reconciliation boundary:

1. Every five minutes it claims at most 50 persisted pending cancellations
   (`CANCEL_REQUESTED`/`CANCEL_PENDING_ACCEPTANCE`, represented by
   `Invoice.cancellationStatus=PENDING`, plus `UNKNOWN` created by a timeout
   before a response is known) under PostgreSQL advisory lock `71823044`.
2. The claim and creation of a `STATUS` attempt are transactional. The lock is
   released before calling `FiscalProviderPort.getCancellationStatus`.
3. The job carries the original correlation id, provider reference and UUID;
   it validates all three and never calls `cancel` again. Transient failures
   use 60-second exponential backoff capped at 15 minutes and
   `CFDI_MAX_RETRIES`; exhausted attempts create `BillingDataRemediation`.
4. A confirmed `CANCELLED` response reuses
   `InvoiceCancellationService.finalizeProviderResponse`, so document/item
   applications and billable balance are reversed only in the confirmed fiscal
   transaction. `PENDING`, `REJECTED`, timeout and indeterminate responses keep
   `ACTIVE` and the balance reserved.
5. A provider cancellation acknowledgment is persisted as
   `FiscalArtifact(CANCELLATION_ACK)` through private `ObjectStoragePort`.
   Missing or failed artifacts are recoverable and cannot downgrade fiscal
   confirmation.
6. `GET /api/billing/invoices/:id/cancellation` provides a scoped read model.
   The UI offers a manual refresh and explicitly renders Pending, Cancelled,
   Rejected and Error; it does not poll aggressively or become the source of
   truth.

## Consequences

- A PAC timeout cannot cause a duplicate cancellation request.
- Multiple application instances coordinate without Redis, Kafka or a fiscal
  microservice.
- PostgreSQL remains the authority for attempts, retry timing, status,
  idempotency, remediation and audit.
- Reconciliation is eventually consistent; an unresolved provider response is
  visible as an indeterminate/error state and remains actionable without
  releasing commercial balance.
- Logs contain only sanitized event names, opaque ids, states and stable error
  codes; provider payloads, XML, credentials and authentication headers are
  never logged.

## Rejected alternatives

- **Automatic second `cancel` after timeout:** rejected because the PAC may have
  accepted the first request.
- **Browser polling as the authority:** rejected because it is unbounded,
  user-session dependent and cannot coordinate concurrent workers.
- **Redis/Kafka/microservice:** rejected for the current single PostgreSQL
  deployment; the persisted attempt model is sufficient for bounded batches.
