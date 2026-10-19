# LANDING-LEAD-CAPTURE-001 — Durable commercial lead capture

**Status: PARTIAL.** The local receiver stores a lead durably and captures one notification; no authorized production destination, mailbox delivery, owner-approved privacy notice or browser acceptance was verified. No CRM, ERP operational module or tenant database was changed. No commit, push or merge.

## Verdicts

| Gate | Verdict | Evidence / missing proof |
| --- | --- | --- |
| FORM_GO | PARTIAL | Form, validation, loading and acceptance tests pass; browser viewport/keyboard/accessibility acceptance blocked by host permissions. |
| RECEIVER_GO | LOCAL_PASS / PRODUCTION_PENDING | Real local POST, transactional persistence and independent SQLite readback pass. Public TLS deployment/backup acceptance pending. |
| NOTIFICATION_GO | LOCAL_CAPTURE_PASS / EXTERNAL_PENDING | One local captured message, failure/retry/concurrency tests pass. No external message sent or owner's inbox verified. |
| PRIVACY_GO | NO_GO | Public startup requires explicit owner approval and versioned notice URL. Actual notice, responsible-party identity and legal approval are missing. |
| COMMERCIAL_GO | NO_GO | Requires the missing privacy, deployment, browser and authorized real mailbox acceptance proofs. |

## Architecture and existing implementation audit

The existing `FinalCta` already supplied name/company/email/message, consent, honeypot, a loading lock and a two-second UX guard. `commercialConfig` already required public HTTPS endpoint/privacy URLs, and `demoRequest` required `{accepted:true}`. Header/Hero already use `getCommercialAction`; login stays separate. The gallery does not contain an independent commercial form/receiver. These were extended, not duplicated.

The ERP's `AppModule` imports operational modules, Prisma, JWT/permission guards and scheduled jobs. `configure-http-application.ts` applies ERP-specific CORS and body parsing. The approved backend Docker image pins Node 24.14.1. No reusable commercial SMTP/mailer/Resend integration was found in backend source/package configuration; ERP user email fields are not a notification transport.

**Selected:** separate Nest application/entrypoint `backend/src/commercial/main.ts`, reusing installed Nest, class-validator, Helmet and Node's built-in SQLite. It does **not** import `AppModule`, Prisma, ERP configuration or tenant services. Its independent file-backed database holds leads and a transactional outbox. Starting it needs no `DATABASE_URL`, PostgreSQL, domain, VPS or email subscription locally.

**Tradeoff:** local SQLite is simple, durable and dependency-free, but requires a private persistent local filesystem and a pinned Node runtime. Node 24.14.1 reports `node:sqlite` as experimental. This is a single-host, low-volume design, not distributed SQLite/network storage or a CRM. Horizontal multi-host scaling would require a separate commercial datastore; never repurpose a customer's database. [Node SQLite documentation](https://nodejs.org/docs/v24.14.1/api/sqlite.html).

### Files created

- `backend/src/commercial/config.ts`: fail-closed server configuration.
- `backend/src/commercial/lead.dto.ts`: server DTO validation using existing class-validator.
- `backend/src/commercial/store.ts`: durable SQLite storage, idempotency aliases, deduplication, persisted rate buckets and outbox claims.
- `backend/src/commercial/notification.ts`: escaped HTML/plain-text templates, reply-to, Resend HTTP and private local capture.
- `backend/src/commercial/receiver.ts`: isolated POST-only Nest application and sanitized error responses.
- `backend/src/commercial/main.ts`: independent startup and five-second outbox polling.
- `backend/src/commercial/status.ts`: private aggregate-only operator command; no public lead query endpoint.
- `backend/src/commercial/{receiver,notification}.spec.ts`: 19 server/integration/outbox tests.
- `backend/commercial.env.example`: server-only configuration template, no credentials or invented contacts.
- `landing/src/__tests__/leadCapture.test.ts`: durable receipt, retry, optional field, email and production-local-mode regression tests.
- `landing/e2e/lead_capture.py`: synthetic localhost-only Playwright scenario for the five requested widths and the full flow.
- `landing/evidence/LANDING-LEAD-CAPTURE-001/`: sanitized HTTP/readback, validation, browser-blocker and preservation evidence.
- This report.

### Files modified for this task

- `backend/package.json`: commercial startup scripts only; no dependencies/lockfile changes.
- `.gitignore`: commercial data/SQLite files excluded.
- `landing/src/components/FinalCta.tsx`: phone/interest, required consent, exact requested description and success copy, stable retry identity, duplicate/pending states and accessible focus/live region; explicit synthetic-mode notice.
- `landing/src/services/demoRequest.ts`: strengthened durable receipt contract, idempotency header and optional-field validation. Corrected the pre-existing overescaped email whitespace regex; ordinary addresses containing `s` are covered by regression tests.
- `landing/src/config/commercialConfig.ts`: privacy version and development-only local proxy URLs; HTTPS public URL policy remains unchanged in production.
- `landing/src/styles/landing.module.css`: existing form tokens/layout extended to selects and long references; no redesign or heading-color change.
- `landing/src/__tests__/commercial.test.tsx`: existing acceptance fixtures strengthened without removing task 005 coverage.
- `landing/vite.config.ts`: opt-in development-only loopback proxy and clearly synthetic privacy fixture; existing brand SEO retained.
- `landing/.env.example`: public version/local development instructions only.

## Receipt contract

`POST /leads`, JSON, maximum **16 KiB**. Exact authorized `Origin` required, including for non-browser test clients. `Idempotency-Key` must be a UUID v4. No cookies/ERP authentication.

```json
{
  "name": "Synthetic Person",
  "company": "Synthetic Business",
  "email": "lead@example.test",
  "phone": "",
  "interest": "inventario",
  "message": "",
  "consent": true,
  "website": "",
  "source": "landing-demo",
  "consentVersion": "demo-contact-v1"
}
```

Required name/company/email/consent; phone/interest/message optional. Limits: 100/160/254/40/2000 characters respectively. Interest is empty, `ventas`, `inventario`, `logistica`, `cobranza` or `erp`. Unknown properties, wrong types, nonempty honeypot, invalid email/phone, missing consent, invalid privacy version and inappropriate control characters fail validation. Names/company/email/phone and message are trimmed; email is lowercased. Template content is escaped, not executed.

After the SQLite commit (including payload, timestamp, consent/version, notice URL and immutable mail envelope), HTTP201 returns:

```json
{
  "accepted": true,
  "reference": "opaque-unique-reference",
  "receipt": "stored",
  "duplicate": false,
  "notification": "pending"
}
```

The same key/payload reuses the reference, even across restarts. A new key with identical normalized payload is deduplicated for 24 hours. Reusing any bound key for a different payload returns409. Successful duplicate responses explicitly say `duplicate:true` and do not enqueue another message. The browser keeps the same key when retrying unchanged data, generates a new key after edits, and still benefits from server deduplication after reload.

The frontend requires **all** receipt fields, not HTTP200 or `{accepted:true}` alone. It accepts `receipt:stored|delivered` for independently implemented external receivers, but this receiver only emits `stored`. Older external receivers must implement the strengthened contract before use.

Errors return `accepted:false` and generic codes; no input, recipient, secret or stack is returned. 400 invalid request, 403 unauthorized/missing origin, 409 conflicting key, 413 body limit, 429 rate limit (`Retry-After:600`), 503 reception/storage failure. No GET/list/detail/download lead endpoints exist. A stored lead with failed email is **not** a failed reception.

## Persistence, notifications and safe retries

SQLite uses WAL, `synchronous=FULL`, prepared statements, private directory/file permissions and immediate transactions. A lead and immutable mail envelope are committed together before acknowledgement. The database is independent from every customer deployment. Do not serve it from a public directory or put it in Git.

The worker atomically claims a row with a unique lease token, a 60-second lease and a ten-second provider timeout. Updates are token-bound; concurrent workers/connections cannot independently claim an unexpired row. A crashed claim can be recovered after lease expiry. Retried envelopes, recipients and `landing-lead/<reference>` provider key remain identical. The local capture table uses a unique message ID and also survives worker failure/restart.

Resend is configurable as the real provider; no new SDK/dependency was added. Its idempotency keys last 24 hours. Automatic retries stop conservatively at **23 hours after the first attempt**, then persist `reconcile` instead of risking another delivery. Exponential backoff starts at60 seconds, caps at one hour, and survives restart. Timeouts/unconfirmed responses remain pending. [Resend idempotency contract](https://resend.com/docs/dashboard/emails/idempotency-keys).

Mail uses the exact subject `Nueva solicitud de demostración — ERP`, every requested field, received date, public-landing origin, unique reference, a `reply_to` address and an escaped `mailto` action. HTML is responsive and has white headings; plain text is included. No automatic visitor email/marketing subscription is sent. `sent` means provider acceptance (or local capture), **not** proof of delivery to an inbox.

Operator monitoring, with server configuration injected by your service manager:

```bash
(cd backend && LEAD_DB_PATH=/absolute/private/leads.sqlite OPENSSL_CONF=/dev/null \
  npm exec -- ts-node src/commercial/status.ts)
```

Compiled equivalent from the repository root:

```bash
LEAD_DB_PATH=/absolute/private/leads.sqlite \
  node backend/dist/backend/src/commercial/status.js
```

Monitor pending age/process uptime, disk space and `reconcile` counts privately. Before resolving `reconcile`, inspect the provider's delivery history using the stored reference and `provider_id` if present. **Never blindly reset a row or generate a new key after the provider window.** An operator must establish non-delivery before any deliberate resend. No public retry/admin endpoint was introduced.

## Server/public configuration and local quick path

### Production configuration

Use `backend/commercial.env.example` as a server-only template; inject it through the service manager or a private deployment secret file. The app intentionally does not load the ERP `.env`.

| Server variable | Required value |
| --- | --- |
| `LEAD_MODE` | `production` (`local` only for loopback synthetic development) |
| `LEAD_DB_PATH` | Absolute dedicated durable path; persistent local disk, not a tenant database |
| `LEAD_ORIGINS` | Exact comma-separated HTTPS landing origins, no trailing slash/path/wildcards |
| `LEAD_PRIVACY_URL` | Actual published HTTPS privacy notice, no credentials/fragment |
| `LEAD_PRIVACY_VERSION` | Owner-approved version identifier, 1–80 letters/digits/`._-` |
| `LEAD_PRIVACY_APPROVED` | `true` only after actual owner/legal approval |
| `LEAD_PROVIDER` | `resend`; `capture` is rejected outside local mode |
| `LEAD_MAIL_TO`, `LEAD_MAIL_FROM` | Real authorized mailbox and provider-verified sender; both plain email addresses |
| `LEAD_RESEND_API_KEY` | Private provider API key |
| `LEAD_RATE_SECRET` | Private random value of at least32 characters, stable across restarts |
| `LEAD_PORT` | Dedicated port, default4010 |
| `LEAD_TRUST_PROXY_IPS` | Optional exact trusted edge IPs; empty means trust none |

Frontend public build values: `VITE_LANDING_LEAD_ENDPOINT=https://<receiver-origin>/leads`, `VITE_LANDING_PRIVACY_URL`, and matching `VITE_LANDING_PRIVACY_VERSION`. Never put provider keys, owner routing secrets or credentials in `VITE_*`. Rebuild after deployment configuration changes. A missing endpoint/notice keeps the form disabled and preserves the existing honest email/exploration fallback. `Acceso clientes` remains a separate login link.

The server fails startup without an approved notice, origins, durable path, rate secret and provider configuration. `LEAD_PRIVACY_APPROVED` is an owner attestation, not an automatic legal/content checker; changing the URL alone does not create an authentic notice.

### Local flow — synthetic data only

Run from the repository root, two terminals. No PostgreSQL or external email is used:

```bash
LEAD_MODE=local LEAD_PORT=4019 \
LEAD_DB_PATH=/tmp/lead-001-runtime-e2e/leads.sqlite \
LEAD_ORIGINS=http://localhost:5189 \
LEAD_PRIVACY_URL=http://localhost:5189/__lead-local/privacy \
LEAD_PRIVACY_VERSION=demo-contact-v1 LEAD_PRIVACY_APPROVED=true \
LEAD_PROVIDER=capture LEAD_RATE_SECRET=synthetic-local-rate-secret-001-only \
OPENSSL_CONF=/dev/null npm --prefix backend run start:commercial:local
```

```bash
LEAD_LOCAL_PROXY_PORT=4019 LANDING_VITE_CACHE_DIR=/tmp/lead-001-vite-e2e \
VITE_LANDING_LOCAL_LEADS=true \
VITE_LANDING_LEAD_ENDPOINT=/__lead-local/leads \
VITE_LANDING_PRIVACY_URL=/__lead-local/privacy \
OPENSSL_CONF=/dev/null npm --prefix landing run dev -- \
  --host 127.0.0.1 --port 5189 --strictPort
```

Open `http://localhost:5189/#demo`. The form visibly warns that data and mail are local/synthetic. The local notice is a test fixture, **not** a legally approved production notice. Its approval flag only enables this isolated synthetic test. No real contact information belongs here. The proxy/fixture are opt-in development-only; production builds reject their relative URLs.

Inspect captured HTML/text privately in the SQLite `captured_mail.envelope` field with an authorized local SQLite viewer. This contains personal information if misused: never publish/export it as public evidence. `/tmp` is for tests, not production persistence.

### Deployment remaining

Reuse the approved backend image with command `npm run start:commercial`, as a **separate service**. Do not add the commercial module to the ERP bootstrap. Provision a private persistent directory writable by the service's nonroot user (existing image uses `node`), configure TLS at the edge and expose only the receiver route. Do not mount customer volumes or pass customer database credentials. The container service definition, volume ownership, DNS/TLS and restart supervision must be completed on the chosen authorized host; none was deployed here.

Rate limits are durable: five non-OPTIONS requests per source IP per ten-minute fixed bucket, plus100 globally per bucket. CORS is not authentication and does not stop non-browser bots. Behind a proxy, trust only explicit proxy IPs after the edge overwrites forwarding headers and direct access is firewalled; otherwise all traffic shares the proxy IP bucket (safe but restrictive). Add edge abuse limits/body limits as well. Disable request-body/header capture in proxy logs/APM/session replay for this route/form.

Back up using SQLite's online backup API or a stopped/checkpointed database, **not** a blind live copy that omits WAL. Encrypt disks/backups, limit access to authorized commercial staff, verify restore into a separate commercial path and monitor free space. Retention/deletion, ARCO handling, backup expiry and provider history reconciliation need owner-approved operating procedures; no destructive retention policy was invented or executed.

## Mexico privacy approval checklist

Engineering controls are not legal approval. The owner/counsel must approve the actual responsible-party identity/address, data categories, contact purposes, use/disclosure limits, ARCO/revocation channels, notice-change mechanism, retention/security/breach procedures, and provider processing/any applicable transfers. Counsel must also approve how simplified/integral notice information is presented at collection. No owner identity, address, mailbox or legal policy was invented.

Reviewed the current [LFPDPPP, official Chamber of Deputies text](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf), last reform14 November2025: consent/minimization (7,12), notice (14–16), safeguards/confidentiality (18–20), ARCO (21 onwards), and transfers (35–36). This is a technical approval checklist, not legal advice. The checkbox records contact consent only, not an automatic contract or unrelated marketing permission. Until these decisions and the authentic notice are approved, **PRIVACY_GO and COMMERCIAL_GO stay NO_GO**.

## Validation evidence

All claims below are from this task, not historical task005/006 acceptance.

| Check | Result |
| --- | --- |
| Initial server RED | Failed as expected: receiver module did not yet exist |
| Initial frontend RED | Two durable-receipt/idempotency tests failed against previous service |
| Landing tests | PASS:57 tests across5 files |
| Landing lint / typecheck | PASS |
| Landing production build | PASS to `/tmp/lead-001-final-build` (existing cache/output untouched) |
| Applicable backend tests | PASS:19 commercial receiver/outbox tests across2 suites |
| Backend global `lint:check` | PASS, zero warnings |
| Backend production typecheck | PASS |
| Inclusive backend typecheck (all legacy tests) | FAIL:148 diagnostics outside `src/commercial/`; zero commercial diagnostics. Existing auth mocks/DTO fixtures and application test typings are out of scope; not repaired. |
| Standard backend `npm run build` | BLOCKED: EPERM removing existing `backend/dist/shared`, including escalated attempt; no host/output repair performed |
| Full backend TypeScript compilation to independent `/tmp` output | PASS; contains separate commercial entrypoint |
| Actual local HTTP201 → SQLite commit → captured email | PASS:one lead, one mail, duplicate returns same reference; independent disk readback |
| Real authorized external recipient | NOT RUN: no destination/credentials authorized or supplied |
| Playwright1440/1280/768/390/320 | BLOCKED before navigation; no screenshot or viewport/keyboard/reduced-motion PASS claimed |
| Git whitespace / prior-work hashes | PASS; existing005/006 evidence/reports retained |

Server tests cover valid requests, required fields, invalid email, consent, honeypot, invalid option/phone/length, stale privacy version, origins, body limit, rate abuse, conflicting/repeated requests, concurrency, write failure, disk reopen, mail failure/retry, immutable provider key/body, HTML escaping, stale leases and retry cutoff. Landing tests cover acceptance/failure/loading and missing commercial config. Integration tests use real disk-backed SQLite and actual Nest HTTP handling; provider failure responses are controlled test doubles, not production proof.

Browser attempts were bounded: shared MCP browser was locked/in use; installed isolated Chrome exited SIGABRT; installed Chromium headless shell failed MachPortRendezvous permission checks even with escalation. No shared browser was killed/repaired and no browser/toolchain configuration was changed. The reproducible script remains:

```bash
# Use an external Playwright Python environment and an installed Chrome;
# start the two local services above first. Only synthetic data on localhost.
python landing/e2e/lead_capture.py
# Optional LEAD_TEST_BROWSER points to an already installed compatible executable.
```

The script writes screenshots/results to `/tmp/lead-001-e2e`, not the public app. It expects a fresh synthetic DB or the identical one-lead fixture, and validates optional fields, layout bounds, white heading, keyboard tab, invalid native fields, consent, unconfirmed HTTP200 rejection, real local POST, stable retry key, duplicate identity and one captured mail. These assertions were **not executed** because browser launch failed. Screen-reader/native mobile acceptance also remains pending.

UI review guidance loaded: Emil Kowalski, Impeccable and frontend-design; existing approved carbon/warm-white/gold typography/motion retained. No added decorative animations.

| Before | After | Why |
| --- | --- | --- |
| Basic email-only acceptance | Durable receipt plus reference/state | No false positive from HTTP200 |
| Text inputs/textarea only | Existing form styling extended to select; visible focus/live status | Consistent controls and recoverable feedback |
| Generic success | Exact requested confirmation, duplicate/pending detail | Distinguish receipt from notification |

### Reproduce automated checks

```bash
OPENSSL_CONF=/dev/null npm --prefix landing test
OPENSSL_CONF=/dev/null npm --prefix landing run lint
OPENSSL_CONF=/dev/null npm --prefix landing run typecheck
OPENSSL_CONF=/dev/null LANDING_VITE_CACHE_DIR=/tmp/lead-cache \
  npm --prefix landing run build -- --outDir /tmp/lead-build
OPENSSL_CONF=/dev/null npm --prefix backend test -- --runInBand \
  --runTestsByPath src/commercial/receiver.spec.ts src/commercial/notification.spec.ts
OPENSSL_CONF=/dev/null npm --prefix backend run lint:check
OPENSSL_CONF=/dev/null npm --prefix backend run typecheck
# Inclusive test typecheck currently reports148 out-of-scope diagnostics:
(cd backend && OPENSSL_CONF=/dev/null npm exec tsc -- --noEmit --incremental false)
OPENSSL_CONF=/dev/null npm --prefix backend run build
# If the existing dist is protected, do not delete/repair it. Compile separately:
(cd backend && OPENSSL_CONF=/dev/null npm exec -- tsc \
  --project tsconfig.build.json --incremental false --outDir /tmp/lead-backend-build)
git diff --check
```

## Git and preservation

The tree was already dirty with task005/006 changes. A before-hash manifest was taken before edits.46 prior source/report/evidence files remain byte-identical; only these prior-dirty files were intentionally extended: `commercial.test.tsx`, `landing.module.css`, and `vite.config.ts`. Existing005 additions in those files were retained. `preservation.json` reports no unexpected changes. New task files remain untracked for review; no staging, checkout, reset, stash, commit, push or merge occurred. No operational database was opened/written by this task.

Receipt-driven review mode was read-only queried and was enabled by default; no review was started, no independent reviewer was launched (linear/no-subagent constraint), and no approval receipt is claimed. This is not release acceptance. Review/delivery policy must be resolved before a later authorized commit/deployment.

## Next owner actions

Approve/publish the authentic notice and collection wording; supply the authorized recipient, verified sender and server provider secret; select the host/origins and provision private storage/TLS/monitoring/backups; complete blocked browser acceptance; then send one authorized real lead and verify both durable receipt and delivery to the owner's inbox. Only then reassess the five gates, especially COMMERCIAL_GO.
