# Provision production routing providers

Provision production-grade, backend-reachable Photon, VROOM, and OSRM
endpoints before deploying the ERP. In this document, **managed** means that
the platform team owns their deployment, security, updates, monitoring, and
recovery. It does not mean replacing the self-hosted/internal provider contract
with unapproved public APIs.

## Required outcome

| Variable             | Provider responsibility                  | Required exposure                               |
| -------------------- | ---------------------------------------- | ----------------------------------------------- |
| `PHOTON_URL`         | Forward and reverse geocoding            | Private; backend only                           |
| `VROOM_URL`          | Single-vehicle stop optimization         | Private; backend only                           |
| `OSRM_URL`           | Driving geometry, distance, and duration | Private; VROOM and backend                      |
| `ROUTING_TIMEOUT_MS` | Backend provider timeout                 | `10000` unless load tests justify another value |

The UI must never call these providers directly. Production endpoints must not
use `localhost`, development hostnames, or unencrypted public addresses.

## Delivery sequence

```text
Ownership and SLOs
  -> network and DNS
  -> OSRM
  -> Photon
  -> VROOM
  -> security and observability
  -> staging proof
  -> production rollout
```

## Tasks

### DEPLOY-ROUTING-001 — Assign ownership and operational targets

**Depends on:** none

- [ ] Assign a platform owner and an application owner.
- [ ] Select the approved production runtime and region.
- [ ] Define availability, latency, recovery, and data-freshness targets.
- [ ] Define the expected request rate and maximum route size.
- [ ] Record an incident escalation channel and maintenance window.

**Evidence:** approved ownership record and measurable SLOs.

### DEPLOY-ROUTING-002 — Prepare private network, DNS, and TLS

**Depends on:** DEPLOY-ROUTING-001

- [ ] Create the private network path from the backend to all three providers.
- [ ] Reserve stable internal DNS names for Photon, VROOM, and OSRM.
- [ ] Terminate TLS with certificates trusted by the backend runtime.
- [ ] Deny direct Internet access to provider ports unless explicitly required
      for controlled data updates.
- [ ] Allow OSRM access from both the backend and VROOM.
- [ ] Prove DNS resolution and TLS validation from the backend network.

**Evidence:** network diagram, firewall rules, DNS records, and successful TLS
connection tests from a backend-equivalent workload.

### DEPLOY-ROUTING-003 — Provision OSRM for Mexico driving routes

**Depends on:** DEPLOY-ROUTING-002

- [ ] Deploy a pinned OSRM image or immutable artifact.
- [ ] Import the approved OpenStreetMap dataset covering the operational area.
- [ ] Build routing data with the `driving` profile.
- [ ] Persist generated routing data outside the disposable application layer.
- [ ] Define a controlled dataset refresh and rollback procedure.
- [ ] Configure health checks, resource limits, and automatic restart.
- [ ] Verify a known Mexico route returns geometry, meters, and seconds.

**Evidence:** image digest, dataset date/source, internal endpoint, health result,
and a reproducible route response.

### DEPLOY-ROUTING-004 — Provision self-hosted Photon

**Depends on:** DEPLOY-ROUTING-002

- [ ] Deploy a pinned Photon image or immutable artifact.
- [ ] Import the approved OpenStreetMap data required for Mexican addresses.
- [ ] Persist the search index and document its rebuild procedure.
- [ ] Configure Spanish-language and Mexico-scoped query verification.
- [ ] Configure health checks, resource limits, and automatic restart.
- [ ] Verify forward and reverse geocoding with known operational addresses.

**Evidence:** image digest, dataset date/source, internal endpoint, index rebuild
procedure, and reproducible forward/reverse results.

### DEPLOY-ROUTING-005 — Provision VROOM against production OSRM

**Depends on:** DEPLOY-ROUTING-003

- [ ] Deploy a pinned VROOM image or immutable artifact.
- [ ] Configure VROOM to use the production OSRM driving endpoint.
- [ ] Set request-size, duration, and resource limits from the approved SLOs.
- [ ] Configure health checks and automatic restart.
- [ ] Verify one vehicle starts and ends at the same operational origin.
- [ ] Verify unreachable or unassigned stops are reported without a partial
      route result.

**Evidence:** image digest, internal endpoint, OSRM dependency configuration,
and reproducible optimization results.

### DEPLOY-ROUTING-006 — Apply security controls

**Depends on:** DEPLOY-ROUTING-003, DEPLOY-ROUTING-004, DEPLOY-ROUTING-005

- [ ] Run containers or workloads as non-root where supported.
- [ ] Use read-only filesystems except for declared data volumes.
- [ ] Scan pinned images and define patching SLAs for critical findings.
- [ ] Restrict inbound traffic to approved backend/VROOM identities.
- [ ] Restrict provider data-update jobs to approved sources.
- [ ] Verify logs do not expose customer addresses, credentials, or secrets.
- [ ] Record OpenStreetMap attribution and data-license obligations.

**Evidence:** security scan, effective network policy, runtime identity, and
license/attribution record.

### DEPLOY-ROUTING-007 — Add monitoring, alerting, and recovery

**Depends on:** DEPLOY-ROUTING-003, DEPLOY-ROUTING-004, DEPLOY-ROUTING-005

- [ ] Collect availability, latency, timeout, error-rate, CPU, memory, disk, and
      restart metrics per provider.
- [ ] Centralize structured logs with provider and correlation identifiers.
- [ ] Alert on failed health checks, sustained error rate, exhausted resources,
      and stale datasets.
- [ ] Back up configuration and persistent data that cannot be rebuilt within
      the recovery target.
- [ ] Exercise provider restart, data rebuild, and rollback procedures.

**Evidence:** dashboards, alert tests, backup policy, and recovery exercise
results.

### DEPLOY-ROUTING-008 — Register production configuration securely

**Depends on:** DEPLOY-ROUTING-002 through DEPLOY-ROUTING-007

- [ ] Store the three real internal endpoint URLs in the approved production
      configuration or secrets system.
- [ ] Set `ROUTING_TIMEOUT_MS=10000` initially.
- [ ] Grant configuration access only to the deployment identity and authorized
      operators.
- [ ] Confirm no endpoint is committed to source control or copied into a
      frontend build variable.
- [ ] Render the official production Compose file with the production values.

**Required command:**

```bash
docker compose -f docker-compose.production.yml config >/dev/null
```

**Evidence:** redacted configuration record, access policy, and successful
Compose rendering. Evidence must show variable presence without exposing
credentials or sensitive infrastructure details.

### DEPLOY-ROUTING-009 — Prove the complete flow in staging

**Depends on:** DEPLOY-ROUTING-008

- [ ] Deploy the backend with production-equivalent provider configuration.
- [ ] Verify forward geocoding through `GET /api/geocoding/search`.
- [ ] Verify reverse geocoding through `GET /api/geocoding/reverse`.
- [ ] Optimize a route with one origin and at least two confirmed-sale stops.
- [ ] Verify the final OSRM geometry, distance, duration, and stop order.
- [ ] Verify provider timeouts return an identifiable, retryable `503`.
- [ ] Verify provider failures create no partial route, inventory, payment, or
      settlement records.
- [ ] Capture latency against the approved SLOs.

**Evidence:** redacted API requests/responses, database consistency checks, and
provider/backend logs linked by correlation identifier.

### DEPLOY-ROUTING-010 — Execute production rollout and rollback proof

**Depends on:** DEPLOY-ROUTING-009

- [ ] Take required backups or confirm the documented rebuild path.
- [ ] Deploy providers before the backend release that consumes their URLs.
- [ ] Run provider health checks from the production backend network.
- [ ] Deploy the backend and verify its readiness endpoint.
- [ ] Execute one controlled geocoding request and one controlled route plan.
- [ ] Monitor the agreed rollout window.
- [ ] Exercise or tabletop the rollback to the previous provider/backend
      configuration.

**Evidence:** change record, health outputs, smoke-test results, monitoring
snapshot, and rollback decision record.

### DEPLOY-ROUTING-011 — Close documentation and operational handoff

**Depends on:** DEPLOY-ROUTING-010

- [ ] Update the deployment runbook with provider ownership, non-sensitive DNS
      names, dashboards, alerts, data refresh, recovery, and escalation.
- [ ] Record image versions/digests and dataset versions in the release record.
- [ ] Add scheduled verification for certificate expiry and dataset freshness.
- [ ] Confirm application support can distinguish Photon, VROOM, and OSRM
      failures from backend failures.

**Evidence:** reviewed runbook and signed operational handoff.

## Production acceptance gate

Production routing is ready only when every item below is proven:

- [ ] All three endpoints are real, private, TLS-valid, and reachable from the
      production backend network.
- [ ] VROOM reaches the production OSRM endpoint.
- [ ] Provider versions and map dataset dates are recorded.
- [ ] Security scans have no unresolved critical findings.
- [ ] Monitoring, alerts, recovery, and ownership are active.
- [ ] Production Compose renders with the real configuration.
- [ ] Staging proves geocoding, optimization, geometry, failure behavior, and
      absence of partial business records.
- [ ] Production smoke tests pass without manually correcting data.

## Canonical references

- `specs/modules/routes-delivery/spec.md`
- `specs/.specs/03-api/delivery-api.md`
- `docker-compose.production.yml`
- `backend/src/modules/delivery/routing-providers.service.ts`
- `docs/runbooks/backend-deployment.md`

## Explicitly out of scope

- Replacing Photon, VROOM, or OSRM with a different provider.
- Exposing provider URLs to the browser.
- Live GPS tracking, automatic rerouting, or multi-vehicle optimization.
- Modifying application or database code as part of this deployment plan.
