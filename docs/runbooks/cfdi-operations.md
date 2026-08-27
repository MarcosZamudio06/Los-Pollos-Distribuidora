# CFDI diagnosis and recovery runbooks

Use these procedures to restore fiscal operation without repeating an uncertain
PAC command or changing fiscal truth manually. PostgreSQL, `Invoice`,
`FiscalOperationAttempt`, and `FiscalArtifact` remain authoritative.

## Quick safety rules

1. Capture only opaque IDs, timestamps, stable error codes, and states.
2. Never paste PAC credentials, CSD material, authorization headers, signed
   download URLs, XML, PDF bytes, or provider response bodies into tickets or
   logs.
3. Never retry `stamp` or `cancel` when the last attempt is `UNKNOWN`.
4. Never repair UUIDs, fiscal states, or artifact metadata with direct SQL.
5. Prefer the invoice status/cancellation APIs and `cfdi.*` structured events.
6. Redact customer identity before sharing operational evidence.

Fiscal dependency health is reported by `GET /api/health/dependencies`. It
checks local PostgreSQL fiscal metadata only; it does not contact the PAC and
does not participate in `GET /api/health/ready`.

## Evidence bundle

For every incident record:

- incident start/end in UTC;
- environment and deployment revision;
- invoice, attempt, and correlation IDs;
- last stable `cfdi.*` event and error code;
- invoice fiscal state, attempt state, artifact state, and retry timestamp;
- recovery action and exit criterion.

Do not attach XML or signed artifact URLs.

## 1. PAC unavailable

**Signal:** `cfdi.stamp.failed`, `cfdi.stamp.unknown`, or the equivalent REP or
cancel event reports a stable provider availability/timeout code.

**Diagnose:** Confirm whether the attempt is terminal or `UNKNOWN`. Compare
several correlation IDs to distinguish a PAC outage from one invalid invoice.
Check provider status externally without sending a fiscal command.

**Recover:** For terminal availability failures, wait for the PAC recovery and
use the normal idempotent business action. For `UNKNOWN`, do not stamp again;
allow `StampReconciliationJob` to query status under its PostgreSQL advisory
lock.

**Exit:** A completed/failed terminal event exists and no processing attempt is
stale.

## 2. Unknown stamp state after timeout

**Signal:** `Invoice.fiscalStatus=UNKNOWN` and `cfdi.stamp.unknown`.

**Diagnose:** Use `GET /api/billing/invoices/{invoiceId}/status`. Confirm the
persisted provider reference, attempt ID, correlation ID, and next retry time.

**Recover:** Do not issue another POST. Let `StampReconciliationJob` perform
status/recovery. If retries are exhausted, follow the generated
`BillingDataRemediation`; a human must resolve missing references or a UUID
conflict.

**Exit:** The invoice is `STAMPED`, terminally failed, or has an explicit open
remediation. It must not remain silently ambiguous.

## 3. STAMPED invoice without XML

**Signal:** The invoice is `STAMPED`, but its latest XML artifact is absent,
`PENDING`, or `FAILED`; `GET /api/billing/invoices/{invoiceId}/xml` returns a
stable artifact error.

**Diagnose:** Confirm UUID and stamped timestamp exist. Inspect only artifact
metadata, provider reference, stable error code, and `cfdi.artifact.*` events.

**Recover:** Invoke the approved maintenance path for
`FiscalArtifactService.recoverMissingArtifacts(invoiceId)`. This downloads by
the persisted provider reference and never stamps again. If no controlled
maintenance runner exists, escalate for one; do not call the service through an
ad-hoc public endpoint or mutate artifact rows.

**Exit:** XML is `AVAILABLE`, checksum/readback metadata exists, and an
authorized download request succeeds.

## 4. XML available but PDF generation failed

**Signal:** XML is `AVAILABLE`; PDF is `FAILED` or missing.

**Diagnose:** Confirm the fiscal UUID from metadata is stable. Filter
`cfdi.artifact.failed` by invoice ID and artifact type `PDF`.

**Recover:** Run the same approved artifact recovery path. A PDF failure is an
artifact concern and must never downgrade a confirmed stamp or trigger another
stamp.

**Exit:** PDF becomes `AVAILABLE`, or the incident remains an explicit
recoverable artifact failure while XML delivery continues.

## 5. Customer did not receive the invoice

**Signal:** Fiscal and artifact states are healthy, but delivery was not
received.

**Diagnose:** Verify authorized XML/PDF download endpoints work and that the
customer's destination channel is correct. Do not copy signed URLs into logs;
they are short lived.

**Recover:** Generate fresh authorized download URLs and resend through the
approved delivery channel. Do not reuse expired URLs and do not attach data to
an unrelated customer record.

**Exit:** Delivery is acknowledged or a channel-specific incident is opened;
fiscal state remains unchanged.

## 6. Pending cancellation

**Signal:** Cancellation status is `PENDING` or `UNKNOWN`, with
`cfdi.cancel.reconciliation.*` events.

**Diagnose:** Use `GET /api/billing/invoices/{invoiceId}/cancellation`. Confirm
the cancellation attempt and next retry time. Never infer cancellation from a
successful HTTP submission alone.

**Recover:** Let `CancellationStatusJob` query status under its PostgreSQL
advisory lock. Never call cancel again for the same uncertain attempt. Do not
release billing applications until `CANCELLED` is confirmed.

**Exit:** `CANCELLED`, `REJECTED`, or explicit remediation is persisted, and a
cancellation acknowledgment is either available or tracked as recoverable.

## 7. Database UUID does not match XML

**Signal:** Stable code `FISCAL_ARTIFACT_UUID_MISMATCH` or a reconciliation
UUID mismatch.

**Diagnose:** Compare the normalized UUID reported by trusted metadata tools;
do not paste or parse full XML in tickets. Confirm invoice ID, artifact ID,
provider reference, and hashes.

**Recover:** Stop automatic promotion and open/retain
`BillingDataRemediation`. Obtain authoritative confirmation from PAC/SAT and
follow an approved data-correction procedure. Never update `Invoice.uuid` or
XML metadata directly.

**Exit:** A reviewed correction restores one consistent UUID, or the invoice
remains blocked with explicit remediation.

## 8. CSD nearing expiration

**Signal:** `cfdi.certificate.expiry.expiring` or
`cfdi.certificate.expiry.expired` identifies an opaque legal entity ID and
days remaining.

**Diagnose:** Review the legal entity's public certificate metadata. Do not
retrieve or log private key material or its password.

**Recover:** Provision the replacement CSD through the approved secret store,
then update only the validated public metadata/reference through the fiscal
configuration workflow. Schedule activation before expiration and validate in
sandbox.

**Exit:** The enabled issuer has a future validity interval, the next job check
reports no expiry alert, and no secret was persisted in PostgreSQL.

## 9. Invalid PAC credentials

**Signal:** Stable provider authentication or credentials-unavailable code.

**Diagnose:** Verify credential reference, environment, and exact PAC origin.
Do not print secret values or test them against an arbitrary host.

**Recover:** Rotate/fix credentials in the approved secret store, restart or
reload through the deployment procedure, and validate with the protected PAC
sandbox workflow. Retry only a terminally failed operation; reconcile an
unknown operation instead.

**Exit:** Sandbox validation succeeds and new fiscal events contain only stable
codes and opaque IDs.

## 10. Artifact restoration

**Signal:** Object storage loss/corruption, checksum mismatch, or multiple
`cfdi.artifact.failed` events.

**Diagnose:** Freeze destructive storage actions. Inventory affected artifact
metadata and compare object checksums through trusted tooling without copying
contents into logs.

**Recover:** Restore the object-storage backup to an isolated location, verify
checksums, and promote through the storage recovery procedure. For artifacts
still retrievable from the PAC, use the approved
`recoverMissingArtifacts(invoiceId)` maintenance path. Never delete confirmed
metadata or re-stamp to recreate a file.

**Exit:** Every affected artifact has verified bytes matching PostgreSQL
metadata, authorized downloads work, and the incident records the restored
backup/recovery boundary.

## Escalate immediately

- UUID mismatch, unsafe XML, missing provider reference, or exhausted unknown
  retries;
- any suspected credential/CSD disclosure;
- a request to alter fiscal truth directly in PostgreSQL;
- an artifact restore whose checksum does not match authoritative metadata.
