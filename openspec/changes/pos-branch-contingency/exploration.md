# POS branch contingency exploration

## Decision summary

Adopt a branch edge node as the target contingency architecture. Every POS terminal talks to the branch node over the LAN, and the branch node remains the transactional authority for that branch when the cloud or Internet is unavailable. Synchronization uses a transactional outbox/inbox protocol; it does not replay browser state or replicate tables with last-write-wins rules.

Do not implement a browser-only sales queue as an interim shortcut. It creates a second inventory authority per terminal, cannot coordinate simultaneous terminals safely, and would later need to be replaced by the branch node.

This document is an exploration, not yet a canonical business rule. The open policy thresholds must be approved before proposal and specification work.

## Exploration: POS branch contingency

### Current State

- `SalesPosPage` treats `navigator.onLine` as transaction availability and blocks confirmation when it is false.
- `navigator.onLine` only describes the browser's network interface heuristic. It cannot prove that the API, PostgreSQL, authentication, or the selected branch is ready to commit a sale.
- The API client has no bounded readiness probe or availability classification. A failed `fetch` is handled only after attempting the command.
- Docker Compose checks PostgreSQL with `pg_isready`, but the backend healthcheck only verifies that its TCP port accepts a connection. There is no application endpoint that proves a transaction can reach PostgreSQL.
- Sale creation already has useful foundations: atomic database writes, persistent idempotency keys, branch inventory, registered terminals, cash shifts, payments, and traceable inventory movements.
- There is no transactional outbox, central inbox, sync checkpoint, folio lease, branch replica state, durable browser queue, or service worker sales workflow.
- The current deployment stack can run locally, but it is a single-stack development topology rather than an edge/cloud synchronization architecture.

### Availability model

The POS must use explicit operational states rather than a boolean online flag:

| State | Meaning | Checkout behavior |
| --- | --- | --- |
| `READY_SYNCED` | Branch API and local database accept transactions; central synchronization is current. | Normal policy. |
| `READY_LOCAL` | Branch API and local database accept transactions; cloud synchronization is unavailable or delayed. | Approved contingency policy. |
| `RESTRICTED_LOCAL` | Local transactions work, but a freshness, folio, auth, disk, or backlog threshold is near its limit. | Cash-only restricted policy. |
| `RECOVERING` | Connectivity returned and the node is draining/reconciling its backlog. | Local sales continue unless a specific aggregate is conflicted. |
| `BLOCKED` | Branch API, local database, terminal provisioning, or a mandatory local dependency cannot guarantee a durable commit. | No sale registration. Preserve the draft cart. |

`navigator.onLine` may remain a diagnostic hint, but it must never authorize or reject a sale. A short-lived `GET /api/pos/readiness` probe should report the state, while the sale command remains the final authority to avoid time-of-check/time-of-use errors.

Suggested readiness response:

```json
{
  "state": "READY_LOCAL",
  "acceptingTransactions": true,
  "branchId": "branch-1",
  "terminalId": "terminal-1",
  "localDatabase": "READY",
  "centralSync": "UNAVAILABLE",
  "lastSuccessfulSyncAt": "2026-07-27T18:20:00Z",
  "oldestPendingEventAt": "2026-07-27T18:21:04Z",
  "pendingEventCount": 18,
  "masterDataVersion": 421,
  "folioLeaseRemaining": 734
}
```

The public response must not expose infrastructure credentials, database details, or other terminal identities.

### Target topology

```text
POS terminals and local peripherals
             |
          Branch LAN
             |
  Branch edge API + PostgreSQL
     |                  |
 local transactions   outbox dispatcher
                         |
                    secure Internet
                         |
              central inbox + ERP cloud
```

The branch edge node should provide:

- The POS frontend and branch API over the local network.
- A local PostgreSQL database with encrypted storage, monitored disk capacity, automated backups, and UPS protection.
- Branch-scoped catalog, prices, users, permissions, terminal assignments, inventory, shifts, and current business-date data.
- Local printing support. Scale integration remains a later approved hardware phase; the current MVP keeps manual scale capture.
- A supervised sync worker with retry, backoff, jitter, checkpoints, and operator-visible failure states.

### Ownership rules

The central requirement is single-writer ownership, not merely data replication.

| Aggregate | Writer during normal and contingency operation |
| --- | --- |
| Branch POS sales, immediate payments, branch inventory movements | Branch edge node |
| Branch cash shifts and daily close | Branch edge node |
| Product and price master data | Central ERP, replicated as versioned effective-dated data |
| Customer and credit policy | Central ERP; only approved snapshots or grants may be used locally |
| Cross-branch transfer workflow | Central orchestration with explicit origin and destination acknowledgements |

The cloud must not directly mutate a branch-owned inventory aggregate while that branch is partitioned. Cloud orders affecting that branch remain pending until the edge acknowledges reservation or fulfillment. Central inventory views must show their `asOf` time and sync state rather than presenting stale balances as current.

### Local transaction boundary

A contingency sale is successful only when one local PostgreSQL transaction commits all of the following:

1. Sale and items.
2. Immediate payments.
3. Inventory movements and branch balances.
4. Cash-shift attribution.
5. Internal sale document and immutable display folio.
6. One or more outbox events.

The printed ticket can state `Registered locally - pending synchronization`, but it must never be printed as successful before that transaction commits. A cloud acknowledgement is not required for local success.

### Synchronization protocol

Use application-level events, not uncoordinated table replication.

- Each outbox event has a globally unique event ID, branch ID, aggregate ID, aggregate sequence, schema version, payload hash, creation time, retry state, and acknowledgement time.
- Business rows and outbox events commit atomically in the same local transaction.
- The edge sends ordered batches over TLS with branch/device credentials. Mutual TLS or signed branch credentials are preferred over a shared installation secret.
- The central inbox stores the event ID before applying it. Duplicate delivery returns the prior acknowledgement without duplicating effects.
- Central application and inbox acknowledgement commit atomically.
- Events are ordered per aggregate. One poison aggregate must not stop unrelated aggregate streams.
- Retries use exponential backoff with jitter. Events are never silently discarded; terminal failures enter an operator-visible conflict queue.
- Central-to-edge master data uses versioned inbox messages and checkpoints. Updates are effective-dated so an in-flight cart does not silently change price.
- Acknowledged events remain retained for an approved audit period before archival.

Conflict handling must be deterministic:

| Conflict | Resolution |
| --- | --- |
| Duplicate event | Automatic inbox deduplication. |
| Reused idempotency key with another payload | Reject and require supervisor investigation. |
| Folio collision | Prevent through central range leasing; never renumber a committed sale. |
| Stale product or price version | Apply the price snapshot used by the committed sale and flag policy drift for review. |
| Negative local inventory | Reject locally before commit; never repair with last-write-wins. |
| Central order competing for offline branch stock | Keep central order pending until branch acknowledgement. |
| Clock difference | Preserve edge commit time and central receipt time; alert on excessive skew. |

### Folios and identifiers

- Technical IDs must be globally unique and generated locally, such as UUIDv7.
- Display folios must come from ranges leased by the central ERP to each branch or terminal before an outage.
- A committed local folio is immutable after synchronization.
- Low remaining ranges move the node to `RESTRICTED_LOCAL`; exhaustion blocks new sales instead of inventing uncontrolled folios.
- Lease size, replenishment threshold, and number format require business approval.

### Authentication and authorization

The current short-lived cloud JWT flow is insufficient for a prolonged outage by itself.

- The edge keeps a minimal, encrypted cache of active branch users, roles, terminal assignments, and revocation/version metadata.
- Prefer asymmetric central signatures so an edge can verify grants without possessing the cloud signing secret.
- The central ERP issues bounded offline operation grants for a user, branch, terminal, allowed operations, and expiry.
- The edge records every local authorization decision and the grant version used.
- Offline grant lifetime, reauthentication behavior, emergency revocation lag, and supervisor permissions require explicit policy.
- Sensitive administrative operations remain cloud-only unless a separately scoped emergency grant is approved.

### Contingency policy

Recommended initial policy:

| Operation | `READY_SYNCED` | `READY_LOCAL` | `RESTRICTED_LOCAL` |
| --- | --- | --- | --- |
| Cash sale with local stock | Allow | Allow | Allow within configured limits |
| Card payment | Allow with acquirer approval | Allow only if the acquirer independently authorizes | Block otherwise |
| Transfer/deposit as immediate payment | Allow under normal validation | Block unless independently verifiable | Block |
| Credit sale | Allow under central credit checks | Block by default | Block |
| Standard effective price | Allow | Allow from versioned local snapshot | Allow until snapshot expiry |
| Manual or sensitive discount | Allow with normal authorization | Block unless backed by an unexpired one-use grant | Block |
| New customer or credit change | Allow | Block | Block |
| Void of an unsynchronized local sale | Allow with audit and role checks | Allow with local supervisor policy | Restrict to supervisor |
| Void of a synchronized or external sale | Normal central workflow | Block | Block |
| Shift close | Allow | Allow locally and mark pending sync | Allow if backlog policy permits |
| Final branch daily close | Allow | Local close may be pending; central finalization waits for reconciliation | Block if backlog/freshness limits are exceeded |

This matrix is intentionally conservative. Credit, discounts, card terminal behavior, and maximum isolation time are business-risk decisions, not technical defaults.

### POS experience

The cashier should never choose between cloud and local modes manually.

- Replace the binary `En línea/Sin conexión` indicator with the explicit operational state, last synchronization time, and pending count.
- Keep the cart editable when transactions are blocked.
- Show restrictions before payment selection, not after the cashier has collected money.
- After a local commit, show a durable local sale ID, folio, sync status, and print action.
- Add a `Pending synchronization` workspace with filters for pending, retrying, synchronized, and action-required records.
- Automatic retries require no cashier action. Only conflicts with a defined remediation path expose supervisor actions.
- Shift close displays pending event count and whether central reconciliation is outstanding.
- Recovery must not interrupt active carts or convert committed local sales back into drafts.

### Operational safeguards

- Central operations dashboard per branch: edge heartbeat, local database state, disk, clock skew, software version, last sync, queue depth, oldest event age, folio availability, and conflict count.
- Alerts based on queue age and remaining operating envelope, not only node uptime.
- Structured logs correlate sale ID, idempotency key, event ID, branch, terminal, shift, and sync attempt.
- Encrypted local backups must be restore-tested. A backup that has never been restored is not a contingency plan.
- Provide runbooks for Internet outage, cloud outage, edge API failure, local database failure, LAN failure, disk exhaustion, certificate expiry, and prolonged reconciliation.
- Define recovery objectives for Internet/cloud loss separately from edge-node loss. The branch node removes cloud dependency but becomes local critical infrastructure.

### Browser queue alternative

A browser queue is acceptable only as a deliberately limited fallback if the business cannot deploy edge infrastructure.

Minimum controls would include IndexedDB rather than `localStorage`, encrypted payload envelopes, durable idempotency keys, leased folios, cached versioned master data, a local inventory allowance, cash-only restrictions, an explicit pending-sales workspace, and deterministic conflict handling.

Even with those controls, multiple terminals cannot safely share one branch inventory view while isolated. Each browser becomes a writer with stale knowledge. Therefore this alternative has lower infrastructure cost but materially higher oversell, support, security, and reconciliation risk. It is not recommended for this multi-terminal POS.

### Rollout

1. **Truthful availability**: add application readiness that verifies the branch API and database; replace `navigator.onLine` as the blocker. Continue blocking unavailable transactions at this stage.
2. **Edge shadow mode**: deploy one branch node as a local API proxy/read replica while the cloud remains authoritative. Validate monitoring, updates, backups, identity, and LAN behavior.
3. **Cash-sale pilot**: make the edge authoritative for cash sales, payments, shifts, inventory, folios, and outbox delivery in one branch.
4. **Recovery and reconciliation**: prove duplicate delivery, reordered retries, long outages, disk pressure, expired credentials, and restore from backup before expanding.
5. **Multi-branch rollout**: expand with operational dashboards, remote support, signed updates, and branch-specific rollback procedures.
6. **Policy expansion**: consider bounded offline credit, exceptional discounts, card behavior, and hardware adapters only after measured pilot evidence and explicit approval.

A rollback cannot simply redirect terminals to cloud writes while the edge contains unacknowledged sales. The branch must first drain and reconcile its outbox, or remain blocked under a controlled recovery procedure.

### Affected Areas

- `frontend/src/features/ventas/SalesPosPage.tsx` - replace browser network heuristics with operational readiness and contingency states.
- `frontend/src/lib/api.ts` - classify timeout, unavailable, rejected, and uncertain command outcomes.
- `backend/src/modules/sales/` - preserve local transaction and idempotent command boundaries.
- `backend/src/modules/cash-management/` - local shift ownership and pending-sync close state.
- `backend/prisma/schema.prisma` - outbox, inbox, checkpoints, folio leases, grants, and sync metadata.
- `docker-compose.yml` and `docker/` - separate cloud and branch-edge deployment profiles, health, storage, and secure connectivity.
- `specs/.specs/01-architecture/architecture.md` - deployment topology and writer ownership.
- `specs/.specs/03-api/sales-api.md` - readiness, contingency command, idempotency, and uncertain-result contracts.
- `specs/.specs/03-api/inventory-api.md` - branch ownership, freshness, and central order behavior.
- `specs/.specs/04-ui/sales-pos.md` - operational states, restrictions, and synchronization workspace.
- `specs/.specs/05-testing/` - partition, retry, duplicate, ordering, recovery, and restore scenarios.

### Approaches

1. **Branch edge node** - local API and PostgreSQL remain authoritative for branch POS operations and synchronize by outbox/inbox.
   - Pros: coordinates multiple terminals, preserves atomicity, supports local inventory and peripherals, and provides zero local data loss after commit.
   - Cons: introduces distributed-system operations, local infrastructure, secure remote management, and reconciliation complexity.
   - Effort: High.

2. **Encrypted browser queue** - each browser stores restricted sale commands and submits them later.
   - Pros: lower infrastructure cost and faster limited deployment.
   - Cons: fragmented inventory authority, weaker device security, difficult multi-terminal conflict handling, browser lifecycle risk, and a second implementation path.
   - Effort: Medium initially, high once reconciliation and support costs are included.

### Recommendation

Proceed with the branch edge node. Implement truthful readiness first, but do not confuse that improvement with offline capability. Then pilot cash-only local authority with transactional outbox/inbox, leased folios, bounded offline grants, and explicit central reconciliation.

Do not combine both alternatives in the first delivery. Running an edge database and independent browser queues creates two local authorities and makes inventory correctness harder, not safer.

### Risks

- A single edge node becomes a branch-level dependency unless UPS, backups, monitoring, and an approved repair or standby strategy exist.
- Symmetric shared JWT secrets would increase blast radius on a compromised branch node; offline authorization needs a dedicated key and grant model.
- Central orders and cross-branch inventory can oversell unless single-writer ownership is enforced during partitions.
- Stale prices, credit, permissions, and customer status require expiration rules; unlimited offline operation is unsafe.
- Synchronization correctness needs integration and fault-injection testing that the repository does not currently provide.
- Scale integration remains outside the current MVP contract and must not be implied by the contingency rollout.

### Open decisions

- Maximum time a branch may operate without central synchronization.
- Warning, restriction, and blocking thresholds for queue age, queue size, disk, master-data age, and folio inventory.
- Offline grant lifetime and supervisor permissions.
- Whether any credit, card, transfer, cancellation, or exceptional discount is allowed in contingency.
- Folio range size, ownership scope, and replenishment threshold.
- Edge hardware, UPS, encrypted backup, warm-spare, and recovery-time targets.
- Cloud-order behavior while a branch is isolated.
- Event retention, payload encryption, certificate rotation, and remote-update policy.

### Ready for Proposal

No. The architecture direction is clear, but the contingency policy matrix, maximum isolation window, folio policy, and edge recovery objectives require product, finance, operations, and security approval before canonical specs or implementation tasks are created.
