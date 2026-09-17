#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  copyFileSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

import { validateCompanyManifest } from "./validate-company-manifest.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "../..");
const DEFAULT_COMPOSE_FILE = resolve(
  DEFAULT_REPOSITORY_ROOT,
  "docker-compose.production.yml",
);
const DEFAULT_CADDY_TEMPLATE_FILE = resolve(
  DEFAULT_REPOSITORY_ROOT,
  "Caddyfile.production",
);
const DEFAULT_CFDI_COMPOSE_FILE = resolve(
  DEFAULT_REPOSITORY_ROOT,
  "docker/multi-company/docker-compose.cfdi.yml",
);

const COMMANDS = new Set([
  "list",
  "validate",
  "provision",
  "migrate",
  "backup",
  "restore-drill",
  "bootstrap",
  "status",
]);
const MUTATING_COMMANDS = new Set([
  "provision",
  "migrate",
  "backup",
  "restore-drill",
  "bootstrap",
]);
const AUDITABLE_RESULTS = new Set([
  "started",
  "succeeded",
  "planned",
  "failed",
  "timed_out",
  "skipped",
]);
const OPERATIONAL_COMMANDS = new Set([
  "status",
  "migrate",
  "backup",
  "restore-drill",
]);
const DEFAULT_OPERATION_TIMEOUT_SECONDS = 1800;
const MAX_OPERATION_TIMEOUT_SECONDS = 86400;
const OPERATOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._@-]{1,63}(?![\s\S])/;
const AUDIT_REFERENCE_PATTERN = /^[A-Z][A-Z0-9]{1,9}-[0-9]{1,12}(?![\s\S])/;
const SENSITIVE_AUDIT_REFERENCE_PATTERN =
  /(?:^|[-_.])(?:PASS(?:WORD|WD)?|SECRET|TOKEN|JWT|PRIVATE(?:KEY)?|ACCESS(?:KEY)?|CREDENTIALS?)(?:$|[-_.])/i;
const SECRET_SHAPED_OPERATOR_PATTERN =
  /^(?:AKIA|ASIA)[A-Z0-9]{16}$|^[a-f0-9]{40,}$|^[A-Za-z0-9_-]{28,}$|^(?:eyJ[A-Za-z0-9_-]*\.){2}[A-Za-z0-9_-]+$/i;
const RUNTIME_SERVICES = [
  "postgres",
  "object-storage",
  "backend",
  "photon",
  "osrm",
  "vroom",
  "tileserver",
  "frontend",
];
const BASE_SECRET_PURPOSES = [
  "database",
  "jwtAccess",
  "jwtRefresh",
  "objectStorage",
];
const BOOTSTRAP_SECRET_PURPOSE = "bootstrapAdmin";
const SECRET_REFERENCE_PATTERN =
  /^(?:vault|docker-secret|aws-sm|gcp-sm|azure-kv|op):\/\/[A-Za-z0-9][A-Za-z0-9._/-]{0,478}(?![\s\S])/;
const IMMUTABLE_IMAGE_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:/-]*@sha256:[a-f0-9]{64}$/i;
const DOCKER_CONTEXT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}(?![\s\S])/;
const URL_SAFE_DATABASE_PASSWORD_PATTERN = /^[A-Za-z0-9._~-]+(?![\s\S])/;
const BACKUP_REGION_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?![\s\S])/;
const COMPANY_RECOVERY_SET_KEY_PATTERN =
  /^recovery-sets\/[a-z0-9]+(?:-[a-z0-9]+)*\/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}Z-[0-9]+-[0-9]+\.manifest\.json(?![\s\S])/;
const PAC_DOCKER_SECRET_PATTERN =
  /^docker-secret:\/\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})(?![\s\S])/;
const REQUIRED_COMPOSE_SERVICES = [
  "postgres",
  "object-storage",
  "migrate",
  "bootstrap",
  "backend",
  "photon",
  "osrm",
  "vroom",
  "tileserver",
  "frontend",
];
const RESOLVER_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "VAULT_ADDR",
  "VAULT_NAMESPACE",
  "VAULT_TOKEN",
  "VAULT_CACERT",
  "VAULT_CLIENT_CERT",
  "VAULT_CLIENT_KEY",
  "AWS_PROFILE",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_SHARED_CREDENTIALS_FILE",
  "AWS_CONFIG_FILE",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
  "AWS_ROLE_ARN",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "CLOUDSDK_CONFIG",
  "AZURE_CONFIG_DIR",
  "AZURE_TENANT_ID",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  "OP_SERVICE_ACCOUNT_TOKEN",
];
const DOCKER_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "DOCKER_CONFIG",
  "SSH_AUTH_SOCK",
  "LANG",
  "LC_ALL",
];
const SENSITIVE_ENV_NAME_PATTERN =
  /(?:^|_)(?:PASSWORD|PASSWD|SECRET|TOKEN|ACCESS_KEY(?:_ID)?|API_KEY|PRIVATE_KEY|CLIENT_SECRET|APPLICATION_KEY|CREDENTIALS?)(?:_|$)/i;
const USAGE = [
  "Usage:",
  "  tenantctl list --manifest <path> [--company <slug>] [--operator <id>] [--audit-log <external-jsonl>]",
  "  tenantctl <command> --manifest <path> [--company <slug>]",
  "    (--env-file <external-config> | --env-dir <external-tenant-config-root>)",
  "    --resolver <absolute-executable> [--timeout-seconds <seconds>]",
  "    [--dry-run | --apply] [--continue-on-error] [--operator <id>]",
  "    [--audit-log <external-jsonl>] [--reason <ticket-id> --confirm]",
  "  tenantctl migrate --manifest <path> --company <production-slug>",
  "    --env-dir <external-tenant-config-root> --resolver <absolute-executable>",
  "    --canary --apply --reason <ticket-id> --confirm",
  "  tenantctl provision ... --output-dir <external-tenant-dir> [--replace-generated-config]",
  "",
  "Commands: list, validate, provision, status, migrate, backup, restore-drill, bootstrap",
  "Mutating commands require --apply. Sensitive --apply commands also require --reason <ticket-id> and --confirm.",
  "Use --dry-run to inspect a read-only plan without the reason/confirmation flags.",
  "Every tenant command requires --operator or TENANTCTL_OPERATOR and appends a secret-free JSONL audit record outside the repository.",
  "The default audit log is $HOME/.tenantctl/audit.jsonl; override with --audit-log or TENANTCTL_AUDIT_LOG.",
  "Provision writes tenant .env and Caddy artifacts outside the repository with --output-dir.",
  "Batch operations read <env-dir>/<tenant-slug>/.env.production in manifest order.",
  "Production migration batches require a successful, matching --canary run.",
  "The external config file must contain non-secret KEY=VALUE settings only.",
].join("\n");

class TenantctlError extends Error {}

class TenantctlUsageError extends Error {}

class TenantctlTimeoutError extends TenantctlError {}

class TenantctlAuditError extends TenantctlError {}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function safeMessage(error) {
  if (error instanceof TenantctlError || error instanceof TenantctlUsageError) {
    return error.message;
  }
  return "tenantctl failed; details were suppressed.";
}

function requireOption(options, key) {
  const value = options[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new TenantctlUsageError("Missing required option: --" + key);
  }
  return value;
}

export function parseTenantctlArgs(argv) {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    return { help: true };
  }
  if (argv.length === 0) {
    throw new TenantctlUsageError("A command is required.");
  }

  const command = argv[0];
  if (!COMMANDS.has(command)) {
    throw new TenantctlUsageError("Unsupported command.");
  }

  const valueOptions = new Map([
    ["--manifest", "manifestPath"],
    ["--company", "companySlug"],
    ["--env-file", "envFilePath"],
    ["--env-dir", "envDirectory"],
    ["--resolver", "resolverPath"],
    ["--output-dir", "outputDirectory"],
    ["--timeout-seconds", "timeoutSecondsInput"],
    ["--operator", "operator"],
    ["--audit-log", "auditLogPath"],
    ["--reason", "reason"],
  ]);
  const booleanOptions = new Map([
    ["--dry-run", "dryRun"],
    ["--apply", "apply"],
    ["--replace-generated-config", "replaceGeneratedConfig"],
    ["--continue-on-error", "continueOnError"],
    ["--canary", "canary"],
    ["--confirm", "confirm"],
  ]);
  const parsed = { command, dryRun: false, apply: false };
  const seen = new Set();

  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (valueOptions.has(argument)) {
      if (seen.has(argument)) {
        throw new TenantctlUsageError("Options may not be repeated.");
      }
      seen.add(argument);
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new TenantctlUsageError("Option value is missing.");
      }
      parsed[valueOptions.get(argument)] = value;
      index += 1;
      continue;
    }
    if (booleanOptions.has(argument)) {
      if (seen.has(argument)) {
        throw new TenantctlUsageError("Options may not be repeated.");
      }
      seen.add(argument);
      parsed[booleanOptions.get(argument)] = true;
      continue;
    }
    throw new TenantctlUsageError("Unsupported option.");
  }

  requireOption(parsed, "manifestPath");
  if (
    parsed.companySlug !== undefined &&
    !/^[a-z0-9]+(?:-[a-z0-9]+)*(?![\s\S])/.test(parsed.companySlug)
  ) {
    throw new TenantctlUsageError(
      "--company must be a lowercase DNS-safe slug.",
    );
  }
  if (
    parsed.operator !== undefined &&
    (!OPERATOR_ID_PATTERN.test(parsed.operator) ||
      SECRET_SHAPED_OPERATOR_PATTERN.test(parsed.operator))
  ) {
    throw new TenantctlUsageError(
      "--operator must be a non-secret operator identifier.",
    );
  }
  if (
    parsed.reason !== undefined &&
    (!AUDIT_REFERENCE_PATTERN.test(parsed.reason) ||
      SENSITIVE_AUDIT_REFERENCE_PATTERN.test(parsed.reason))
  ) {
    throw new TenantctlUsageError(
      "--reason must be a ticket reference such as MTE-007; free-form text is not recorded.",
    );
  }
  if (parsed.auditLogPath !== undefined && !isAbsolute(parsed.auditLogPath)) {
    throw new TenantctlUsageError(
      "--audit-log must be an absolute external path.",
    );
  }

  if (command === "list") {
    if (
      parsed.envFilePath ||
      parsed.envDirectory ||
      parsed.resolverPath ||
      parsed.outputDirectory ||
      parsed.timeoutSecondsInput ||
      parsed.apply ||
      parsed.dryRun ||
      parsed.canary ||
      parsed.continueOnError ||
      parsed.replaceGeneratedConfig ||
      parsed.confirm
    ) {
      throw new TenantctlUsageError(
        "list accepts --manifest, an optional --company filter, and audit identity/path options only.",
      );
    }
    return parsed;
  }

  if (OPERATIONAL_COMMANDS.has(command)) {
    const resolverPath = requireOption(parsed, "resolverPath");
    if (!isAbsolute(resolverPath)) {
      throw new TenantctlUsageError(
        "--resolver must be an absolute executable path.",
      );
    }
    if (parsed.envFilePath && parsed.envDirectory) {
      throw new TenantctlUsageError(
        "Use either --env-file or --env-dir, not both.",
      );
    }
    if (parsed.envDirectory && !isAbsolute(parsed.envDirectory)) {
      throw new TenantctlUsageError("--env-dir must be an absolute path.");
    }
    if (parsed.envFilePath && !parsed.companySlug) {
      throw new TenantctlUsageError("--env-file requires --company.");
    }
    if (!parsed.envFilePath && !parsed.envDirectory) {
      throw new TenantctlUsageError(
        "A single-tenant operation requires --env-file; batch operations require --env-dir.",
      );
    }
    if (!parsed.companySlug && !parsed.envDirectory) {
      throw new TenantctlUsageError("Batch operations require --env-dir.");
    }
    if (parsed.timeoutSecondsInput !== undefined) {
      if (!/^[0-9]+(?![\s\S])/.test(parsed.timeoutSecondsInput)) {
        throw new TenantctlUsageError(
          "--timeout-seconds must be a whole number between 1 and 86400.",
        );
      }
    }
    const timeoutSeconds = parsed.timeoutSecondsInput
      ? Number(parsed.timeoutSecondsInput)
      : DEFAULT_OPERATION_TIMEOUT_SECONDS;
    if (
      !Number.isSafeInteger(timeoutSeconds) ||
      timeoutSeconds < 1 ||
      timeoutSeconds > MAX_OPERATION_TIMEOUT_SECONDS
    ) {
      throw new TenantctlUsageError(
        "--timeout-seconds must be between 1 and 86400.",
      );
    }
    parsed.timeoutMs = timeoutSeconds * 1000;
    if (parsed.continueOnError && parsed.companySlug) {
      throw new TenantctlUsageError(
        "--continue-on-error is only supported for batch operations.",
      );
    }
    if (parsed.canary && command !== "migrate") {
      throw new TenantctlUsageError("--canary is only supported by migrate.");
    }
    if (parsed.canary && (!parsed.companySlug || !parsed.envDirectory)) {
      throw new TenantctlUsageError(
        "migrate --canary requires --company and --env-dir.",
      );
    }
  } else {
    const companySlug = requireOption(parsed, "companySlug");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?![\s\S])/.test(companySlug)) {
      throw new TenantctlUsageError(
        "--company must be a lowercase DNS-safe slug.",
      );
    }
    requireOption(parsed, "envFilePath");
    const resolverPath = requireOption(parsed, "resolverPath");
    if (!isAbsolute(resolverPath)) {
      throw new TenantctlUsageError(
        "--resolver must be an absolute executable path.",
      );
    }
    if (parsed.envDirectory) {
      throw new TenantctlUsageError(
        "--env-dir is only supported by operational commands.",
      );
    }
    if (parsed.canary || parsed.continueOnError || parsed.timeoutSecondsInput) {
      throw new TenantctlUsageError(
        "Canary, batch continuation, and timeout options are only supported by operational commands.",
      );
    }
  }

  if (parsed.apply && parsed.dryRun) {
    throw new TenantctlUsageError("--apply and --dry-run cannot be combined.");
  }
  if (command === "provision") {
    const outputDirectory = parsed.outputDirectory;
    if (typeof outputDirectory !== "string" || outputDirectory.length === 0) {
      throw new TenantctlUsageError("Missing required option: --output-dir");
    }
    if (!isAbsolute(outputDirectory)) {
      throw new TenantctlUsageError("--output-dir must be an absolute path.");
    }
  } else if (parsed.outputDirectory) {
    throw new TenantctlUsageError(
      "--output-dir is only supported by provision.",
    );
  }
  if (
    parsed.replaceGeneratedConfig &&
    (command !== "provision" || !parsed.apply)
  ) {
    throw new TenantctlUsageError(
      "--replace-generated-config requires provision --apply.",
    );
  }
  if (MUTATING_COMMANDS.has(command)) {
    if (!parsed.apply && !parsed.dryRun) {
      throw new TenantctlUsageError(
        command + " requires --apply, or use --dry-run.",
      );
    }
    if (parsed.apply) {
      requireOption(parsed, "reason");
      if (!parsed.confirm) {
        throw new TenantctlUsageError(
          command + " --apply requires explicit --confirm.",
        );
      }
    }
    if (parsed.confirm && !parsed.apply) {
      throw new TenantctlUsageError("--confirm requires --apply.");
    }
  } else if (parsed.apply || parsed.dryRun) {
    throw new TenantctlUsageError(
      "--apply and --dry-run are only supported by mutating commands.",
    );
  } else if (parsed.confirm) {
    throw new TenantctlUsageError(
      "--confirm is only supported by sensitive --apply commands.",
    );
  }

  return parsed;
}

function getDependencies(overrides = {}) {
  return {
    cwd: overrides.cwd ?? process.cwd(),
    env: overrides.env ?? process.env,
    repositoryRoot: overrides.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT,
    composeFile: overrides.composeFile ?? DEFAULT_COMPOSE_FILE,
    caddyTemplateFile:
      overrides.caddyTemplateFile ?? DEFAULT_CADDY_TEMPLATE_FILE,
    cfdiComposeFile: overrides.cfdiComposeFile ?? DEFAULT_CFDI_COMPOSE_FILE,
    readFile: overrides.readFile ?? ((path) => readFileSync(path, "utf8")),
    realpath: overrides.realpath ?? realpathSync,
    lstat: overrides.lstat ?? lstatSync,
    stat: overrides.stat ?? statSync,
    open: overrides.open ?? openSync,
    fstat: overrides.fstat ?? fstatSync,
    write: overrides.write ?? writeSync,
    fsync: overrides.fsync ?? fsyncSync,
    close: overrides.close ?? closeSync,
    mkdir: overrides.mkdir ?? mkdirSync,
    writeFile: overrides.writeFile ?? writeFileSync,
    copyFile: overrides.copyFile ?? copyFileSync,
    rename: overrides.rename ?? renameSync,
    remove: overrides.remove ?? rmSync,
    mkdtemp: overrides.mkdtemp ?? mkdtempSync,
    spawn: overrides.spawn ?? spawnSync,
    stdout: overrides.stdout ?? process.stdout,
    stderr: overrides.stderr ?? process.stderr,
    now: overrides.now ?? Date.now,
  };
}

function pathIsInside(parentPath, candidatePath) {
  const pathFromParent = relative(parentPath, candidatePath);
  return (
    pathFromParent === "" ||
    (pathFromParent !== ".." &&
      !pathFromParent.startsWith(".." + sep) &&
      !isAbsolute(pathFromParent))
  );
}

function resolveAuditOperator(options, deps) {
  const operator = options.operator ?? deps.env.TENANTCTL_OPERATOR;
  if (
    typeof operator !== "string" ||
    !OPERATOR_ID_PATTERN.test(operator) ||
    SECRET_SHAPED_OPERATOR_PATTERN.test(operator)
  ) {
    throw new TenantctlUsageError(
      "Set TENANTCTL_OPERATOR or pass --operator with a non-secret operator identifier.",
    );
  }
  return operator;
}

function createAuditWriter(options, deps) {
  const configuredPath = options.auditLogPath ?? deps.env.TENANTCTL_AUDIT_LOG;
  const homeDirectory = deps.env.HOME || homedir();
  const requestedPath =
    configuredPath || join(homeDirectory, ".tenantctl", "audit.jsonl");
  if (!isAbsolute(requestedPath)) {
    throw new TenantctlAuditError(
      "The tenantctl audit log must use an absolute external path; operation was not started.",
    );
  }

  const candidatePath = resolve(requestedPath);
  let fileDescriptor;
  try {
    const repositoryRoot = deps.realpath(deps.repositoryRoot);
    if (pathIsInside(repositoryRoot, candidatePath)) {
      throw new Error("Repository path is not an audit destination.");
    }

    const requestedParent = dirname(candidatePath);
    deps.mkdir(requestedParent, { recursive: true, mode: 0o700 });
    const realParent = deps.realpath(requestedParent);
    const parentInfo = deps.stat(realParent);
    if (
      !parentInfo.isDirectory() ||
      (process.platform !== "win32" && (parentInfo.mode & 0o022) !== 0)
    ) {
      throw new Error("Audit parent is not private from untrusted writers.");
    }

    const auditPath = join(realParent, basename(candidatePath));
    if (pathIsInside(repositoryRoot, auditPath)) {
      throw new Error("Repository path is not an audit destination.");
    }
    try {
      const existingInfo = deps.lstat(auditPath);
      if (
        existingInfo.isSymbolicLink() ||
        !existingInfo.isFile() ||
        (process.platform !== "win32" && (existingInfo.mode & 0o077) !== 0)
      ) {
        throw new Error("Audit file is not a private regular file.");
      }
    } catch (error) {
      if (!isMissingPath(error)) throw error;
    }

    const flags =
      fsConstants.O_WRONLY |
      fsConstants.O_APPEND |
      fsConstants.O_CREAT |
      (fsConstants.O_NOFOLLOW ?? 0);
    fileDescriptor = deps.open(auditPath, flags, 0o600);
    const fileInfo = deps.fstat(fileDescriptor);
    if (
      !fileInfo.isFile() ||
      (process.platform !== "win32" && (fileInfo.mode & 0o077) !== 0)
    ) {
      throw new Error("Audit file is not a private regular file.");
    }

    return {
      append(records) {
        const bytes = Buffer.from(
          records.map((record) => JSON.stringify(record)).join("\n") + "\n",
          "utf8",
        );
        let offset = 0;
        try {
          while (offset < bytes.length) {
            const written = deps.write(
              fileDescriptor,
              bytes,
              offset,
              bytes.length - offset,
            );
            if (!Number.isInteger(written) || written <= 0) {
              throw new Error("Audit append was incomplete.");
            }
            offset += written;
          }
          deps.fsync(fileDescriptor);
        } catch {
          throw new TenantctlAuditError(
            "Tenantctl could not persist audit metadata; the command outcome requires manual verification.",
          );
        }
      },
      close() {
        if (fileDescriptor !== undefined) {
          try {
            deps.close(fileDescriptor);
          } catch {
            // A prior append/fsync result is the source of truth for this run.
          }
          fileDescriptor = undefined;
        }
      },
    };
  } catch {
    if (fileDescriptor !== undefined) {
      try {
        deps.close(fileDescriptor);
      } catch {
        // Preserve the generic audit-sink failure below.
      }
    }
    throw new TenantctlAuditError(
      "The tenantctl audit log is unavailable or insecure; operation was not started.",
    );
  }
}

function writeAuditEvents(deps, events) {
  if (events.length === 0) return;
  const audit = deps.auditContext;
  if (!audit?.writer) {
    throw new TenantctlAuditError(
      "Tenantctl audit context is unavailable; operation stopped.",
    );
  }

  const records = events.map((event) => {
    const tenantSlug =
      typeof event.tenant === "string" ? event.tenant : event.tenant?.slug;
    const company = audit.manifest?.companies.find(
      (candidate) => candidate.slug === tenantSlug,
    );
    const targetEnvironment =
      typeof event.tenant === "object" && event.tenant?.environment
        ? event.tenant.environment
        : (company?.environment ?? null);
    if (
      typeof tenantSlug !== "string" ||
      !AUDITABLE_RESULTS.has(event.result)
    ) {
      throw new TenantctlAuditError(
        "Tenantctl could not build a valid audit record; command stopped.",
      );
    }

    return {
      protocolVersion: 1,
      operator: audit.operator,
      tenant: tenantSlug,
      command: audit.command,
      timestamp: new Date(deps.now()).toISOString(),
      runId: audit.runId,
      targetEnvironment,
      result: event.result,
      durationMs: Math.max(
        0,
        Number.isFinite(event.durationMs) ? event.durationMs : 0,
      ),
      ...(audit.reason ? { reason: audit.reason } : {}),
    };
  });
  audit.writer.append(records);
}

function writeTenantAuditEvent(deps, tenant, result, durationMs = 0) {
  writeAuditEvents(deps, [{ tenant, result, durationMs }]);
}

function writeOperationalAuditResults(results, deps) {
  writeAuditEvents(
    deps,
    results.map((result) => ({
      tenant: result.tenant,
      result: result.status,
      durationMs: result.durationMs,
    })),
  );
}

function isMissingPath(error) {
  return error && typeof error === "object" && error.code === "ENOENT";
}

function pathInfoOrUndefined(path, deps) {
  try {
    return deps.lstat(path);
  } catch (error) {
    if (isMissingPath(error)) return undefined;
    throw error;
  }
}

function resolveExternalFile(inputPath, deps, { executable = false } = {}) {
  let realPath;
  let info;
  try {
    realPath = deps.realpath(resolve(deps.cwd, inputPath));
    info = deps.stat(realPath);
  } catch {
    throw new TenantctlError(
      executable
        ? "The external resolver is unavailable."
        : "The external config file is unavailable.",
    );
  }
  if (!info.isFile()) {
    throw new TenantctlError(
      executable
        ? "The external resolver must be an executable file."
        : "The external config must be a regular file.",
    );
  }
  if (process.platform !== "win32" && (info.mode & 0o022) !== 0) {
    throw new TenantctlError(
      executable
        ? "The external resolver must not be group/world-writable."
        : "The external config must not be group/world-writable.",
    );
  }
  if (executable && process.platform !== "win32" && (info.mode & 0o111) === 0) {
    throw new TenantctlError("The external resolver must be executable.");
  }
  if (
    !executable &&
    pathIsInside(deps.realpath(deps.repositoryRoot), realPath)
  ) {
    throw new TenantctlError(
      "The external config must be outside the repository.",
    );
  }
  return realPath;
}

function resolveExternalDirectory(inputPath, deps) {
  let realPath;
  let suppliedInfo;
  let info;
  try {
    const suppliedPath = resolve(deps.cwd, inputPath);
    suppliedInfo = deps.lstat(suppliedPath);
    realPath = deps.realpath(suppliedPath);
    info = deps.stat(realPath);
  } catch {
    throw new TenantctlError(
      "The external tenant config directory is unavailable.",
    );
  }
  if (suppliedInfo.isSymbolicLink() || !info.isDirectory()) {
    throw new TenantctlError(
      "The external tenant config root must be a non-symlink directory.",
    );
  }
  if (
    process.platform !== "win32" &&
    ((info.mode & 0o022) !== 0 || (info.mode & 0o400) === 0)
  ) {
    throw new TenantctlError(
      "The external tenant config directory must not be group/world-writable and must be readable by its owner.",
    );
  }
  if (pathIsInside(deps.realpath(deps.repositoryRoot), realPath)) {
    throw new TenantctlError(
      "The external tenant config directory must be outside the repository.",
    );
  }
  return realPath;
}

function parseExternalConfig(contents) {
  const values = Object.create(null);
  const lines = contents.split(/\r?\n/u);

  for (const line of lines) {
    if (line.trim().length === 0 || line.trimStart().startsWith("#")) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      throw new TenantctlError(
        "The external config must use one KEY=VALUE entry per line.",
      );
    }

    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    if (!/^[A-Z_][A-Z0-9_]*(?![\s\S])/.test(key)) {
      throw new TenantctlError("The external config contains an invalid key.");
    }
    if (hasOwn(values, key)) {
      throw new TenantctlError(
        "The external config contains a duplicate key: " + key,
      );
    }
    if (
      value !== value.trim() ||
      value.includes("$") ||
      value.includes("\0") ||
      value.startsWith('"') ||
      value.startsWith("'") ||
      value.endsWith('"') ||
      value.endsWith("'")
    ) {
      throw new TenantctlError(
        "The external config must use unquoted, non-interpolated values.",
      );
    }
    if (key.startsWith("COMPOSE_") || key.startsWith("DOCKER_")) {
      throw new TenantctlError(
        "The external config may not override Docker/Compose controls.",
      );
    }
    const externalSecretFileReference =
      key === "FACTURAMA_SECRET_FILE" && isAbsolute(value);
    if (
      key === "DATABASE_URL" ||
      (SENSITIVE_ENV_NAME_PATTERN.test(key) && !externalSecretFileReference)
    ) {
      const isReference = /(?:^|_)REF(?:_|$)/i.test(key);
      if (!isReference || !SECRET_REFERENCE_PATTERN.test(value)) {
        throw new TenantctlError(
          "Secret values must be supplied by the external resolver, not the config file.",
        );
      }
    }
    values[key] = value;
  }

  return values;
}

function readTenantManifest(manifestPath, deps) {
  let manifest;
  try {
    manifest = JSON.parse(
      deps.readFile(resolve(deps.cwd, manifestPath), "utf8"),
    );
  } catch {
    throw new TenantctlError(
      "The tenant manifest must be readable JSON; contents were suppressed.",
    );
  }

  const validationErrors = validateCompanyManifest(manifest);
  if (validationErrors.length > 0) {
    throw new TenantctlError(
      "Tenant manifest validation failed: " + validationErrors.join("; "),
    );
  }

  return manifest;
}

function readCompanyManifest(
  manifestPath,
  deps,
  companySlug,
  validatedManifest,
) {
  const manifest = validatedManifest ?? readTenantManifest(manifestPath, deps);
  const company = manifest.companies.find(
    (candidate) => candidate.slug === companySlug,
  );
  if (!company) {
    throw new TenantctlError(
      "The selected company is missing from the manifest.",
    );
  }
  return { manifest, company };
}

function getRequiredSecretPurposes(command) {
  if (command === "backup" || command === "restore-drill") {
    return [...BASE_SECRET_PURPOSES, "backup"];
  }
  return command === "provision" || command === "bootstrap"
    ? [...BASE_SECRET_PURPOSES, BOOTSTRAP_SECRET_PURPOSE]
    : [...BASE_SECRET_PURPOSES];
}

function buildResolverEnvironment(source) {
  const environment = {};
  for (const name of RESOLVER_ENV_ALLOWLIST) {
    if (typeof source[name] === "string") environment[name] = source[name];
  }
  return environment;
}

function buildDockerEnvironment(source, secretEnvironment) {
  const environment = {};
  for (const name of DOCKER_ENV_ALLOWLIST) {
    if (typeof source[name] === "string") environment[name] = source[name];
  }
  return { ...environment, ...secretEnvironment };
}

function buildTenantDatabaseName(companySlug) {
  const normalizedSlug = companySlug.replaceAll("-", "_");
  const readableName = "tenant_" + normalizedSlug;
  if (readableName.length <= 63) return readableName;

  const suffix = createHash("sha256")
    .update(companySlug)
    .digest("hex")
    .slice(0, 16);
  return "tenant_" + normalizedSlug.slice(0, 39) + "_" + suffix;
}

function assertConfiguredValue(config, key, expected) {
  const existing = config[key];
  if (
    typeof existing === "string" &&
    existing.length > 0 &&
    existing !== expected
  ) {
    throw new TenantctlError(
      "External config value does not match the selected tenant at " +
        key +
        ".",
    );
  }
}

function requireTenantReference(company, purpose) {
  return assertExternalReference(company, purpose);
}

function validateBackupSettings(config) {
  const endpointValue = config.BACKUP_S3_ENDPOINT;
  let endpoint;
  try {
    endpoint = new URL(endpointValue);
  } catch {
    throw new TenantctlError("BACKUP_S3_ENDPOINT must be a valid HTTPS URL.");
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    (endpoint.pathname !== "" && endpoint.pathname !== "/")
  ) {
    throw new TenantctlError(
      "BACKUP_S3_ENDPOINT must be an HTTPS origin without credentials or a path.",
    );
  }
  if (
    typeof config.BACKUP_S3_REGION !== "string" ||
    !BACKUP_REGION_PATTERN.test(config.BACKUP_S3_REGION)
  ) {
    throw new TenantctlError(
      "BACKUP_S3_REGION is required and must be a region token.",
    );
  }
}

function parsePacDockerSecretName(reference) {
  const match =
    typeof reference === "string" && reference.match(PAC_DOCKER_SECRET_PATTERN);
  return match?.[1];
}

function resolvePacSecretFile(path, deps) {
  if (typeof path !== "string" || !isAbsolute(path)) {
    throw new TenantctlError(
      "FACTURAMA_SECRET_FILE must be an absolute external secret-file path.",
    );
  }
  let suppliedPathInfo;
  try {
    suppliedPathInfo = deps.lstat(path);
  } catch {
    throw new TenantctlError("The PAC secret file is unavailable.");
  }
  if (suppliedPathInfo.isSymbolicLink() || !suppliedPathInfo.isFile()) {
    throw new TenantctlError(
      "The PAC secret file must be a non-symlink regular file.",
    );
  }
  const resolvedPath = resolveExternalFile(path, deps);
  const info = deps.stat(resolvedPath);
  if (process.platform !== "win32" && (info.mode & 0o077) !== 0) {
    throw new TenantctlError(
      "The PAC secret file must not be accessible by group or other users.",
    );
  }
  return resolvedPath;
}

function buildTenantEnvironment(company, externalConfig, options, deps) {
  const generated = { ...externalConfig };
  const composeEnvironment = {};
  const isProvision = options.command === "provision";
  const cfdiEnabled = externalConfig.CFDI_ENABLED ?? "false";
  let pacDockerSecretName;
  let pacSecretFile;

  if (cfdiEnabled !== "true" && cfdiEnabled !== "false") {
    throw new TenantctlError("CFDI_ENABLED must be either true or false.");
  }

  const databaseName = buildTenantDatabaseName(company.slug);
  assertConfiguredValue(externalConfig, "POSTGRES_USER", "postgres");
  assertConfiguredValue(externalConfig, "POSTGRES_DB", databaseName);
  generated.POSTGRES_USER = "postgres";
  generated.POSTGRES_DB = databaseName;
  composeEnvironment.POSTGRES_USER = "postgres";
  composeEnvironment.POSTGRES_DB = databaseName;

  if (isProvision) {
    const backupRef = requireTenantReference(company, "backup");
    const pacRef = requireTenantReference(company, "pac");
    const csdRef = requireTenantReference(company, "csd");
    const backupBucket = company.backupBucket;
    if (typeof backupBucket !== "string" || backupBucket.length === 0) {
      throw new TenantctlError(
        "The selected manifest company is missing backupBucket.",
      );
    }
    validateBackupSettings(externalConfig);

    const projectName = "tenantctl-" + company.slug;
    const backupLocalDirectory =
      "/var/lib/pollos-distribuidor/" + company.slug + "/postgres-backups";
    const expectedValues = {
      TENANT_SLUG: company.slug,
      POSTGRES_USER: "postgres",
      POSTGRES_DB: databaseName,
      CORS_ORIGIN: "https://" + company.erpHost,
      OBJECT_STORAGE_PUBLIC_ENDPOINT: "https://" + company.objectStorageHost,
      OBJECT_STORAGE_PUBLIC_ORIGIN: "https://" + company.objectStorageHost,
      BACKUP_S3_BUCKET: backupBucket,
      BACKUP_S3_CREDENTIAL_REF: backupRef,
      BACKUP_COMPOSE_PROJECT_NAME: projectName,
      BACKUP_LOCAL_DIR: backupLocalDirectory,
      FACTURAMA_CREDENTIAL_REF: pacRef,
      CSD_CREDENTIAL_REF: csdRef,
      CFDI_ENABLED: cfdiEnabled,
    };
    for (const [key, value] of Object.entries(expectedValues)) {
      assertConfiguredValue(externalConfig, key, value);
      generated[key] = value;
      composeEnvironment[key] = value;
    }

    if (cfdiEnabled === "true") {
      const dockerSecretName = parsePacDockerSecretName(pacRef);
      if (!dockerSecretName) {
        throw new TenantctlError(
          "Enabled CFDI requires a docker-secret reference for the PAC credential.",
        );
      }
      pacDockerSecretName = dockerSecretName;
      pacSecretFile = resolvePacSecretFile(
        externalConfig.FACTURAMA_SECRET_FILE,
        deps,
      );
      const pacValues = {
        FACTURAMA_SECRET_FILE: pacSecretFile,
        FACTURAMA_DOCKER_SECRET_NAME: dockerSecretName,
      };
      for (const [key, value] of Object.entries(pacValues)) {
        if (key !== "FACTURAMA_SECRET_FILE") {
          assertConfiguredValue(externalConfig, key, value);
        }
        generated[key] = value;
        composeEnvironment[key] = value;
      }
    }
  } else if (cfdiEnabled === "true") {
    const pacRef = requireTenantReference(company, "pac");
    const dockerSecretName = parsePacDockerSecretName(pacRef);
    if (!dockerSecretName) {
      throw new TenantctlError(
        "Enabled CFDI requires a docker-secret reference for the PAC credential.",
      );
    }
    pacDockerSecretName = dockerSecretName;
    pacSecretFile = resolvePacSecretFile(
      externalConfig.FACTURAMA_SECRET_FILE,
      deps,
    );
    composeEnvironment.FACTURAMA_CREDENTIAL_REF = pacRef;
    composeEnvironment.FACTURAMA_SECRET_FILE = pacSecretFile;
    composeEnvironment.FACTURAMA_DOCKER_SECRET_NAME = dockerSecretName;
  }

  if (options.command === "backup" || options.command === "restore-drill") {
    const backupRef = requireTenantReference(company, "backup");
    const backupBucket = company.backupBucket;
    if (typeof backupBucket !== "string" || backupBucket.length === 0) {
      throw new TenantctlError("The selected company is missing backupBucket.");
    }
    validateBackupSettings(externalConfig);
    const backupValues = {
      TENANT_SLUG: company.slug,
      BACKUP_S3_BUCKET: backupBucket,
      BACKUP_S3_CREDENTIAL_REF: backupRef,
      BACKUP_COMPOSE_PROJECT_NAME: "tenantctl-" + company.slug,
      BACKUP_LOCAL_DIR:
        "/var/lib/pollos-distribuidor/" + company.slug + "/postgres-backups",
    };
    for (const [key, value] of Object.entries(backupValues)) {
      assertConfiguredValue(externalConfig, key, value);
      generated[key] = value;
      composeEnvironment[key] = value;
    }
  }

  if (isProvision) {
    composeEnvironment.OBJECT_STORAGE_PUBLIC_ENDPOINT =
      "https://" + company.objectStorageHost;
    composeEnvironment.CORS_ORIGIN = "https://" + company.erpHost;
  }

  return {
    cfdiEnabled,
    composeEnvironment,
    databaseName,
    generatedEnvironment: generated,
    pacDockerSecretName,
    pacSecretFile,
  };
}

function renderTenantEnvironment(values) {
  return (
    Object.entries(values)
      .map(([key, value]) => key + "=" + value)
      .join("\n") + "\n"
  );
}

function replaceCaddyValue(template, placeholder, replacement, description) {
  const occurrences = template.split(placeholder).length - 1;
  if (occurrences !== 1) {
    throw new TenantctlError(
      "Caddy production template must contain one " + description + ".",
    );
  }
  return template.replace(placeholder, replacement);
}

function replaceCaddyHost(template, placeholder, host) {
  return replaceCaddyValue(
    template,
    placeholder,
    "https://" + host,
    placeholder + " site address",
  );
}

function renderTenantCaddyfile(template, company) {
  const withErpHost = replaceCaddyHost(
    template,
    "https://erp.example.com",
    company.erpHost,
  );
  const withObjectStorageHost = replaceCaddyHost(
    withErpHost,
    "https://objects.example.com",
    company.objectStorageHost,
  );
  return replaceCaddyValue(
    withObjectStorageHost,
    "__OBJECT_STORAGE_CSP_HOST__",
    company.objectStorageHost,
    "Object Storage CSP host marker",
  );
}

function validateTenantCaddyfile(contents, deps) {
  let temporaryDirectory;
  try {
    temporaryDirectory = deps.mkdtemp(join(tmpdir(), "tenantctl-caddy-"));
    const caddyfilePath = join(temporaryDirectory, "Caddyfile");
    deps.writeFile(caddyfilePath, contents, { mode: 0o600, flag: "wx" });
    runCaptured(
      "caddy",
      ["validate", "--config", caddyfilePath, "--adapter", "caddyfile"],
      {
        env: buildDockerEnvironment(deps.env, {}),
        maxBuffer: 1024 * 1024,
      },
      deps,
      "Caddy template validation",
    );
  } finally {
    if (temporaryDirectory) {
      deps.remove(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

function resolveTenantOutputDirectory(
  inputPath,
  company,
  repositoryRoot,
  deps,
  create,
) {
  if (typeof inputPath !== "string" || !isAbsolute(inputPath)) {
    throw new TenantctlError(
      "The tenant output directory must be an absolute path.",
    );
  }
  const requested = resolve(inputPath);
  if (basename(requested) !== company.slug) {
    throw new TenantctlError(
      "The tenant output directory name must match the selected company slug.",
    );
  }

  let parentRealPath;
  try {
    parentRealPath = deps.realpath(dirname(requested));
  } catch {
    throw new TenantctlError(
      "The parent of the tenant output directory must already exist.",
    );
  }
  if (pathIsInside(repositoryRoot, parentRealPath)) {
    throw new TenantctlError(
      "Tenant output files must be outside the repository.",
    );
  }

  const outputPath = join(parentRealPath, company.slug);
  let info = pathInfoOrUndefined(outputPath, deps);
  if (!info && create) {
    try {
      deps.mkdir(outputPath, { mode: 0o700 });
    } catch {
      throw new TenantctlError(
        "The tenant output directory could not be created.",
      );
    }
    info = pathInfoOrUndefined(outputPath, deps);
  }
  if (!info) return { path: outputPath, exists: false };
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new TenantctlError(
      "The tenant output path must be a non-symlink directory.",
    );
  }
  let realOutputPath;
  try {
    realOutputPath = deps.realpath(outputPath);
  } catch {
    throw new TenantctlError("The tenant output directory is unavailable.");
  }
  if (
    pathIsInside(repositoryRoot, realOutputPath) ||
    (process.platform !== "win32" && (info.mode & 0o077) !== 0)
  ) {
    throw new TenantctlError(
      "The tenant output directory must be private and outside the repository.",
    );
  }
  return { path: realOutputPath, exists: true };
}

function writeTenantArtifacts(outputPath, files, replaceExisting, deps) {
  const existing = new Map();
  let hasChangedFile = false;
  for (const [fileName, contents] of Object.entries(files)) {
    const path = join(outputPath, fileName);
    const info = pathInfoOrUndefined(path, deps);
    if (!info) {
      existing.set(fileName, undefined);
      hasChangedFile = true;
      continue;
    }
    if (
      info.isSymbolicLink() ||
      !info.isFile() ||
      (process.platform !== "win32" && (info.mode & 0o077) !== 0)
    ) {
      throw new TenantctlError(
        "Generated tenant artifacts must be private regular files.",
      );
    }
    const previous = deps.readFile(path, "utf8");
    existing.set(fileName, previous);
    if (previous !== contents) hasChangedFile = true;
  }

  if (!hasChangedFile) return;
  if (
    [...existing.values()].some((value) => value !== undefined) &&
    !replaceExisting
  ) {
    const differs = Object.entries(files).some(
      ([fileName, contents]) => existing.get(fileName) !== contents,
    );
    if (differs) {
      throw new TenantctlError(
        "Existing tenant artifacts differ; review rollback and pass --replace-generated-config to replace them.",
      );
    }
  }

  const changedExisting = [...existing.entries()].filter(
    ([, contents]) => contents !== undefined,
  );
  if (replaceExisting && changedExisting.length > 0) {
    const rollbackDirectory = join(
      outputPath,
      ".tenantctl-rollback-" +
        new Date().toISOString().replace(/[^0-9TZ]/gu, "-") +
        "-" +
        randomUUID().slice(0, 8),
    );
    deps.mkdir(rollbackDirectory, { mode: 0o700 });
    for (const [fileName, contents] of changedExisting) {
      if (contents !== undefined) {
        deps.writeFile(join(rollbackDirectory, fileName), contents, {
          mode: 0o600,
          flag: "wx",
        });
      }
    }
  }

  for (const [fileName, contents] of Object.entries(files)) {
    const targetPath = join(outputPath, fileName);
    if (existing.get(fileName) === contents) continue;
    const temporaryPath = join(
      outputPath,
      ".tenantctl-" +
        fileName.replace(/[^A-Za-z0-9.-]/gu, "-") +
        "-" +
        randomUUID(),
    );
    try {
      deps.writeFile(temporaryPath, contents, {
        mode: 0o600,
        flag: "wx",
      });
      deps.rename(temporaryPath, targetPath);
    } catch {
      try {
        deps.remove(temporaryPath, { force: true });
      } catch {
        // Preserve the primary failure while keeping output suppressed.
      }
      throw new TenantctlError("Tenant artifacts could not be written safely.");
    }
  }
}

function runCaptured(executable, args, options, deps, operationLabel) {
  let timeoutMs;
  if (typeof options.deadlineAt === "number") {
    timeoutMs = options.deadlineAt - deps.now();
    if (timeoutMs <= 0) {
      throw new TenantctlTimeoutError(
        operationLabel + " timed out; subprocess output was suppressed.",
      );
    }
  }

  let result;
  try {
    result = deps.spawn(executable, args, {
      cwd: deps.repositoryRoot,
      env: options.env,
      input: options.input,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
      maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
      ...(timeoutMs === undefined
        ? {}
        : {
            timeout: Math.max(1, Math.floor(timeoutMs)),
            killSignal: "SIGTERM",
          }),
    });
  } catch (error) {
    if (error?.code === "ETIMEDOUT") {
      throw new TenantctlTimeoutError(
        operationLabel + " timed out; subprocess output was suppressed.",
      );
    }
    throw new TenantctlError(
      operationLabel + " failed; subprocess output was suppressed.",
    );
  }

  if (result?.error?.code === "ETIMEDOUT") {
    throw new TenantctlTimeoutError(
      operationLabel + " timed out; subprocess output was suppressed.",
    );
  }
  if (!result || result.error || result.status !== 0) {
    throw new TenantctlError(
      operationLabel + " failed; subprocess output was suppressed.",
    );
  }
  return typeof result.stdout === "string"
    ? result.stdout
    : (result.stdout?.toString("utf8") ?? "");
}

function assertExternalReference(company, purpose) {
  const secretRefs = company.secretRefs;
  if (!isRecord(secretRefs) || typeof secretRefs[purpose] !== "string") {
    throw new TenantctlError(
      "The manifest is missing required secretRefs." + purpose + ".",
    );
  }
  return secretRefs[purpose];
}

function validateResolverResponse(stdout, requiredPurposes) {
  let response;
  try {
    response = JSON.parse(stdout);
  } catch {
    throw new TenantctlError(
      "The external resolver returned invalid JSON; output was suppressed.",
    );
  }
  if (
    !isRecord(response) ||
    Object.keys(response).length !== 2 ||
    response.protocolVersion !== 1 ||
    !isRecord(response.secrets)
  ) {
    throw new TenantctlError(
      "The external resolver response violates protocol version 1.",
    );
  }

  const expectedPurposes = [...requiredPurposes].sort();
  const returnedPurposes = Object.keys(response.secrets).sort();
  if (
    expectedPurposes.length !== returnedPurposes.length ||
    expectedPurposes.some(
      (purpose, index) => purpose !== returnedPurposes[index],
    )
  ) {
    throw new TenantctlError(
      "The external resolver returned an incomplete or unexpected secret set.",
    );
  }

  const secrets = response.secrets;
  const resolved = Object.create(null);
  for (const purpose of requiredPurposes) {
    if (purpose === "objectStorage" || purpose === "backup") {
      const credentials = secrets[purpose];
      if (
        !isRecord(credentials) ||
        Object.keys(credentials).length !== 2 ||
        typeof credentials.accessKeyId !== "string" ||
        typeof credentials.secretAccessKey !== "string"
      ) {
        throw new TenantctlError(
          "The external resolver returned incomplete credentials.",
        );
      }
      const prefix =
        purpose === "objectStorage" ? "OBJECT_STORAGE" : "BACKUP_S3";
      resolved[prefix + "_ACCESS_KEY_ID"] = credentials.accessKeyId;
      resolved[prefix + "_SECRET_ACCESS_KEY"] = credentials.secretAccessKey;
    } else if (typeof secrets[purpose] === "string") {
      const environmentNames = {
        database: "POSTGRES_PASSWORD",
        jwtAccess: "JWT_ACCESS_SECRET",
        jwtRefresh: "JWT_REFRESH_SECRET",
        bootstrapAdmin: "SEED_ADMIN_PASSWORD",
      };
      const environmentName = environmentNames[purpose];
      if (!environmentName) {
        throw new TenantctlError(
          "The external resolver returned an invalid secret purpose.",
        );
      }
      resolved[environmentName] = secrets[purpose];
    } else {
      throw new TenantctlError(
        "The external resolver returned an invalid secret value.",
      );
    }
  }

  const values = Object.values(resolved);
  if (
    values.some(
      (value) =>
        typeof value !== "string" ||
        value.length === 0 ||
        value.trim() !== value,
    )
  ) {
    throw new TenantctlError(
      "The external resolver returned an empty or malformed secret value.",
    );
  }
  if (new Set(values).size !== values.length) {
    throw new TenantctlError(
      "Resolved secret values must be unique for this company.",
    );
  }
  if (
    hasOwn(resolved, "POSTGRES_PASSWORD") &&
    !URL_SAFE_DATABASE_PASSWORD_PATTERN.test(resolved.POSTGRES_PASSWORD)
  ) {
    throw new TenantctlError(
      "The database password must use URL-safe characters with the current Compose contract.",
    );
  }
  return resolved;
}

function resolveExternalSecrets(
  company,
  command,
  resolverPath,
  deps,
  deadlineAt,
) {
  const requiredPurposes = getRequiredSecretPurposes(command);
  const secretRefs = Object.create(null);
  for (const purpose of requiredPurposes) {
    secretRefs[purpose] = assertExternalReference(company, purpose);
  }

  const request = {
    protocolVersion: 1,
    command,
    company: {
      slug: company.slug,
      environment: company.environment,
      deploymentHostRef: company.deploymentHostRef,
    },
    secretRefs,
  };

  const resolverOutput = runCaptured(
    resolverPath,
    ["resolve"],
    {
      env: buildResolverEnvironment(deps.env),
      input: JSON.stringify(request),
      maxBuffer: 1024 * 1024,
      deadlineAt,
    },
    deps,
    "External secret resolution",
  );
  return validateResolverResponse(resolverOutput, requiredPurposes);
}

function invokeCompose(context, commandArgs, options = {}) {
  const composeOptions = [
    "--project-name",
    context.projectName,
    "--project-directory",
    context.repositoryRoot,
    "--env-file",
    context.envFilePath,
  ];
  for (const composeFile of context.composeFiles ?? [context.composeFile]) {
    composeOptions.push("--file", composeFile);
  }
  if (options.profile) {
    composeOptions.push("--profile", options.profile);
  }
  const args = [
    "--context",
    context.dockerContext,
    "compose",
    ...composeOptions,
    ...commandArgs,
  ];
  return runCaptured(
    "docker",
    args,
    {
      env: context.dockerEnvironment,
      maxBuffer: options.maxBuffer,
      deadlineAt: context.deadlineAt,
    },
    context.dependencies,
    options.label ?? "Docker Compose operation",
  );
}

function getServiceEnvironment(service) {
  const environment = service?.environment;
  if (isRecord(environment)) return environment;
  if (Array.isArray(environment)) {
    const parsed = Object.create(null);
    for (const entry of environment) {
      if (typeof entry !== "string") continue;
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex <= 0) continue;
      parsed[entry.slice(0, separatorIndex)] = entry.slice(separatorIndex + 1);
    }
    return parsed;
  }
  return Object.create(null);
}

function getEnvironmentValue(services, serviceName, variableName) {
  return getServiceEnvironment(services[serviceName])[variableName];
}

function requireResolvedValue(services, serviceName, variableName) {
  const value = getEnvironmentValue(services, serviceName, variableName);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TenantctlError(
      "Compose configuration is incomplete at " +
        serviceName +
        ".environment." +
        variableName +
        ".",
    );
  }
  return value;
}

function ensureSecretMatches(
  services,
  serviceName,
  variableName,
  resolvedValue,
) {
  const composeValue = getEnvironmentValue(services, serviceName, variableName);
  if (composeValue !== resolvedValue) {
    throw new TenantctlError(
      "Compose did not receive the resolved " +
        serviceName +
        ".environment." +
        variableName +
        " secret.",
    );
  }
}

function validateComposeConfig(
  config,
  company,
  secretEnvironment,
  requiredPurposes,
  tenantSettings,
  context,
) {
  if (!isRecord(config) || !isRecord(config.services)) {
    throw new TenantctlError(
      "Docker Compose returned an invalid production configuration.",
    );
  }
  const services = config.services;
  for (const serviceName of REQUIRED_COMPOSE_SERVICES) {
    if (!isRecord(services[serviceName])) {
      throw new TenantctlError(
        "Production Compose is missing required service: " + serviceName + ".",
      );
    }
  }

  let imageCount = 0;
  for (const [serviceName, service] of Object.entries(services)) {
    if (!isRecord(service)) {
      throw new TenantctlError(
        "Production Compose returned an invalid service: " + serviceName + ".",
      );
    }
    if (hasOwn(service, "build")) {
      throw new TenantctlError(
        "Production Compose may not build company-specific images: " +
          serviceName +
          ".",
      );
    }
    if (hasOwn(service, "container_name")) {
      throw new TenantctlError(
        "Production Compose may not use fixed container names: " +
          serviceName +
          ".",
      );
    }
    if (
      typeof service.image !== "string" ||
      !IMMUTABLE_IMAGE_PATTERN.test(service.image)
    ) {
      throw new TenantctlError(
        "Every production service image must be pinned by sha256 digest: " +
          serviceName +
          ".",
      );
    }
    imageCount += 1;
  }

  if (
    services.migrate.image !== services.backend.image ||
    services.bootstrap.image !== services.backend.image
  ) {
    throw new TenantctlError(
      "Migration and bootstrap must use the production backend image digest.",
    );
  }

  const expectedVolumes = {
    postgres_data: context.projectName + "_postgres_data",
    object_storage_data: context.projectName + "_object_storage_data",
  };
  for (const [volumeName, expectedResourceName] of Object.entries(
    expectedVolumes,
  )) {
    const volume = config.volumes?.[volumeName];
    if (
      !isRecord(volume) ||
      volume.external === true ||
      volume.name !== expectedResourceName
    ) {
      throw new TenantctlError(
        "Production data volume is not isolated for this tenant: " +
          volumeName +
          ".",
      );
    }
  }
  const appNetwork = config.networks?.app_network;
  if (
    !isRecord(appNetwork) ||
    appNetwork.external === true ||
    appNetwork.name !== context.projectName + "_app_network"
  ) {
    throw new TenantctlError(
      "Production application network is not isolated for this tenant.",
    );
  }

  const expectedErpOrigin = "https://" + company.erpHost;
  const expectedStorageEndpoint = "https://" + company.objectStorageHost;
  if (
    requireResolvedValue(services, "backend", "CORS_ORIGIN") !==
    expectedErpOrigin
  ) {
    throw new TenantctlError(
      "CORS_ORIGIN must match the selected company's ERP host.",
    );
  }
  if (
    requireResolvedValue(
      services,
      "backend",
      "OBJECT_STORAGE_PUBLIC_ENDPOINT",
    ) !== expectedStorageEndpoint
  ) {
    throw new TenantctlError(
      "OBJECT_STORAGE_PUBLIC_ENDPOINT must match the selected company's storage host.",
    );
  }

  const databasePassword = requireResolvedValue(
    services,
    "postgres",
    "POSTGRES_PASSWORD",
  );
  ensureSecretMatches(
    services,
    "postgres",
    "POSTGRES_PASSWORD",
    secretEnvironment.POSTGRES_PASSWORD,
  );
  ensureSecretMatches(
    services,
    "backend",
    "JWT_ACCESS_SECRET",
    secretEnvironment.JWT_ACCESS_SECRET,
  );
  ensureSecretMatches(
    services,
    "backend",
    "JWT_REFRESH_SECRET",
    secretEnvironment.JWT_REFRESH_SECRET,
  );
  ensureSecretMatches(
    services,
    "backend",
    "OBJECT_STORAGE_ACCESS_KEY_ID",
    secretEnvironment.OBJECT_STORAGE_ACCESS_KEY_ID,
  );
  ensureSecretMatches(
    services,
    "backend",
    "OBJECT_STORAGE_SECRET_ACCESS_KEY",
    secretEnvironment.OBJECT_STORAGE_SECRET_ACCESS_KEY,
  );
  ensureSecretMatches(
    services,
    "object-storage",
    "AWS_ACCESS_KEY_ID",
    secretEnvironment.OBJECT_STORAGE_ACCESS_KEY_ID,
  );
  ensureSecretMatches(
    services,
    "object-storage",
    "AWS_SECRET_ACCESS_KEY",
    secretEnvironment.OBJECT_STORAGE_SECRET_ACCESS_KEY,
  );

  const objectStorageBucket = requireResolvedValue(
    services,
    "object-storage",
    "S3_BUCKET",
  );
  if (
    requireResolvedValue(services, "backend", "OBJECT_STORAGE_BUCKET") !==
    objectStorageBucket
  ) {
    throw new TenantctlError(
      "Backend and object-storage buckets must be company-local and equal.",
    );
  }

  const databaseName = tenantSettings.databaseName;
  const expectedDatabaseUrl =
    "postgresql://postgres:" +
    secretEnvironment.POSTGRES_PASSWORD +
    "@postgres:5432/" +
    databaseName +
    "?sslmode=disable";
  if (
    requireResolvedValue(services, "postgres", "POSTGRES_DB") !==
      databaseName ||
    requireResolvedValue(services, "migrate", "DATABASE_URL") !==
      expectedDatabaseUrl ||
    requireResolvedValue(services, "bootstrap", "DATABASE_URL") !==
      expectedDatabaseUrl ||
    requireResolvedValue(services, "backend", "DATABASE_URL") !==
      expectedDatabaseUrl
  ) {
    throw new TenantctlError(
      "PostgreSQL and DATABASE_URL must be tenant-local and use the dedicated Compose service.",
    );
  }
  requireResolvedValue(services, "backend", "MAP_DATA_VERSION");
  requireResolvedValue(services, "backend", "TRUST_PROXY_HOPS");

  const cfdiEnabled = getEnvironmentValue(services, "backend", "CFDI_ENABLED");
  if (
    typeof cfdiEnabled !== "string" ||
    cfdiEnabled.toLowerCase() !== tenantSettings.cfdiEnabled
  ) {
    throw new TenantctlError(
      "Compose CFDI_ENABLED does not match the validated tenant configuration.",
    );
  }
  if (tenantSettings.cfdiEnabled === "true") {
    const credentialRef = company.secretRefs?.pac;
    const dockerSecretName = tenantSettings.pacDockerSecretName;
    const backendCredentialRef = getEnvironmentValue(
      services,
      "backend",
      "FACTURAMA_CREDENTIAL_REF",
    );
    const secretMounts = services.backend.secrets;
    const pacMount = Array.isArray(secretMounts)
      ? secretMounts.find(
          (secret) =>
            isRecord(secret) &&
            secret.source === "pac_secret" &&
            secret.target === dockerSecretName,
        )
      : undefined;
    const pacSecretDefinition = config.secrets?.pac_secret;
    if (
      backendCredentialRef !== credentialRef ||
      !pacMount ||
      !isRecord(pacSecretDefinition) ||
      pacSecretDefinition.file !== tenantSettings.pacSecretFile
    ) {
      throw new TenantctlError(
        "Enabled CFDI requires the selected company's mounted PAC Docker secret.",
      );
    }
  } else if (
    Array.isArray(services.backend.secrets) &&
    services.backend.secrets.length > 0
  ) {
    throw new TenantctlError(
      "Disabled CFDI must not mount fiscal credentials into the backend.",
    );
  }

  if (requiredPurposes.includes(BOOTSTRAP_SECRET_PURPOSE)) {
    ensureSecretMatches(
      services,
      "bootstrap",
      "SEED_ADMIN_PASSWORD",
      secretEnvironment.SEED_ADMIN_PASSWORD,
    );
  }

  if (!URL_SAFE_DATABASE_PASSWORD_PATTERN.test(databasePassword)) {
    throw new TenantctlError(
      "The database password is incompatible with the current Compose URL contract.",
    );
  }
  const imageEntries = Object.entries(services)
    .map(([serviceName, service]) => [serviceName, service.image])
    .sort(([left], [right]) => left.localeCompare(right));
  const releaseFingerprint = createHash("sha256")
    .update(JSON.stringify(imageEntries))
    .digest("hex");
  return { imageCount, releaseFingerprint };
}

function parseComposePs(stdout) {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    try {
      return trimmed
        .split(/\r?\n/u)
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));
    } catch {
      throw new TenantctlError(
        "Docker Compose returned invalid status data; output was suppressed.",
      );
    }
  }
}

function safeStatusToken(value, allowedValues, fallback = "unknown") {
  return typeof value === "string" && allowedValues.has(value.toLowerCase())
    ? value.toLowerCase()
    : fallback;
}

function projectStatus(stdout) {
  const rows = parseComposePs(stdout);
  const allowedStates = new Set([
    "running",
    "exited",
    "created",
    "paused",
    "restarting",
    "removing",
    "dead",
  ]);
  const allowedHealth = new Set(["healthy", "unhealthy", "starting", "none"]);
  const services = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const service = typeof row.Service === "string" ? row.Service : row.service;
    const safeService =
      typeof service === "string" && /^[a-z0-9][a-z0-9_-]*$/.test(service)
        ? service
        : "unknown";
    const state = safeStatusToken(row.State ?? row.state, allowedStates);
    const healthValue = row.Health ?? row.health;
    const health =
      typeof healthValue === "string" && healthValue.length > 0
        ? safeStatusToken(healthValue, allowedHealth)
        : undefined;
    services.push({
      service: safeService,
      state,
      ...(health ? { health } : {}),
    });
  }
  return services;
}

function printStatus(stdout, companySlug, deps) {
  const services = projectStatus(stdout);
  deps.stdout.write("Tenant status: " + companySlug + "\n");
  if (services.length === 0) {
    deps.stdout.write("No tenant containers found.\n");
    return;
  }
  for (const service of services) {
    deps.stdout.write(
      service.service +
        ": " +
        service.state +
        (service.health ? " (" + service.health + ")" : "") +
        "\n",
    );
  }
}

function getProvisionPlan(command) {
  if (command === "migrate") {
    return [
      "Run the existing production migration service with the pinned backend image.",
    ];
  }
  if (command === "bootstrap") {
    return [
      "Run the existing production migration service with the pinned backend image.",
      "After migration succeeds, run the existing one-shot production bootstrap service.",
    ];
  }
  if (command === "provision") {
    return [
      "Validate the tenant manifest, host target, and external configuration.",
      "Validate the production Compose configuration and pinned release images.",
      "Render and validate the tenant-specific Caddy configuration.",
      "On apply, write the tenant production .env and Caddy config outside the repository.",
      "Pull the digest-pinned production services, including migration jobs.",
      "Run the existing production migration service and abort on failure.",
      "Run the existing one-shot production bootstrap service and abort on failure.",
      "Start the production Compose project and wait on its existing healthchecks.",
      "Verify every runtime service is running and healthy.",
      "Run the API readiness smoke check through the frontend proxy from the backend container.",
    ];
  }
  return [];
}

function printDryRun(command, companySlug, runId, deps) {
  deps.stdout.write(
    "Dry run for tenant " + companySlug + " (runId " + runId + "):\n",
  );
  getProvisionPlan(command).forEach((step, index) => {
    deps.stdout.write(index + 1 + ". " + step + "\n");
  });
  deps.stdout.write(
    "No mutating Docker Compose command was executed; resolved values were suppressed.\n",
  );
}

function parseComposeConfig(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new TenantctlError(
      "Docker Compose config was not valid JSON; output was suppressed.",
    );
  }
}

function prepareContext(options, deps, validatedManifest) {
  const repositoryRoot = deps.realpath(deps.repositoryRoot);
  const { company } = readCompanyManifest(
    options.manifestPath,
    deps,
    options.companySlug,
    validatedManifest,
  );

  if (
    MUTATING_COMMANDS.has(options.command) &&
    ["suspended", "decommissioned"].includes(company.status)
  ) {
    throw new TenantctlError(
      "The selected company status does not allow deployment mutations.",
    );
  }

  const envFilePath = resolveExternalFile(options.envFilePath, deps);
  let externalConfig;
  try {
    externalConfig = parseExternalConfig(deps.readFile(envFilePath, "utf8"));
  } catch (error) {
    if (error instanceof TenantctlError) throw error;
    throw new TenantctlError(
      "The external config could not be read; contents were suppressed.",
    );
  }

  if (
    externalConfig.TENANTCTL_DEPLOYMENT_HOST_REF !== company.deploymentHostRef
  ) {
    throw new TenantctlError(
      "TENANTCTL_DEPLOYMENT_HOST_REF must match the selected manifest company.",
    );
  }
  const dockerContext = externalConfig.TENANTCTL_DOCKER_CONTEXT;
  if (
    typeof dockerContext !== "string" ||
    !DOCKER_CONTEXT_PATTERN.test(dockerContext)
  ) {
    throw new TenantctlError(
      "TENANTCTL_DOCKER_CONTEXT must select one explicit Docker context.",
    );
  }
  if (
    typeof externalConfig.MAP_DATA_DIR !== "string" ||
    !isAbsolute(externalConfig.MAP_DATA_DIR)
  ) {
    throw new TenantctlError(
      "MAP_DATA_DIR must be an absolute company-local host path.",
    );
  }

  const tenantSettings = buildTenantEnvironment(
    company,
    externalConfig,
    options,
    deps,
  );

  const outputDirectory =
    options.command === "provision"
      ? resolveTenantOutputDirectory(
          options.outputDirectory,
          company,
          repositoryRoot,
          deps,
          false,
        )
      : undefined;

  const resolverPath = resolveExternalFile(options.resolverPath, deps, {
    executable: true,
  });
  const requiredPurposes = getRequiredSecretPurposes(options.command);
  const secretEnvironment = resolveExternalSecrets(
    company,
    options.command,
    resolverPath,
    deps,
    options.deadlineAt,
  );
  const composeSecretEnvironment = Object.fromEntries(
    Object.entries(secretEnvironment).filter(
      ([name]) => !name.startsWith("BACKUP_S3_"),
    ),
  );
  const dockerEnvironment = buildDockerEnvironment(deps.env, {
    ...tenantSettings.composeEnvironment,
    ...composeSecretEnvironment,
  });
  const composeFile = deps.realpath(deps.composeFile);
  const composeFiles = [composeFile];
  if (tenantSettings.cfdiEnabled === "true") {
    composeFiles.push(deps.realpath(deps.cfdiComposeFile));
  }
  const context = {
    dependencies: deps,
    repositoryRoot,
    composeFile,
    composeFiles,
    envFilePath,
    dockerContext,
    projectName: "tenantctl-" + company.slug,
    dockerEnvironment,
    deadlineAt: options.deadlineAt,
  };

  function preflight(label) {
    const composeOutput = invokeCompose(
      context,
      ["config", "--format", "json"],
      {
        profile: "migration",
        label,
      },
    );
    const composeConfig = parseComposeConfig(composeOutput);
    const imageCount = validateComposeConfig(
      composeConfig,
      company,
      secretEnvironment,
      requiredPurposes,
      tenantSettings,
      context,
    );
    return {
      imageCount: imageCount.imageCount,
      releaseFingerprint: imageCount.releaseFingerprint,
    };
  }

  let validation = preflight("Production Compose preflight");
  let caddyfile;
  if (options.command === "provision") {
    let caddyTemplate;
    try {
      caddyTemplate = deps.readFile(deps.caddyTemplateFile, "utf8");
    } catch {
      throw new TenantctlError(
        "The Caddy production template is unavailable; contents were suppressed.",
      );
    }
    caddyfile = renderTenantCaddyfile(caddyTemplate, company);
    validateTenantCaddyfile(caddyfile, deps);

    if (!options.dryRun) {
      const writableOutputDirectory = resolveTenantOutputDirectory(
        options.outputDirectory,
        company,
        repositoryRoot,
        deps,
        true,
      );
      writeTenantArtifacts(
        writableOutputDirectory.path,
        {
          ".env.production": renderTenantEnvironment(
            tenantSettings.generatedEnvironment,
          ),
          "Caddyfile.production": caddyfile,
        },
        Boolean(options.replaceGeneratedConfig),
        deps,
      );
      context.envFilePath = join(
        writableOutputDirectory.path,
        ".env.production",
      );
      validation = preflight("Generated tenant Compose preflight");
    }
  }

  return {
    company,
    context,
    requiredPurposes,
    secretEnvironment,
    tenantSettings,
    outputDirectory,
    caddyfile,
    imageCount: validation.imageCount,
    releaseFingerprint: validation.releaseFingerprint,
  };
}

function invokeMigration(context) {
  invokeCompose(context, ["run", "--rm", "migrate"], {
    profile: "migration",
    label: "Production migration",
  });
}

function invokeBootstrap(context) {
  invokeCompose(context, ["run", "--rm", "--no-deps", "bootstrap"], {
    profile: "migration",
    label: "Production bootstrap",
  });
}

function invokeProvision(context) {
  invokeCompose(context, ["pull"], {
    profile: "migration",
    label: "Production image pull",
  });
  invokeMigration(context);
  invokeBootstrap(context);
  invokeCompose(
    context,
    ["up", "-d", "--wait", "--no-build", "--pull", "never"],
    { label: "Production service startup" },
  );
}

function assertRuntimeReady(stdout) {
  const rows = parseComposePs(stdout);
  const services = new Map();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const service = row.Service ?? row.service;
    if (typeof service === "string") services.set(service, row);
  }

  for (const serviceName of RUNTIME_SERVICES) {
    const row = services.get(serviceName);
    const state = String(row?.State ?? row?.state ?? "").toLowerCase();
    const health = String(row?.Health ?? row?.health ?? "").toLowerCase();
    if (state !== "running" || health !== "healthy") {
      throw new TenantctlError(
        "Tenant readiness failed for production service: " + serviceName + ".",
      );
    }
  }
}

function invokeReadiness(context) {
  const status = invokeCompose(
    context,
    ["ps", "--all", "--orphans=false", "--format", "json"],
    { label: "Production readiness check" },
  );
  assertRuntimeReady(status);
}

function invokeSmokeCheck(context) {
  const readinessScript =
    "fetch('http://frontend:3000/' + (process.env.API_PREFIX || 'api') + '/health/ready').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1));";
  invokeCompose(
    context,
    ["exec", "-T", "backend", "node", "-e", readinessScript],
    { label: "Production tenant smoke check" },
  );
}

function getTenantConfigPath(company, options, envDirectory) {
  return (
    options.envFilePath ?? join(envDirectory, company.slug, ".env.production")
  );
}

function createCompanyFingerprint(company) {
  const identity = {
    slug: company.slug,
    environment: company.environment,
    deploymentHostRef: company.deploymentHostRef,
    erpHost: company.erpHost,
    objectStorageHost: company.objectStorageHost,
  };
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

function getCanaryStatePath(envDirectory, deps, createDirectory = false) {
  const stateDirectory = join(envDirectory, ".tenantctl");
  let directoryInfo = pathInfoOrUndefined(stateDirectory, deps);
  if (!directoryInfo && createDirectory) {
    try {
      deps.mkdir(stateDirectory, { mode: 0o700 });
    } catch {
      throw new TenantctlError(
        "Canary state directory could not be created safely.",
      );
    }
    directoryInfo = pathInfoOrUndefined(stateDirectory, deps);
  }
  if (!directoryInfo) return undefined;
  if (
    directoryInfo.isSymbolicLink() ||
    !directoryInfo.isDirectory() ||
    (process.platform !== "win32" && (directoryInfo.mode & 0o077) !== 0)
  ) {
    throw new TenantctlError(
      "Canary state directory must be a private non-symlink directory.",
    );
  }

  const statePath = join(stateDirectory, "migration-canary.json");
  const stateInfo = pathInfoOrUndefined(statePath, deps);
  if (!stateInfo) return createDirectory ? statePath : undefined;
  if (
    stateInfo.isSymbolicLink() ||
    !stateInfo.isFile() ||
    (process.platform !== "win32" && (stateInfo.mode & 0o077) !== 0)
  ) {
    throw new TenantctlError("Canary evidence must be a private regular file.");
  }
  return statePath;
}

function readCanaryEvidence(envDirectory, deps) {
  const statePath = getCanaryStatePath(envDirectory, deps);
  if (!statePath) return undefined;
  let evidence;
  try {
    evidence = JSON.parse(deps.readFile(statePath, "utf8"));
  } catch {
    throw new TenantctlError(
      "Canary evidence is unreadable; batch migration is blocked.",
    );
  }
  if (
    !isRecord(evidence) ||
    evidence.protocolVersion !== 1 ||
    !["running", "passed", "failed"].includes(evidence.status) ||
    typeof evidence.tenant !== "string" ||
    typeof evidence.runId !== "string" ||
    !/^[a-f0-9]{64}(?![\s\S])/.test(evidence.releaseFingerprint ?? "") ||
    !/^[a-f0-9]{64}(?![\s\S])/.test(evidence.companyFingerprint ?? "") ||
    typeof evidence.completedAt !== "string"
  ) {
    throw new TenantctlError(
      "Canary evidence is invalid; batch migration is blocked.",
    );
  }
  return evidence;
}

function writeCanaryEvidence(envDirectory, evidence, deps) {
  const statePath = getCanaryStatePath(envDirectory, deps, true);
  const temporaryPath = statePath + "." + randomUUID() + ".tmp";
  try {
    deps.writeFile(temporaryPath, JSON.stringify(evidence, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    deps.rename(temporaryPath, statePath);
  } catch {
    try {
      deps.remove(temporaryPath, { force: true });
    } catch {
      // Keep the safe error below as the only surfaced detail.
    }
    throw new TenantctlError("Canary evidence could not be written safely.");
  }
}

function validateCanaryEvidence(manifest, evidence) {
  if (!evidence || evidence.status !== "passed") {
    throw new TenantctlError(
      "A successful production --canary migration is required before a batch migration.",
    );
  }
  const company = manifest.companies.find(
    (candidate) => candidate.slug === evidence.tenant,
  );
  if (
    !company ||
    company.status !== "active" ||
    company.environment !== "production" ||
    createCompanyFingerprint(company) !== evidence.companyFingerprint
  ) {
    throw new TenantctlError(
      "The recorded production canary no longer matches the tenant manifest.",
    );
  }
  return company;
}

function buildRestoreDatabaseName(company, runId) {
  const tenantHash = createHash("sha256")
    .update(company.slug)
    .digest("hex")
    .slice(0, 10);
  const runSuffix = runId.replaceAll("-", "").slice(0, 10);
  return "tenant_" + tenantHash + "_" + runSuffix + "_restore_drill";
}

function buildBackupScriptEnvironment(prepared, deps, runId, restoreDatabase) {
  const { company, context, secretEnvironment, tenantSettings } = prepared;
  const generated = tenantSettings.generatedEnvironment;
  const backupDirectory = generated.BACKUP_LOCAL_DIR;
  const restoreDirectory =
    "/var/tmp/pollos-distribuidor/" + company.slug + "/postgres-restore";
  const environment = {
    ...buildDockerEnvironment(deps.env, {}),
    ...tenantSettings.composeEnvironment,
    ...secretEnvironment,
    DOCKER_CONTEXT: context.dockerContext,
    BACKUP_DOCKER_BIN: "docker",
    BACKUP_COMPOSE_FILE: context.composeFile,
    BACKUP_COMPOSE_ENV_FILE: context.envFilePath,
    BACKUP_COMPOSE_PROJECT_NAME: context.projectName,
    BACKUP_UPLOAD_NETWORK: context.projectName + "_app_network",
    BACKUP_POSTGRES_SERVICE: "postgres",
    BACKUP_POSTGRES_USER: "postgres",
    BACKUP_POSTGRES_DATABASE: tenantSettings.databaseName,
    BACKUP_POSTGRES_PASSWORD: secretEnvironment.POSTGRES_PASSWORD,
    BACKUP_BACKEND_IMAGE_DIGEST: generated.BACKEND_IMAGE,
    BACKUP_FRONTEND_IMAGE_DIGEST: generated.FRONTEND_IMAGE,
    BACKUP_S3_ENDPOINT: generated.BACKUP_S3_ENDPOINT,
    BACKUP_S3_REGION: generated.BACKUP_S3_REGION,
    BACKUP_S3_BUCKET: company.backupBucket,
    BACKUP_S3_ACCESS_KEY_ID: secretEnvironment.BACKUP_S3_ACCESS_KEY_ID,
    BACKUP_S3_SECRET_ACCESS_KEY: secretEnvironment.BACKUP_S3_SECRET_ACCESS_KEY,
    BACKUP_LOCAL_DIR: backupDirectory,
    BACKUP_FAILURE_DIR: join(backupDirectory, "failed"),
    BACKUP_RESULT_DIR: join(backupDirectory, "results"),
    COMPANY_SLUG: company.slug,
    OBJECT_STORAGE_BUCKET: generated.OBJECT_STORAGE_BUCKET,
    OBJECT_STORAGE_ENDPOINT:
      generated.OBJECT_STORAGE_ENDPOINT ?? "http://object-storage:8333",
    OBJECT_STORAGE_ACCESS_KEY_ID:
      secretEnvironment.OBJECT_STORAGE_ACCESS_KEY_ID,
    OBJECT_STORAGE_SECRET_ACCESS_KEY:
      secretEnvironment.OBJECT_STORAGE_SECRET_ACCESS_KEY,
    OBJECT_STORAGE_REGION: generated.OBJECT_STORAGE_REGION ?? "us-east-1",
    COMPANY_RECOVERY_RESULT_DIR: join(backupDirectory, "company-recovery"),
    COMPANY_RECOVERY_LOCAL_DIR: join(backupDirectory, "company-recovery-sets"),
  };
  if (restoreDatabase) {
    if (
      restoreDatabase === tenantSettings.databaseName ||
      !restoreDatabase.endsWith("_restore_drill")
    ) {
      throw new TenantctlError(
        "Restore drills require a non-production temporary database target.",
      );
    }
    environment.RESTORE_DATABASE_NAME = restoreDatabase;
    environment.RESTORE_PRODUCTION_DATABASE_NAME = tenantSettings.databaseName;
    environment.RESTORE_LOCAL_DIR = restoreDirectory;
    environment.RESTORE_FAILURE_DIR = join(restoreDirectory, "failed");
    environment.RESTORE_RESULT_DIR = join(backupDirectory, "restore-drills");
    environment.RESTORE_OBJECT_STORAGE_TARGET_DISPOSABLE = "true";
    environment.RESTORE_OBJECT_STORAGE_LOCAL_DIR = join(
      restoreDirectory,
      "object-storage",
    );
  }
  if (typeof runId !== "string" || runId.length === 0) {
    throw new TenantctlError("An operation correlation id is required.");
  }
  return environment;
}

function invokeBackup(prepared, deps, runId) {
  const output = runCaptured(
    "bash",
    [
      resolve(
        deps.repositoryRoot,
        "scripts/database/create-company-recovery-set.sh",
      ),
    ],
    {
      env: buildBackupScriptEnvironment(prepared, deps, runId),
      deadlineAt: prepared.context.deadlineAt,
    },
    deps,
    "PostgreSQL backup",
  );
  const match = output.match(
    /^Company recovery set validated: (recovery-sets\/[a-z0-9]+(?:-[a-z0-9]+)*\/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}Z-[0-9]+-[0-9]+\.manifest\.json)\s*$/m,
  );
  if (
    !match ||
    !COMPANY_RECOVERY_SET_KEY_PATTERN.test(match[1]) ||
    !match[1].startsWith(`recovery-sets/${prepared.company.slug}/`)
  ) {
    throw new TenantctlError(
      "The company recovery-set script did not report a validated tenant recovery set.",
    );
  }
  return match[1];
}

function invokeRestoreDrill(prepared, deps, runId) {
  const restoreDatabase = buildRestoreDatabaseName(prepared.company, runId);
  const recoverySetKey = invokeBackup(prepared, deps, runId);
  const environment = buildBackupScriptEnvironment(
    prepared,
    deps,
    runId,
    restoreDatabase,
  );
  environment.RESTORE_RECOVERY_SET_KEY = recoverySetKey;
  const output = runCaptured(
    "bash",
    [
      resolve(
        deps.repositoryRoot,
        "scripts/database/restore-company-recovery-set.sh",
      ),
    ],
    {
      env: environment,
      deadlineAt: prepared.context.deadlineAt,
    },
    deps,
    "Company recovery-set restore rehearsal",
  );
  const match = output.match(
    /^Company restore rehearsal passed for ([A-Za-z0-9_]+) using (recovery-sets\/[a-z0-9]+(?:-[a-z0-9]+)*\/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}Z-[0-9]+-[0-9]+\.manifest\.json)\.$/m,
  );
  if (!match || match[1] !== restoreDatabase || match[2] !== recoverySetKey) {
    throw new TenantctlError(
      "The company recovery-set script did not report a passed tenant restore rehearsal.",
    );
  }
  return { backupKey: recoverySetKey, restoreDatabase };
}

function makeTenantResult(runId, command, company, fields = {}) {
  return {
    runId,
    tenant: company.slug,
    database: buildTenantDatabaseName(company.slug),
    operation: command,
    ...fields,
  };
}

function emitOperationalResult(
  command,
  runId,
  startedAt,
  results,
  deps,
  options = {},
) {
  const failed = results.some(
    (result) => result.status === "failed" || result.status === "timed_out",
  );
  const completedAt = deps.now();
  const response = {
    runId,
    command,
    status:
      failed || options.errorCode
        ? "failed"
        : options.planned
          ? "planned"
          : "succeeded",
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date(completedAt).toISOString(),
    durationMs: Math.max(0, completedAt - startedAt),
    results,
    ...(options.canary ? { canary: options.canary } : {}),
    ...(options.errorCode ? { errorCode: options.errorCode } : {}),
  };
  writeOperationalAuditResults(results, deps);
  deps.stdout.write(JSON.stringify(response) + "\n");
  return failed || options.errorCode ? 1 : 0;
}

function makeSkippedTenantResult(runId, command, company, reason) {
  return makeTenantResult(runId, command, company, {
    status: "skipped",
    durationMs: 0,
    reason,
  });
}

function makeFailureCode(error, fallback) {
  if (error instanceof TenantctlTimeoutError) return "operation_timeout";
  return error?.operationCode ?? fallback;
}

function makeOperationDeadline(deps, timeoutMs) {
  return deps.now() + timeoutMs;
}

function makeOperationalOptions(options, company, envDirectory, deadlineAt) {
  return {
    ...options,
    companySlug: company.slug,
    envFilePath: getTenantConfigPath(company, options, envDirectory),
    deadlineAt,
  };
}

function makeCanaryEvidence(status, prepared, runId, deps) {
  return {
    protocolVersion: 1,
    status,
    tenant: prepared.company.slug,
    runId,
    releaseFingerprint: prepared.releaseFingerprint,
    companyFingerprint: createCompanyFingerprint(prepared.company),
    completedAt: new Date(deps.now()).toISOString(),
  };
}

function executePreparedOperationalCommand(
  options,
  prepared,
  envDirectory,
  runId,
  deps,
) {
  const company = prepared.company;
  const fields = {};
  if (options.dryRun) {
    fields.status = "planned";
    fields.plan =
      options.command === "status"
        ? "Read the existing Docker Compose service status and health projection."
        : options.command === "migrate"
          ? options.canary
            ? "Run the existing production migration service for this production canary only."
            : "Run the existing production migration service with the pinned backend image."
          : options.command === "backup"
            ? "Run the existing PostgreSQL backup script with this tenant's database and backup bucket."
            : "Run the existing restore script into a run-scoped temporary _restore_drill database.";
    fields.releaseFingerprint = prepared.releaseFingerprint;
    if (options.command === "backup" || options.command === "restore-drill") {
      fields.backupNamespace = company.backupBucket;
    }
    if (options.command === "restore-drill") {
      fields.restoreDatabase = buildRestoreDatabaseName(company, runId);
      fields.productionDatabase = prepared.tenantSettings.databaseName;
    }
    return fields;
  }

  if (options.command === "status") {
    const stdout = invokeCompose(
      prepared.context,
      ["ps", "--all", "--orphans=false", "--format", "json"],
      { label: "Production status" },
    );
    fields.services = projectStatus(stdout);
  } else if (options.command === "migrate") {
    if (options.canary) {
      try {
        writeCanaryEvidence(
          envDirectory,
          makeCanaryEvidence("running", prepared, runId, deps),
          deps,
        );
      } catch {
        const error = new TenantctlError(
          "Canary migration state could not be recorded before execution.",
        );
        error.operationCode = "canary_evidence_write_failed";
        throw error;
      }
      try {
        invokeMigration(prepared.context);
      } catch (error) {
        try {
          writeCanaryEvidence(
            envDirectory,
            makeCanaryEvidence("failed", prepared, runId, deps),
            deps,
          );
        } catch {
          error.operationCode = "canary_evidence_write_failed";
        }
        throw error;
      }
      try {
        writeCanaryEvidence(
          envDirectory,
          makeCanaryEvidence("passed", prepared, runId, deps),
          deps,
        );
      } catch {
        const error = new TenantctlError(
          "Canary migration succeeded but its evidence could not be recorded.",
        );
        error.operationCode = "canary_evidence_write_failed";
        throw error;
      }
      fields.canary = true;
    } else {
      invokeMigration(prepared.context);
    }
    fields.releaseFingerprint = prepared.releaseFingerprint;
  } else if (options.command === "backup") {
    fields.backupKey = invokeBackup(prepared, deps, runId);
    fields.backupNamespace = company.backupBucket;
  } else if (options.command === "restore-drill") {
    const restore = invokeRestoreDrill(prepared, deps, runId);
    fields.backupKey = restore.backupKey;
    fields.restoreDatabase = restore.restoreDatabase;
    fields.productionDatabase = prepared.tenantSettings.databaseName;
    fields.backupNamespace = company.backupBucket;
  }

  fields.status = "succeeded";
  fields.releaseFingerprint ??= prepared.releaseFingerprint;
  return fields;
}

function makeOperationSuccess(
  runId,
  command,
  company,
  startedAt,
  fields,
  deps,
) {
  const completedAt = deps.now();
  return makeTenantResult(runId, command, company, {
    ...fields,
    durationMs: Math.max(0, completedAt - startedAt),
  });
}

function makeOperationFailure(
  runId,
  command,
  company,
  startedAt,
  error,
  fallbackCode,
  deps,
) {
  const completedAt = deps.now();
  return makeTenantResult(runId, command, company, {
    status: error instanceof TenantctlTimeoutError ? "timed_out" : "failed",
    durationMs: Math.max(0, completedAt - startedAt),
    errorCode: makeFailureCode(error, fallbackCode),
    ...(command === "backup" || command === "restore-drill"
      ? { backupNamespace: company.backupBucket }
      : {}),
    ...(command === "restore-drill"
      ? {
          restoreDatabase: buildRestoreDatabaseName(company, runId),
          productionDatabase: buildTenantDatabaseName(company.slug),
        }
      : {}),
  });
}

function createListResponse(options, manifest, runId, startedAt, deps) {
  let companies = manifest.companies;
  if (options.companySlug) {
    companies = companies.filter(
      (company) => company.slug === options.companySlug,
    );
    if (companies.length === 0) {
      throw new TenantctlError(
        "The selected company is missing from the manifest.",
      );
    }
  }
  const completedAt = deps.now();
  const tenants = companies.map((company) => ({
    slug: company.slug,
    displayName: company.displayName,
    environment: company.environment,
    status: company.status,
    erpHost: company.erpHost,
    objectStorageHost: company.objectStorageHost,
    deploymentHostRef: company.deploymentHostRef,
    database: buildTenantDatabaseName(company.slug),
    backupNamespace: company.backupBucket,
  }));
  return {
    runId,
    command: "list",
    status: "succeeded",
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date(completedAt).toISOString(),
    durationMs: Math.max(0, completedAt - startedAt),
    tenants,
  };
}

function writeListResponse(response, deps) {
  deps.stdout.write(JSON.stringify(response) + "\n");
  return 0;
}

function getSelectedManifestCompanies(options, manifest) {
  if (options.companySlug) {
    return manifest.companies.filter(
      (company) => company.slug === options.companySlug,
    );
  }
  if (options.command === "migrate") {
    return manifest.companies.filter(
      (company) =>
        company.environment === "production" && company.status === "active",
    );
  }
  return manifest.companies.filter((company) => company.status === "active");
}

function runOperationalSequence(
  options,
  manifest,
  envDirectory,
  runId,
  startedAt,
  deps,
) {
  let companies = manifest.companies;
  if (options.companySlug) {
    companies = companies.filter(
      (company) => company.slug === options.companySlug,
    );
    if (companies.length === 0) {
      const error = new TenantctlError(
        "The selected company is missing from the manifest.",
      );
      error.operationCode = "tenant_not_found";
      throw error;
    }
  }

  const results = [];
  for (let index = 0; index < companies.length; index += 1) {
    const company = companies[index];
    if (!options.companySlug && company.status !== "active") {
      results.push(
        makeSkippedTenantResult(
          runId,
          options.command,
          company,
          "tenant_not_active",
        ),
      );
      continue;
    }

    const operationStartedAt = deps.now();
    try {
      writeTenantAuditEvent(deps, company, "started");
      if (
        (options.command === "backup" ||
          options.command === "restore-drill" ||
          options.canary) &&
        company.status !== "active"
      ) {
        const error = new TenantctlError(
          "The selected operation requires an active tenant.",
        );
        error.operationCode = "tenant_not_active";
        throw error;
      }
      if (
        options.canary &&
        (company.environment !== "production" || company.status !== "active")
      ) {
        const error = new TenantctlError(
          "Migration canaries must target an active production tenant.",
        );
        error.operationCode = "canary_target_ineligible";
        throw error;
      }
      const deadlineAt = makeOperationDeadline(deps, options.timeoutMs);
      const tenantOptions = makeOperationalOptions(
        options,
        company,
        envDirectory,
        deadlineAt,
      );
      const prepared = prepareContext(tenantOptions, deps, manifest);
      const fields = executePreparedOperationalCommand(
        options,
        prepared,
        envDirectory,
        runId,
        deps,
      );
      results.push(
        makeOperationSuccess(
          runId,
          options.command,
          company,
          operationStartedAt,
          fields,
          deps,
        ),
      );
    } catch (error) {
      if (error instanceof TenantctlAuditError) throw error;
      results.push(
        makeOperationFailure(
          runId,
          options.command,
          company,
          operationStartedAt,
          error,
          "operation_failed",
          deps,
        ),
      );
      if (!options.continueOnError) {
        for (const skippedCompany of companies.slice(index + 1)) {
          results.push(
            makeSkippedTenantResult(
              runId,
              options.command,
              skippedCompany,
              "stopped_after_previous_tenant_failure",
            ),
          );
        }
        break;
      }
    }
  }

  return emitOperationalResult(
    options.command,
    runId,
    startedAt,
    results,
    deps,
    { planned: options.dryRun },
  );
}

function runProductionBatchMigrate(
  options,
  manifest,
  envDirectory,
  runId,
  startedAt,
  deps,
) {
  const productionTenants = manifest.companies.filter(
    (company) =>
      company.environment === "production" && company.status === "active",
  );
  let evidence;
  let canaryCompany;
  try {
    evidence = readCanaryEvidence(envDirectory, deps);
    canaryCompany = validateCanaryEvidence(manifest, evidence);
  } catch (error) {
    const results = manifest.companies.map((company) =>
      makeSkippedTenantResult(
        runId,
        options.command,
        company,
        productionTenants.includes(company)
          ? "successful_production_canary_required"
          : "not_in_production_batch",
      ),
    );
    return emitOperationalResult(
      options.command,
      runId,
      startedAt,
      results,
      deps,
      { errorCode: makeFailureCode(error, "canary_required") },
    );
  }

  const targets = productionTenants.filter(
    (company) => company.slug !== canaryCompany.slug,
  );
  const outcomes = new Map();
  const preparedBySlug = new Map();
  const remainingTimeoutBySlug = new Map();
  let stopPreflight = false;
  for (let index = 0; index < targets.length; index += 1) {
    const company = targets[index];
    const operationStartedAt = deps.now();
    try {
      writeTenantAuditEvent(deps, company, "started");
      const deadlineAt = makeOperationDeadline(deps, options.timeoutMs);
      const tenantOptions = makeOperationalOptions(
        options,
        company,
        envDirectory,
        deadlineAt,
      );
      const prepared = prepareContext(tenantOptions, deps, manifest);
      if (prepared.releaseFingerprint !== evidence.releaseFingerprint) {
        const error = new TenantctlError(
          "Batch migration release does not match the successful canary.",
        );
        error.operationCode = "canary_release_mismatch";
        throw error;
      }
      preparedBySlug.set(company.slug, prepared);
      remainingTimeoutBySlug.set(
        company.slug,
        Math.max(0, deadlineAt - deps.now()),
      );
      if (options.dryRun) {
        outcomes.set(
          company.slug,
          makeOperationSuccess(
            runId,
            options.command,
            company,
            operationStartedAt,
            {
              status: "planned",
              releaseFingerprint: prepared.releaseFingerprint,
            },
            deps,
          ),
        );
      }
    } catch (error) {
      if (error instanceof TenantctlAuditError) throw error;
      outcomes.set(
        company.slug,
        makeOperationFailure(
          runId,
          options.command,
          company,
          operationStartedAt,
          error,
          "preflight_failed",
          deps,
        ),
      );
      if (!options.continueOnError) {
        stopPreflight = true;
        for (const skippedCompany of targets.slice(index + 1)) {
          outcomes.set(
            skippedCompany.slug,
            makeSkippedTenantResult(
              runId,
              options.command,
              skippedCompany,
              "stopped_after_previous_tenant_failure",
            ),
          );
        }
        break;
      }
    }
  }

  const hasPreflightFailure = [...outcomes.values()].some(
    (result) => result.status === "failed" || result.status === "timed_out",
  );
  if (stopPreflight && hasPreflightFailure) {
    for (const company of targets) {
      if (!outcomes.has(company.slug)) {
        outcomes.set(
          company.slug,
          makeSkippedTenantResult(
            runId,
            options.command,
            company,
            "stopped_after_previous_tenant_failure",
          ),
        );
      } else if (preparedBySlug.has(company.slug)) {
        outcomes.set(
          company.slug,
          makeSkippedTenantResult(
            runId,
            options.command,
            company,
            "batch_preflight_failed_before_migration",
          ),
        );
      }
    }
  } else if (!options.dryRun) {
    let stoppedAfterMigrationFailure = false;
    for (let index = 0; index < targets.length; index += 1) {
      const company = targets[index];
      if (
        outcomes.has(company.slug) &&
        ["failed", "timed_out"].includes(outcomes.get(company.slug).status)
      ) {
        continue;
      }
      if (!preparedBySlug.has(company.slug)) continue;
      if (stoppedAfterMigrationFailure) {
        outcomes.set(
          company.slug,
          makeSkippedTenantResult(
            runId,
            options.command,
            company,
            "stopped_after_previous_tenant_failure",
          ),
        );
        continue;
      }

      const operationStartedAt = deps.now();
      const prepared = preparedBySlug.get(company.slug);
      prepared.context.deadlineAt =
        operationStartedAt + (remainingTimeoutBySlug.get(company.slug) ?? 0);
      try {
        invokeMigration(prepared.context);
        outcomes.set(
          company.slug,
          makeOperationSuccess(
            runId,
            options.command,
            company,
            operationStartedAt,
            {
              status: "succeeded",
              releaseFingerprint: prepared.releaseFingerprint,
            },
            deps,
          ),
        );
      } catch (error) {
        if (error instanceof TenantctlAuditError) throw error;
        outcomes.set(
          company.slug,
          makeOperationFailure(
            runId,
            options.command,
            company,
            operationStartedAt,
            error,
            "migration_failed",
            deps,
          ),
        );
        if (!options.continueOnError) stoppedAfterMigrationFailure = true;
      }
    }
  }

  const results = manifest.companies.map((company) => {
    if (company.slug === canaryCompany.slug) {
      return makeTenantResult(runId, options.command, company, {
        status: "skipped",
        durationMs: 0,
        reason: "already_completed_as_canary",
        canaryRunId: evidence.runId,
      });
    }
    if (!productionTenants.includes(company)) {
      return makeSkippedTenantResult(
        runId,
        options.command,
        company,
        "not_in_production_batch",
      );
    }
    return (
      outcomes.get(company.slug) ??
      makeSkippedTenantResult(runId, options.command, company, "not_attempted")
    );
  });
  return emitOperationalResult(
    options.command,
    runId,
    startedAt,
    results,
    deps,
    {
      planned: options.dryRun,
      canary: {
        tenant: canaryCompany.slug,
        runId: evidence.runId,
        releaseFingerprint: evidence.releaseFingerprint,
      },
    },
  );
}

function runOperationalCommand(options, deps, manifest) {
  const runId = options.runId;
  const startedAt = deps.now();
  if (options.command === "list") {
    let response;
    try {
      response = createListResponse(options, manifest, runId, startedAt, deps);
    } catch (error) {
      if (options.companySlug) {
        writeTenantAuditEvent(
          deps,
          { slug: options.companySlug, environment: null },
          "failed",
        );
      }
      return emitOperationalResult(
        options.command,
        runId,
        startedAt,
        [],
        deps,
        { errorCode: makeFailureCode(error, "configuration_invalid") },
      );
    }
    writeAuditEvents(
      deps,
      response.tenants.map((tenant) => ({
        tenant,
        result: "started",
        durationMs: 0,
      })),
    );
    writeAuditEvents(
      deps,
      response.tenants.map((tenant) => ({
        tenant,
        result: "succeeded",
        durationMs: response.durationMs,
      })),
    );
    return writeListResponse(response, deps);
  }

  const selectedCompanies = getSelectedManifestCompanies(options, manifest);
  if (options.companySlug && selectedCompanies.length === 0) {
    writeTenantAuditEvent(
      deps,
      { slug: options.companySlug, environment: null },
      "failed",
    );
    return emitOperationalResult(options.command, runId, startedAt, [], deps, {
      errorCode: "tenant_not_found",
    });
  }

  let envDirectory;
  try {
    envDirectory = options.envDirectory
      ? resolveExternalDirectory(options.envDirectory, deps)
      : undefined;
  } catch (error) {
    if (error instanceof TenantctlAuditError) throw error;
    const failedAt = deps.now();
    const results = selectedCompanies.map((company) =>
      makeOperationFailure(
        runId,
        options.command,
        company,
        failedAt,
        error,
        "configuration_invalid",
        deps,
      ),
    );
    return emitOperationalResult(
      options.command,
      runId,
      startedAt,
      results,
      deps,
      { errorCode: makeFailureCode(error, "configuration_invalid") },
    );
  }

  if (options.command === "migrate" && !options.companySlug) {
    return runProductionBatchMigrate(
      options,
      manifest,
      envDirectory,
      runId,
      startedAt,
      deps,
    );
  }
  return runOperationalSequence(
    options,
    manifest,
    envDirectory,
    runId,
    startedAt,
    deps,
  );
}

function runSingleTenantCommand(options, deps, manifest) {
  const company = manifest.companies.find(
    (candidate) => candidate.slug === options.companySlug,
  );
  const auditTenant = company ?? {
    slug: options.companySlug,
    environment: null,
  };
  const startedAt = deps.now();
  writeTenantAuditEvent(deps, auditTenant, "started");

  let prepared;
  let output;
  let terminalResult = options.dryRun ? "planned" : "succeeded";
  let operationError;
  try {
    prepared = prepareContext(options, deps, manifest);
    if (options.command === "validate") {
      output =
        "Tenant configuration is valid for " +
        prepared.company.slug +
        " (" +
        prepared.imageCount +
        " digest-pinned services; runId " +
        options.runId +
        ").\n";
    } else if (options.dryRun) {
      output = "dry-run";
    } else if (options.command === "bootstrap") {
      invokeMigration(prepared.context);
      invokeBootstrap(prepared.context);
      output =
        "Bootstrap completed for " +
        prepared.company.slug +
        " (runId " +
        options.runId +
        ").\n";
    } else {
      invokeProvision(prepared.context);
      invokeReadiness(prepared.context);
      invokeSmokeCheck(prepared.context);
      output =
        "Provisioning completed for " +
        prepared.company.slug +
        " (runId " +
        options.runId +
        ").\n";
    }
  } catch (error) {
    operationError = error;
    terminalResult =
      error instanceof TenantctlTimeoutError ? "timed_out" : "failed";
  }

  writeTenantAuditEvent(
    deps,
    auditTenant,
    terminalResult,
    Math.max(0, deps.now() - startedAt),
  );
  if (operationError) throw operationError;

  if (output === "dry-run") {
    printDryRun(options.command, prepared.company.slug, options.runId, deps);
  } else {
    deps.stdout.write(output);
  }
  return 0;
}

function runCommand(options, deps) {
  const operator = resolveAuditOperator(options, deps);
  const audit = {
    operator,
    reason: options.reason,
    runId: options.runId,
    command: options.command,
    writer: createAuditWriter(options, deps),
    manifest: undefined,
  };
  deps.auditContext = audit;

  let manifest;
  try {
    manifest = readTenantManifest(options.manifestPath, deps);
  } catch (error) {
    if (options.companySlug) {
      writeTenantAuditEvent(
        deps,
        { slug: options.companySlug, environment: null },
        "failed",
      );
    }
    throw error;
  }
  audit.manifest = manifest;

  if (options.command === "list" || OPERATIONAL_COMMANDS.has(options.command)) {
    return runOperationalCommand(options, deps, manifest);
  }
  return runSingleTenantCommand(options, deps, manifest);
}

export function executeTenantctl(options, overrides = {}) {
  const deps = getDependencies(overrides);
  try {
    return runCommand(
      { ...options, runId: options.runId ?? randomUUID() },
      deps,
    );
  } catch (error) {
    deps.stderr.write(safeMessage(error) + "\n");
    return 1;
  } finally {
    deps.auditContext?.writer.close();
  }
}

export function main(argv = process.argv.slice(2), overrides = {}) {
  const deps = getDependencies(overrides);
  let options;
  try {
    options = parseTenantctlArgs(argv);
  } catch (error) {
    deps.stderr.write(safeMessage(error) + "\n" + USAGE + "\n");
    return 2;
  }
  if (options.help) {
    deps.stdout.write(USAGE + "\n");
    return 0;
  }
  return executeTenantctl(options, deps);
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  process.exitCode = main();
}
