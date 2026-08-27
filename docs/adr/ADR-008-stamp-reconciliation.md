# ADR-008: Reconciliación segura de `STAMP_UNKNOWN`

- **Status:** Accepted
- **Date:** 2026-08-23
- **Scope:** `StampReconciliationJob`, `FiscalOperationAttempt` and stamped artifacts

## Context

The provider call is intentionally outside the PostgreSQL transaction used to
reserve a CFDI. A process timeout can therefore leave a persisted invoice in
`UNKNOWN` even though the PAC accepted and created the document. Repeating the
original `stamp` POST is unsafe when the adapter cannot prove provider-side
idempotency: it can create a second CFDI for the same sales applications.

The repository already has PostgreSQL-backed fiscal attempts, snapshots,
`BillingDataRemediation`, `FiscalArtifactService`, and the `FiscalProviderPort`.
The scheduler must use those authorities instead of introducing a queue,
Redis, Kafka, or a fiscal microservice.

## Decision

`StampReconciliationJob` runs on application bootstrap and every five minutes.
Each pass obtains advisory lock `71823043` with
`pg_try_advisory_xact_lock` inside a short claim transaction. The transaction
selects due `STAMP` attempts whose invoice is `UNKNOWN`, excludes a recent
`RECOVERY` attempt in `PROCESSING`, atomically claims the source attempt, and
creates the next `RECOVERY` attempt. No provider or object-storage call occurs
while this transaction is open. `waitForCompletion` plus the advisory lock
protects multiple application instances.

For every claimed operation the job calls `FiscalProviderPort.getStatus` with
the persisted provider reference and a new recovery correlation ID. A confirmed
document must provide a UUID and an XML whose `TimbreFiscalDigital.UUID`
matches it. The job then downloads XML/PDF and passes the bytes as explicit
overrides to `FiscalArtifactService`; object storage remains private and
PostgreSQL stores only metadata and hashes. A missing PDF is recoverable and
does not undo an already confirmed invoice.

The final database transaction locks `Invoice` and the original stamp attempt,
rechecks state/UUID, persists server-owned UUID, TFD, seals, certificates,
`STAMPED`, successful source/recovery attempts, and a sanitized audit record.
If the invoice is already `STAMPED` with the same UUID, pending recovery
attempts are completed idempotently. A different UUID, missing TFD/certificate,
or inconsistent persistence leaves the invoice `UNKNOWN` and opens
`BillingDataRemediation`.

`FISCAL_PROVIDER_NOT_FOUND` is treated as a definitive status result, not as
permission to post another stamp. The job may perform bounded STATUS/RECOVERY
queries using exponential delays and `CFDI_MAX_RETRIES`. After the budget is
exhausted, the invoice remains `UNKNOWN` with remediation for operator review.
This conservative policy is required until a provider adapter exposes a
verifiable idempotency contract for a repeatable issue command.

Logs expose only event names, entity/attempt IDs, correlation IDs, stable error
codes and counters: `started`, `recovered`, `not-found`, `still-unknown`, and
`failed`. XML, PDF, PAC payloads, headers, credentials and external error text
are never logged.

## Consequences

### Positive

- A timeout cannot trigger an unbounded or concurrent second timbrado.
- Reconciliation is durable, auditable and provider-neutral.
- XML/PDF recovery reuses the existing ObjectStorage boundary.
- `BillingDataRemediation` gives operations a stable path for inconsistent or
  permanently indeterminate records.

### Tradeoffs

- An actual provider-side `NOT_FOUND` does not automatically reissue a CFDI;
  remediation or a future explicitly idempotent command is required.
- Recovery depends on persisted `providerReference`; missing references become
  manual remediation instead of a guessed lookup.
- Real cross-instance and PostgreSQL lock tests require disposable database
  infrastructure; unit tests only prove the lock decision and state handling.

## Rejected alternatives

- **Immediate retry of `stamp`:** rejected because Facturama's current adapter
  does not provide a verifiable issue idempotency key contract.
- **Holding row locks during provider HTTP:** rejected because PAC latency would
  block billing transactions and increase deadlock/timeout risk.
- **Redis/Kafka/another fiscal service:** rejected because PostgreSQL already
  owns idempotency, state, reconciliation and audit for this deployment.
