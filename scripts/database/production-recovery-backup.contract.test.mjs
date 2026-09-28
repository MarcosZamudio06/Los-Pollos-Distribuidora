import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const servicePath =
  "docs/runbooks/systemd/pollos-distribuidor-recovery-set-backup.service";
const timerPath =
  "docs/runbooks/systemd/pollos-distribuidor-recovery-set-backup.timer";

function parseDurationHours(value) {
  const match = /^(\d+)(h|min|m|s)$/u.exec(value.trim());
  assert.ok(match, `unsupported duration in systemd contract: ${value}`);
  const amount = Number(match[1]);
  return match[2] === "h"
    ? amount
    : match[2] === "m" || match[2] === "min"
      ? amount / 60
      : amount / 3600;
}

test("recovery backup service runs the full-set dispatcher after Docker is ready", () => {
  const service = read(servicePath);

  assert.match(service, /^Requires=docker\.service$/mu);
  assert.match(service, /^After=.*docker\.service.*network-online\.target/mu);
  assert.match(service, /^User=root$/mu);
  assert.match(service, /^UMask=0077$/mu);
  assert.match(
    service,
    /^EnvironmentFile=\/etc\/pollos-distribuidor\/production\.env$/mu,
  );
  assert.match(
    service,
    /^EnvironmentFile=-\/etc\/pollos-distribuidor\/postgres-backup\.env$/mu,
  );
  assert.match(
    service,
    /^EnvironmentFile=\/etc\/pollos-distribuidor\/recovery-set-backup\.env$/mu,
  );
  assert.match(
    service,
    /^ExecStart=\/opt\/pollos-distribuidor\/scripts\/database\/run-production-recovery-set-backup\.sh$/mu,
  );
  assert.match(service, /^TimeoutStartSec=8h$/mu);
  assert.match(service, /^TimeoutStopSec=3min$/mu);
  assert.doesNotMatch(service, /backup-postgres-to-b2\.sh/u);
});

test("persistent recovery timer leaves enough margin under the sample RPO", () => {
  const timer = read(timerPath);
  const service = read(servicePath);
  const runner = read("scripts/database/run-production-recovery-set-backup.sh");
  const example = read(".env.production.example");

  assert.match(timer, /^Persistent=true$/mu);
  assert.match(timer, /^OnCalendar=\*-\*-\* 00,12:00:00 UTC$/mu);
  assert.match(timer, /^RandomizedDelaySec=30m$/mu);
  assert.match(timer, /^Unit=pollos-distribuidor-recovery-set-backup\.service$/mu);

  const timeout = /^TimeoutStartSec=(\S+)$/mu.exec(service)?.[1];
  const delay = /^RandomizedDelaySec=(\S+)$/mu.exec(timer)?.[1];
  const accuracy = /^AccuracySec=(\S+)$/mu.exec(timer)?.[1];
  const rpo = /^BACKUP_RPO_HOURS=(\d+)$/mu.exec(example)?.[1];
  assert.ok(timeout && delay && accuracy && rpo, "service, timer, and example must declare RPO inputs");
  const maximumValidatedGapHours =
    12 + parseDurationHours(delay) + parseDurationHours(accuracy) + parseDurationHours(timeout);
  assert.ok(
    maximumValidatedGapHours < Number(rpo),
    `timer/runtime envelope (${maximumValidatedGapHours}h) must be below BACKUP_RPO_HOURS (${rpo}h)`,
  );
  const minimumRpo = /^readonly RECOVERY_BACKUP_MIN_RPO_HOURS=(\d+)$/mu.exec(runner)?.[1];
  assert.equal(Number(minimumRpo), Math.ceil(maximumValidatedGapHours));
});

test("single-company and multi-company modes use complete recovery-set commands", () => {
  const runner = read("scripts/database/run-production-recovery-set-backup.sh");
  const runnerPath = new URL(
    "../../scripts/database/run-production-recovery-set-backup.sh",
    import.meta.url,
  );

  assert.ok(statSync(runnerPath).mode & 0o111, "systemd ExecStart script must be executable");
  assert.match(runner, /RECOVERY_BACKUP_MODE/u);
  assert.match(runner, /BACKUP_RPO_HOURS/u);
  assert.match(runner, /single-company/u);
  assert.match(runner, /COMPANY_SLUG/u);
  assert.match(runner, /BACKUP_COMPOSE_ENV_FILE/u);
  assert.match(runner, /create-company-recovery-set\.sh/u);
  assert.match(runner, /multi-company/u);
  assert.match(runner, /tenantctl\.mjs/u);
  for (const variable of [
    "TENANTCTL_MANIFEST_PATH",
    "TENANTCTL_LOCAL_DEPLOYMENT_HOST_REF",
    "TENANTCTL_ENV_DIR",
    "TENANTCTL_RESOLVER_PATH",
    "TENANTCTL_OPERATOR",
    "TENANTCTL_BACKUP_APPROVAL_REF",
    "TENANTCTL_BACKUP_TIMEOUT_SECONDS",
    "TENANTCTL_AUDIT_LOG",
  ]) {
    assert.match(runner, new RegExp(variable, "u"));
  }
  assert.match(runner, /TENANTCTL_LOCAL_DEPLOYMENT_HOST_REF/u);
  assert.match(runner, /--manifest/u);
  assert.match(runner, /--env-dir/u);
  assert.match(runner, /--resolver/u);
  assert.match(runner, /--apply/u);
  assert.match(runner, /--reason/u);
  assert.match(runner, /--confirm/u);
  assert.match(runner, /flock/u);
  assert.doesNotMatch(runner, /backup-postgres-to-b2\.sh/u);
});

test("dispatcher refuses an RPO shorter than the timer/runtime envelope before starting work", () => {
  const runner = read("scripts/database/run-production-recovery-set-backup.sh");
  const rpoGuard = runner.indexOf("BACKUP_RPO_HOURS < RECOVERY_BACKUP_MIN_RPO_HOURS");
  const dependencyChecks = runner.indexOf("for dependency in flock node python3");
  const lockAcquisition = runner.indexOf('exec 9>"$RECOVERY_BACKUP_LOCK_FILE"');

  assert.ok(rpoGuard >= 0);
  assert.ok(dependencyChecks > rpoGuard, "RPO must be rejected before dependency checks");
  assert.ok(lockAcquisition > rpoGuard, "RPO must be rejected before acquiring the host lock");
  assert.match(runner, /below the installed recovery timer\/runtime envelope/u);
  assert.match(runner, /exit 2/u);
  assert.doesNotMatch(runner, /ACCESS_KEY|SECRET_ACCESS_KEY|PASSWORD\s*=\s*.*printf/u);
});

test("production sample config binds backup monitoring to complete recovery sets and the RPO", () => {
  const example = read(".env.production.example");

  assert.match(example, /^COMPANY_SLUG=/mu);
  assert.match(example, /^BACKUP_RPO_HOURS=24$/mu);
  assert.match(example, /^MONITOR_RECOVERY_SET_MODE=single-company$/mu);
  assert.match(example, /^MONITOR_RECOVERY_SET_RESULT_ROOT=\/var\/lib\/pollos-distribuidor$/mu);
  assert.match(example, /^MONITOR_TENANT_MANIFEST_PATH=$/mu);
  assert.match(example, /^MONITOR_LOCAL_DEPLOYMENT_HOST_REF=$/mu);
  assert.doesNotMatch(example, /^MONITOR_BACKUP_MAX_AGE_HOURS=/mu);
});

test("legacy PostgreSQL-only systemd automation is removed and migration is documented", () => {
  const docs = read("docs/runbooks/production-recovery-set-backup.md");

  assert.equal(
    existsSync(new URL("../../docs/runbooks/systemd/pollos-distribuidor-postgres-backup.timer", import.meta.url)),
    false,
  );
  assert.equal(
    existsSync(new URL("../../docs/runbooks/systemd/pollos-distribuidor-postgres-backup.service", import.meta.url)),
    false,
  );
  assert.match(docs, /disable --now pollos-distribuidor-postgres-backup\.timer/u);
  assert.match(docs, /enable --now pollos-distribuidor-recovery-set-backup\.timer/u);
  assert.match(docs, /journalctl -u pollos-distribuidor-recovery-set-backup\.service/u);
  assert.match(docs, /chmod 600/u);
  assert.match(docs, /## Recovery-set retention/u);
  assert.match(docs, /BACKUP_RETENTION_DAILY/u);
  assert.match(docs, /Invalid or missing manifests stop retention without/u);
  assert.match(docs, /BACKUP_FAILED_KEEP_COUNT/u);
  assert.doesNotMatch(docs, /Pre-enable gate/u);
});
