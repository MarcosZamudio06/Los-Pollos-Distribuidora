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
the persisted or recovered provider reference and a new recovery correlation ID. A confirmed
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
- Missing references use an optional read-only identity lookup; unsupported
  providers or missing identity still require manual remediation.
- Real cross-instance and PostgreSQL lock tests require disposable database
  infrastructure; unit tests only prove the lock decision and state handling.

## Rejected alternatives

- **Immediate retry of `stamp`:** rejected because Facturama's current adapter
  does not provide a verifiable issue idempotency key contract.
- **Holding row locks during provider HTTP:** rejected because PAC latency would
  block billing transactions and increase deadlock/timeout risk.
- **Redis/Kafka/another fiscal service:** rejected because PostgreSQL already
  owns idempotency, state, reconciliation and audit for this deployment.

## CFDI-001 correction and recovery (2026-09-11)

The defect is a missing recovery implementation, not the `UNKNOWN` classification.
The adapter posts to `/api-lite/3/cfdis`, not literally `/cfdis`. Losing a successful
response before the adapter receives it loses the remote `Id`. Previously the job
immediately remediated that case, despite the canonical spec requiring recovery
by immutable issuer/series/folio. Critical release impact is a risk assessment;
no production incident frequency or remote duplication has been measured here.

The earlier diagnosis relied on `exist`/`oldexist` and the abbreviated numeric-folio
guide. The official [CfdiSearch reference](https://apisandbox.facturama.mx/docs/Api/GET-cfdi_Keyword_Type_Status_Page_FolioStart_FolioEnd_Rfc_TaxEntityName_DateStart_DateEnd_IdBranch_Serie_Id_InvoiceType_PaymentMethod_RfcIssuer_OrderNumber_Folio_Uuid_RfcReceipt)
also documents **string** `Folio`, `Serie`, `RfcIssuer`, and result `Id`/`Uuid`.
That is the implemented lookup contract; neither existence endpoint is used.

- `findStampedDocument` is optional on `FiscalProviderPort`; other providers
  retain their existing fail-closed behavior. Provider-side idempotency stays false.
- Facturama searches `type=issuedLite&status=all`, compares the complete identity
  exactly (RFC case-normalized; series/folio preserve case and leading zeros), and
  scans pagination before accepting one result. Cancelled rows are not hidden.
- Three pages maximum, 100 rows/page, and a 5-second per-request timeout cap bound
  lookup work. Repeated IDs, a full final page or incomplete responses cannot prove
  a unique match. Duplicate identity matches require remediation; empty searches
  retain `UNKNOWN` and use the existing bounded recovery backoff.
- The discovered UUID must agree with an active provider status and the XML TFD.
  Successful existing finalization persists the recovered reference on both attempts.
  No new STAMP, queue, migration, lease policy, or monetary mutation is introduced.
- Already terminal/remediated attempts are **not** silently reopened by deployment.
  Historical records need an explicitly authorized remediation procedure.

### Acceptance boundary

`test/facturama-recovery.protected.spec.ts` sends one real Sandbox POST, consumes
the successful response in the fault injector, records an independent UUID/XML
oracle and throws a transport error before the application receives the response.
The application and PostgreSQL therefore have no remote reference. The production
issuance failure path and reconciliation job must transition `UNKNOWN -> STAMPED`,
persist the reference and the same XML hash/bytes, and a separate raw paginated
query must observe exactly one matching remote document. A second POST is forbidden.

The shared fixture preserves the canonical Sale/BillingRequest/Invoice/application
graph and database triggers. The test substitutes only the pre-reserved `prepare`
result and uses in-memory object storage; it is not an authenticated HTTP journey
or S3 durability test. Fiscal failure/finalization, PAC calls, artifact metadata,
and the independent PostgreSQL observer are real. No secrets or XML are logged.

Run the manually protected `CFDI Facturama Sandbox` workflow with `contract=recovery`.
It requires the existing Sandbox/CSD credentials plus
`FACTURAMA_SANDBOX_CERTIFICATE_SERIAL`, disposable migrated PostgreSQL, and both
`RUN_FACTURAMA_SANDBOX_STAMP=true` and `RUN_FACTURAMA_SANDBOX_RECOVERY=true`.
Missing prerequisites **fail**, rather than reporting a skipped acceptance as PASS.
The new workflow uses pnpm with a frozen lockfile; a lockfile mismatch must be
resolved explicitly, never by silently changing package managers or lockfiles.

Local commands (protected command requires the same explicit prerequisites):

```sh
OPENSSL_CONF=/dev/null pnpm --dir backend exec jest --runInBand --runTestsByPath src/modules/cfdi/adapters/facturama/facturama.adapter.spec.ts src/modules/cfdi/stamp-reconciliation.job.spec.ts
OPENSSL_CONF=/dev/null pnpm --dir backend exec tsc --project tsconfig.build.json --noEmit --incremental false
OPENSSL_CONF=/dev/null pnpm --dir backend exec jest --config ./test/jest-facturama-recovery.json --runInBand
```

This is positive-evidence recovery, **not** a new provider guarantee. Search index
visibility, completeness under concurrent writes and uniqueness still need PAC
confirmation. A successful Sandbox test proves only its observed run. Until the
protected acceptance executes successfully, CFDI-001 remains **PARTIAL / NO-GO**.

### Local verification evidence

- RED before implementation: 12 failing tests, 71 passing tests (missing lookup
  and immediate missing-reference remediation). The indeterminate-status retry
  edge case also failed before its correction.
- GREEN: four focused suites, 112 tests passed; production TypeScript, scoped
  ESLint (zero warnings) and formatting checks passed.
- Protected acceptance stopped at missing explicit opt-ins, before any PAC call.
  Existing PostgreSQL E2E stopped at its disposable-database guard (six scenarios
  not reached). Neither result is runtime proof of recovery.
- Build failed cleaning generated `backend/dist/shared` with `EPERM`; the fiscal
  repository scan failed invoking Git with `EPERM`, including escalated retries.
  Git status also failed because `xcrun` cannot find the developer tools. The
  fiscal scanner's own three unit tests passed, not the repository scan.
- Test-inclusive TypeScript reports errors outside the changed CFDI files;
  no affected-file diagnostics were reported. No repository-wide PASS is claimed.

Rollback is this one recovery work unit: the optional port method, Facturama
lookup, missing-reference job branch, their tests/shared fixture and protected
workflow selector. No migration, fiscal-state reset, deletion of historical
attempts, package-manager change, commit or push is part of this correction.
