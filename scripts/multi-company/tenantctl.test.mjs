import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { main, parseTenantctlArgs } from "./tenantctl.mjs";
import { validateCompanyManifest } from "./validate-company-manifest.mjs";

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const MANIFEST_PATH = resolve(
  REPOSITORY_ROOT,
  "docker/multi-company/tenant.example.json",
);
const SECRET_MARKER = "tenantctl-secret-must-never-be-printed";
const BACKUP_KEY_PATTERN_FOR_TEST =
  /^recovery-sets\/[a-z0-9]+(?:-[a-z0-9]+)*\/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}Z-[0-9]+-[0-9]+\.manifest\.json$/u;

const RESOLVED_SECRETS = {
  database: "db-password_123456",
  jwtAccess: "jwt-access-secret_123456",
  jwtRefresh: "jwt-refresh-secret_654321",
  objectStorage: {
    accessKeyId: "object-access-key_123456",
    secretAccessKey: "object-secret-key_654321",
  },
  backup: {
    accessKeyId: "backup-access-key_123456",
    secretAccessKey: "backup-secret-key_654321",
  },
  bootstrapAdmin: "bootstrap-admin-password_123456",
};

const IMAGE_DIGESTS = {
  postgres: "a",
  objectStorage: "b",
  photon: "c",
  osrm: "d",
  vroom: "e",
  tileserver: "f",
  frontend: "1",
  backend: "2",
};

function makeImage(repository, firstHex) {
  return repository + "@sha256:" + firstHex.repeat(64);
}

function makeExternalConfig(company) {
  return [
    "TENANTCTL_DEPLOYMENT_HOST_REF=" + company.deploymentHostRef,
    "TENANTCTL_DOCKER_CONTEXT=" + company.slug + "-prod",
    "BACKEND_IMAGE=registry.example/backend@sha256:" + "2".repeat(64),
    "FRONTEND_IMAGE=registry.example/frontend@sha256:" + "1".repeat(64),
    "PHOTON_IMAGE=registry.example/photon@sha256:" + "c".repeat(64),
    "OSRM_IMAGE=registry.example/osrm@sha256:" + "d".repeat(64),
    "TILESERVER_IMAGE=registry.example/tileserver@sha256:" + "f".repeat(64),
    "CORS_ORIGIN=https://" + company.erpHost,
    "OBJECT_STORAGE_PUBLIC_ENDPOINT=https://" + company.objectStorageHost,
    "OBJECT_STORAGE_PUBLIC_ORIGIN=https://" + company.objectStorageHost,
    "OBJECT_STORAGE_BUCKET=delivery-evidence",
    "MAP_DATA_DIR=/srv/pollos/maps",
    "MAP_DATA_VERSION=mexico-260812",
    "TRUST_PROXY_HOPS=1",
    "CFDI_ENABLED=false",
    "BACKUP_S3_ENDPOINT=https://s3.us-west-004.backblazeb2.com",
    "BACKUP_S3_REGION=us-west-004",
    "BACKUP_S3_BUCKET=" + company.backupBucket,
  ].join("\n");
}

function makeActiveManifest(includeThirdTenant = false) {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  for (const company of manifest.companies) company.status = "active";
  if (includeThirdTenant) {
    const third = JSON.parse(JSON.stringify(manifest.companies[1]));
    third.slug = "company-east";
    third.displayName = "Company East";
    third.erpHost = "erp.east.example";
    third.objectStorageHost = "objects.east.example";
    third.deploymentHostRef = "host://production/company-east";
    third.backupBucket = "company-east-backups";
    for (const [purpose] of Object.entries(third.secretRefs)) {
      third.secretRefs[purpose] =
        purpose === "pac"
          ? "docker-secret://company-east-pac"
          : "vault://production/company-east/" + purpose;
    }
    manifest.companies.push(third);
  }
  return manifest;
}

function makeComposeConfig(environment, company, mutate) {
  const backendImage =
    environment.BACKEND_IMAGE ??
    makeImage("registry.example/backend", IMAGE_DIGESTS.backend);
  const projectName = "tenantctl-" + company.slug;
  const databaseName = environment.POSTGRES_DB ?? "pollo_distribucion";
  const services = {
    postgres: {
      image: makeImage("postgis/postgis", IMAGE_DIGESTS.postgres),
      environment: {
        POSTGRES_DB: databaseName,
        POSTGRES_PASSWORD: environment.POSTGRES_PASSWORD,
      },
    },
    "object-storage": {
      image: makeImage("chrislusf/seaweedfs", IMAGE_DIGESTS.objectStorage),
      environment: {
        AWS_ACCESS_KEY_ID: environment.OBJECT_STORAGE_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: environment.OBJECT_STORAGE_SECRET_ACCESS_KEY,
        S3_BUCKET: environment.OBJECT_STORAGE_BUCKET,
      },
    },
    migrate: {
      image: backendImage,
      environment: {
        DATABASE_URL:
          "postgresql://postgres:" +
          environment.POSTGRES_PASSWORD +
          "@postgres:5432/" +
          databaseName +
          "?sslmode=disable",
      },
    },
    bootstrap: {
      image: backendImage,
      environment: {
        DATABASE_URL:
          "postgresql://postgres:" +
          environment.POSTGRES_PASSWORD +
          "@postgres:5432/" +
          databaseName +
          "?sslmode=disable",
        SEED_ADMIN_PASSWORD: environment.SEED_ADMIN_PASSWORD ?? "",
      },
    },
    backend: {
      image: backendImage,
      environment: {
        DATABASE_URL:
          "postgresql://postgres:" +
          environment.POSTGRES_PASSWORD +
          "@postgres:5432/" +
          databaseName +
          "?sslmode=disable",
        JWT_ACCESS_SECRET: environment.JWT_ACCESS_SECRET,
        JWT_REFRESH_SECRET: environment.JWT_REFRESH_SECRET,
        OBJECT_STORAGE_ACCESS_KEY_ID: environment.OBJECT_STORAGE_ACCESS_KEY_ID,
        OBJECT_STORAGE_SECRET_ACCESS_KEY:
          environment.OBJECT_STORAGE_SECRET_ACCESS_KEY,
        OBJECT_STORAGE_BUCKET: "delivery-evidence",
        OBJECT_STORAGE_PUBLIC_ENDPOINT: "https://" + company.objectStorageHost,
        CORS_ORIGIN: "https://" + company.erpHost,
        MAP_DATA_VERSION: "mexico-260812",
        TRUST_PROXY_HOPS: "1",
        CFDI_ENABLED: environment.CFDI_ENABLED ?? "false",
        FACTURAMA_CREDENTIAL_REF: company.secretRefs.pac,
      },
    },
    photon: {
      image:
        environment.PHOTON_IMAGE ??
        makeImage("registry.example/photon", IMAGE_DIGESTS.photon),
    },
    osrm: {
      image:
        environment.OSRM_IMAGE ??
        makeImage("registry.example/osrm", IMAGE_DIGESTS.osrm),
    },
    vroom: {
      image: makeImage("registry.example/vroom", IMAGE_DIGESTS.vroom),
    },
    tileserver: {
      image:
        environment.TILESERVER_IMAGE ??
        makeImage("registry.example/tileserver", IMAGE_DIGESTS.tileserver),
    },
    frontend: {
      image:
        environment.FRONTEND_IMAGE ??
        makeImage("registry.example/frontend", IMAGE_DIGESTS.frontend),
    },
  };
  const config = {
    services,
    volumes: {
      postgres_data: { name: projectName + "_postgres_data" },
      object_storage_data: { name: projectName + "_object_storage_data" },
    },
    networks: { app_network: { name: projectName + "_app_network" } },
  };
  if (environment.CFDI_ENABLED === "true") {
    services.backend.secrets = [
      {
        source: "pac_secret",
        target: environment.FACTURAMA_DOCKER_SECRET_NAME,
      },
    ];
    config.secrets = {
      pac_secret: {
        file: environment.FACTURAMA_SECRET_FILE,
      },
    };
  }
  return typeof mutate === "function" ? (mutate(config) ?? config) : config;
}

function makeStream() {
  return {
    text: "",
    write(chunk) {
      this.text += String(chunk);
      return true;
    },
  };
}

function lastJson(stream) {
  const line = stream.text.trim().split(/\r?\n/u).at(-1);
  return JSON.parse(line);
}

function createHarness(options = {}) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "tenantctl-test-"));
  let resolverPath = join(temporaryDirectory, "secret-resolver");
  let envFilePath = join(temporaryDirectory, "company.env");
  const configDirectory = join(temporaryDirectory, "tenant-configs");
  const companyManifest =
    options.manifest ?? JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const company =
    options.company ??
    companyManifest.companies.find(
      (candidate) => candidate.slug === "company-north",
    );
  const outputDirectory = join(realpathSync(temporaryDirectory), company.slug);
  const outputEnvFilePath = join(outputDirectory, ".env.production");
  const outputCaddyFilePath = join(outputDirectory, "Caddyfile.production");
  const auditLogPath = join(temporaryDirectory, ".tenantctl", "audit.jsonl");

  mkdirSync(configDirectory, { mode: 0o700 });
  for (const tenant of companyManifest.companies) {
    const tenantDirectory = join(configDirectory, tenant.slug);
    mkdirSync(tenantDirectory, { mode: 0o700 });
    writeFileSync(
      join(tenantDirectory, ".env.production"),
      makeExternalConfig(tenant) + "\n",
      { mode: 0o600 },
    );
  }

  writeFileSync(resolverPath, "# test resolver\n", { mode: 0o700 });
  chmodSync(resolverPath, 0o700);
  writeFileSync(envFilePath, makeExternalConfig(company) + "\n", {
    mode: 0o600,
  });
  resolverPath = realpathSync(resolverPath);
  envFilePath = realpathSync(envFilePath);
  if (typeof options.envContents === "string") {
    writeFileSync(envFilePath, options.envContents, { mode: 0o600 });
  }
  let manifestPath = options.manifestPath ?? MANIFEST_PATH;
  if (options.manifest) {
    const path = join(temporaryDirectory, "tenant.json");
    writeFileSync(path, JSON.stringify(options.manifest), { mode: 0o600 });
    manifestPath = path;
  }

  const stdout = makeStream();
  const stderr = makeStream();
  const calls = [];
  const events = [];
  const tenantEvents = [];
  const secretValues = options.secretValues ?? RESOLVED_SECRETS;
  let currentCommand;

  function operationFails(operation, tenant) {
    return (
      options.failOperation === operation ||
      options.failOperation === operation + ":" + tenant.slug ||
      options.failOperations?.[tenant.slug] === operation
    );
  }

  function operationTimesOut(operation, tenant) {
    return (
      options.timeoutOperation === operation ||
      options.timeoutOperation === operation + ":" + tenant.slug
    );
  }

  function companyForCompose(args) {
    const contextIndex = args.indexOf("--context");
    if (contextIndex >= 0) {
      const selectedContext = args[contextIndex + 1];
      return (
        companyManifest.companies.find(
          (tenant) => selectedContext === tenant.slug + "-prod",
        ) ?? company
      );
    }
    const selectedEnvFile = args[args.indexOf("--env-file") + 1];
    return (
      companyManifest.companies.find(
        (tenant) =>
          selectedEnvFile ===
          realpathSync(join(configDirectory, tenant.slug, ".env.production")),
      ) ?? company
    );
  }

  function fakeSpawn(executable, args, spawnOptions) {
    const call = { executable, args: [...args], options: spawnOptions };
    calls.push(call);

    if (executable === resolverPath) {
      events.push("resolver");
      if (options.failResolver) {
        return {
          status: 1,
          stdout: SECRET_MARKER,
          stderr: SECRET_MARKER,
        };
      }
      if (options.resolverOutput !== undefined) {
        return {
          status: 0,
          stdout: options.resolverOutput,
          stderr: SECRET_MARKER,
        };
      }
      const request = JSON.parse(spawnOptions.input);
      const secrets = {};
      const tenantSecretValues =
        options.secretValuesByCompany?.[request.company.slug] ?? secretValues;
      for (const purpose of Object.keys(request.secretRefs)) {
        secrets[purpose] = tenantSecretValues[purpose];
      }
      return {
        status: 0,
        stdout: JSON.stringify({ protocolVersion: 1, secrets }),
        stderr: SECRET_MARKER,
      };
    }

    if (executable === "caddy") {
      events.push("caddy-validate");
      assert.deepEqual(args.slice(0, 1), ["validate"]);
      assert.ok(args.includes("--adapter"));
      const configPath = args[args.indexOf("--config") + 1];
      assert.ok(
        readFileSync(configPath, "utf8").includes("https://" + company.erpHost),
      );
      return options.failOperation === "caddy"
        ? { status: 1, stdout: SECRET_MARKER, stderr: SECRET_MARKER }
        : { status: 0, stdout: SECRET_MARKER, stderr: SECRET_MARKER };
    }

    if (executable === "bash") {
      assert.equal(spawnOptions.shell, false);
      const isRestore = args[0].endsWith("restore-company-recovery-set.sh");
      const isCreateRecoverySet = args[0].endsWith(
        "create-company-recovery-set.sh",
      );
      assert.ok(
        isRestore || isCreateRecoverySet,
        "backup operations use company recovery sets",
      );
      const tenant = companyManifest.companies.find(
        (candidate) =>
          "tenant_" + candidate.slug.replaceAll("-", "_") ===
          spawnOptions.env.BACKUP_POSTGRES_DATABASE,
      );
      assert.ok(tenant, "backup runner must name one manifest tenant database");
      assert.equal(
        spawnOptions.env.BACKUP_COMPOSE_PROJECT_NAME,
        "tenantctl-" + tenant.slug,
      );
      assert.equal(spawnOptions.env.DOCKER_CONTEXT, tenant.slug + "-prod");
      assert.equal(spawnOptions.env.BACKUP_S3_BUCKET, tenant.backupBucket);
      const tenantSecrets =
        options.secretValuesByCompany?.[tenant.slug] ?? secretValues;
      assert.equal(
        spawnOptions.env.BACKUP_S3_ACCESS_KEY_ID,
        tenantSecrets.backup.accessKeyId,
      );
      assert.equal(
        spawnOptions.env.BACKUP_S3_SECRET_ACCESS_KEY,
        tenantSecrets.backup.secretAccessKey,
      );
      assert.equal(spawnOptions.env.COMPANY_SLUG, tenant.slug);
      assert.equal(
        spawnOptions.env.OBJECT_STORAGE_ACCESS_KEY_ID,
        tenantSecrets.objectStorage.accessKeyId,
      );
      assert.equal(
        spawnOptions.env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
        tenantSecrets.objectStorage.secretAccessKey,
      );
      assert.equal(
        spawnOptions.env.BACKUP_COMPOSE_ENV_FILE,
        realpathSync(join(configDirectory, tenant.slug, ".env.production")),
      );
      const operation = isRestore ? "restore-drill" : "backup";
      tenantEvents.push({ tenant: tenant.slug, operation });
      events.push(operation);
      if (isRestore) {
        assert.notEqual(
          spawnOptions.env.RESTORE_DATABASE_NAME,
          spawnOptions.env.RESTORE_PRODUCTION_DATABASE_NAME,
        );
        assert.match(
          spawnOptions.env.RESTORE_DATABASE_NAME,
          /_restore_drill$/u,
        );
        assert.equal(
          spawnOptions.env.RESTORE_RESULT_DIR,
          "/var/lib/pollos-distribuidor/" +
            tenant.slug +
            "/postgres-backups/restore-drills",
        );
      }
      if (operationTimesOut(operation, tenant)) {
        return { error: { code: "ETIMEDOUT" }, status: null };
      }
      if (operationFails(operation, tenant)) {
        return { status: 1, stdout: SECRET_MARKER, stderr: SECRET_MARKER };
      }
      const key = `recovery-sets/${tenant.slug}/2026-09-13T00-00-00Z-123-456.manifest.json`;
      return {
        status: 0,
        stdout: isRestore
          ? `Company restore rehearsal passed for ${spawnOptions.env.RESTORE_DATABASE_NAME} using ${spawnOptions.env.RESTORE_RECOVERY_SET_KEY}.\n`
          : `Company recovery set validated: ${key}\n`,
        stderr: SECRET_MARKER,
      };
    }

    assert.equal(executable, "docker");
    assert.equal(spawnOptions.shell, false);
    const selectedCompany = companyForCompose(args);
    assert.deepEqual(args.slice(0, 2), [
      "--context",
      selectedCompany.slug + "-prod",
    ]);
    assert.ok(args.includes("--project-name"));
    assert.ok(args.includes("tenantctl-" + selectedCompany.slug));
    assert.ok(args.includes("--project-directory"));
    assert.ok(args.includes(REPOSITORY_ROOT));
    assert.ok(args.includes("--env-file"));
    assert.ok(
      args.includes(envFilePath) ||
        args.includes(outputEnvFilePath) ||
        args.includes(
          realpathSync(
            join(configDirectory, selectedCompany.slug, ".env.production"),
          ),
        ),
    );
    assert.ok(args.includes("--file"));
    assert.ok(
      args.includes(resolve(REPOSITORY_ROOT, "docker-compose.production.yml")),
    );

    if (args.includes("config")) {
      const selectedEnvFile = args[args.indexOf("--env-file") + 1];
      events.push(
        selectedEnvFile === outputEnvFilePath ? "config-generated" : "config",
      );
      tenantEvents.push({ tenant: selectedCompany.slug, operation: "config" });
      if (
        operationFails("config", selectedCompany) ||
        (selectedEnvFile === outputEnvFilePath &&
          operationFails("config-generated", selectedCompany))
      ) {
        return { status: 1, stdout: SECRET_MARKER, stderr: SECRET_MARKER };
      }
      const envFileValues = Object.create(null);
      for (const line of readFileSync(selectedEnvFile, "utf8").split(
        /\r?\n/u,
      )) {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex > 0) {
          envFileValues[line.slice(0, separatorIndex)] = line.slice(
            separatorIndex + 1,
          );
        }
      }
      const fakeConfig = makeComposeConfig(
        { ...envFileValues, ...spawnOptions.env },
        selectedCompany,
        options.mutateComposeConfig,
      );
      return {
        status: 0,
        stdout: JSON.stringify(fakeConfig),
        stderr: SECRET_MARKER,
      };
    }
    if (args.includes("pull")) {
      events.push("pull");
      tenantEvents.push({ tenant: selectedCompany.slug, operation: "pull" });
      return operationFails("pull", selectedCompany)
        ? { status: 1, stdout: SECRET_MARKER, stderr: SECRET_MARKER }
        : { status: 0, stdout: SECRET_MARKER, stderr: SECRET_MARKER };
    }
    if (args.includes("run")) {
      const service =
        args[args.length - 1] === "migrate" ? "migrate" : "bootstrap";
      events.push(service);
      tenantEvents.push({ tenant: selectedCompany.slug, operation: service });
      if (operationTimesOut(service, selectedCompany)) {
        return { error: { code: "ETIMEDOUT" }, status: null };
      }
      return operationFails(service, selectedCompany)
        ? { status: 1, stdout: SECRET_MARKER, stderr: SECRET_MARKER }
        : { status: 0, stdout: SECRET_MARKER, stderr: SECRET_MARKER };
    }
    if (args.includes("up")) {
      events.push("up");
      tenantEvents.push({ tenant: selectedCompany.slug, operation: "up" });
      return operationFails("up", selectedCompany)
        ? { status: 1, stdout: SECRET_MARKER, stderr: SECRET_MARKER }
        : { status: 0, stdout: SECRET_MARKER, stderr: SECRET_MARKER };
    }
    if (args.includes("ps")) {
      events.push(currentCommand === "provision" ? "readiness" : "ps");
      tenantEvents.push({
        tenant: selectedCompany.slug,
        operation: currentCommand === "provision" ? "readiness" : "status",
      });
      const runtimeServices = [
        "postgres",
        "object-storage",
        "backend",
        "photon",
        "osrm",
        "vroom",
        "tileserver",
        "frontend",
      ];
      return {
        status: 0,
        stdout: runtimeServices
          .map((Service) =>
            JSON.stringify({
              Service,
              State: "running",
              Health:
                operationFails("readiness", selectedCompany) &&
                Service === "backend"
                  ? "unhealthy"
                  : "healthy",
              Name: SECRET_MARKER,
              Command: SECRET_MARKER,
            }),
          )
          .join("\n"),
        stderr: SECRET_MARKER,
      };
    }
    if (args.includes("exec")) {
      events.push("smoke");
      tenantEvents.push({ tenant: selectedCompany.slug, operation: "smoke" });
      return operationFails("smoke", selectedCompany)
        ? { status: 1, stdout: SECRET_MARKER, stderr: SECRET_MARKER }
        : { status: 0, stdout: SECRET_MARKER, stderr: SECRET_MARKER };
    }

    throw new Error("Unexpected Docker command");
  }

  return {
    company,
    calls,
    events,
    tenantEvents,
    envFilePath,
    configDirectory,
    manifestPath,
    resolverPath,
    outputDirectory,
    outputEnvFilePath,
    outputCaddyFilePath,
    auditLogPath,
    stderr,
    stdout,
    temporaryDirectory,
    cleanup() {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    },
    run(args) {
      currentCommand = args[0];
      return main(args, {
        repositoryRoot: REPOSITORY_ROOT,
        composeFile: resolve(REPOSITORY_ROOT, "docker-compose.production.yml"),
        caddyTemplateFile: resolve(REPOSITORY_ROOT, "Caddyfile.production"),
        cfdiComposeFile: resolve(
          REPOSITORY_ROOT,
          "docker/multi-company/docker-compose.cfdi.yml",
        ),
        cwd: REPOSITORY_ROOT,
        env: {
          PATH: "/usr/bin:/bin",
          HOME: temporaryDirectory,
          ...(options.includeOperator === false
            ? {}
            : { TENANTCTL_OPERATOR: options.operator ?? "test-operator" }),
          AWS_PROFILE: "test-profile",
          COMPOSE_PROFILES: "must-not-be-inherited",
        },
        spawn: fakeSpawn,
        now: options.now ?? (() => 1000),
        stdout,
        stderr,
      });
    },
  };
}

function baseArguments(harness, command, extra = []) {
  return [
    command,
    "--manifest",
    harness.manifestPath,
    "--company",
    harness.company.slug,
    "--env-file",
    harness.envFilePath,
    ...(command === "provision"
      ? ["--output-dir", harness.outputDirectory]
      : []),
    "--resolver",
    harness.resolverPath,
    ...confirmSensitiveApply(extra),
  ];
}

function batchArguments(harness, command, extra = []) {
  return [
    command,
    "--manifest",
    harness.manifestPath,
    "--env-dir",
    harness.configDirectory,
    "--resolver",
    harness.resolverPath,
    ...confirmSensitiveApply(extra),
  ];
}

function canaryArguments(harness, company, extra = []) {
  return [
    "migrate",
    "--manifest",
    harness.manifestPath,
    "--company",
    company.slug,
    "--env-dir",
    harness.configDirectory,
    "--resolver",
    harness.resolverPath,
    "--canary",
    ...confirmSensitiveApply(extra),
  ];
}

function confirmSensitiveApply(extra) {
  if (!extra.includes("--apply") || extra.includes("--dry-run")) {
    return extra;
  }
  const result = [...extra];
  if (!result.includes("--reason")) result.push("--reason", "MTE-007");
  if (!result.includes("--confirm")) result.push("--confirm");
  return result;
}

test("tenantctl parser accepts supported command options", () => {
  const parsed = parseTenantctlArgs([
    "provision",
    "--manifest",
    "tenants.json",
    "--company",
    "company-north",
    "--env-file",
    "/etc/tenantctl/company.env",
    "--output-dir",
    "/etc/pollos-distribuidor/tenants/company-north",
    "--resolver",
    "/usr/local/bin/tenant-secret-resolver",
    "--dry-run",
  ]);
  assert.equal(parsed.command, "provision");
  assert.equal(parsed.companySlug, "company-north");
  assert.equal(
    parsed.outputDirectory,
    "/etc/pollos-distribuidor/tenants/company-north",
  );
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.apply, false);
});

test("tenantctl parser requires explicit apply for mutations", () => {
  assert.throws(
    () =>
      parseTenantctlArgs([
        "migrate",
        "--manifest",
        "tenants.json",
        "--company",
        "company-north",
        "--env-file",
        "/etc/tenantctl/company.env",
        "--resolver",
        "/usr/local/bin/tenant-secret-resolver",
      ]),
    /requires --apply/,
  );
  assert.throws(
    () =>
      parseTenantctlArgs([
        "provision",
        "--manifest",
        "tenants.json",
        "--company",
        "company-north",
        "--env-file",
        "/etc/tenantctl/company.env",
        "--resolver",
        "/usr/local/bin/tenant-secret-resolver",
        "--apply",
      ]),
    /--output-dir/,
  );
  assert.throws(
    () =>
      parseTenantctlArgs([
        "status",
        "--manifest",
        "tenants.json",
        "--company",
        "company-north",
        "--env-file",
        "/etc/tenantctl/company.env",
        "--resolver",
        "/usr/local/bin/tenant-secret-resolver",
        "--apply",
      ]),
    /only supported by mutating commands/,
  );
  assert.throws(
    () =>
      parseTenantctlArgs([
        "provision",
        "--manifest",
        "tenants.json",
        "--company",
        "company-north",
        "--env-file",
        "/etc/tenantctl/company.env",
        "--output-dir",
        "/etc/pollos-distribuidor/tenants/company-north",
        "--resolver",
        "/usr/local/bin/tenant-secret-resolver",
        "--apply",
        "--dry-run",
      ]),
    /cannot be combined/,
  );
});

test("tenantctl parser fails on missing, duplicate, and unknown options", () => {
  assert.throws(() => parseTenantctlArgs([]), /command is required/);
  assert.throws(
    () =>
      parseTenantctlArgs([
        "validate",
        "--company",
        "Company-North",
        "--manifest",
        "tenants.json",
        "--env-file",
        "/etc/tenantctl/company.env",
        "--resolver",
        "/usr/local/bin/resolver",
      ]),
    /lowercase DNS-safe slug/,
  );
  assert.throws(
    () =>
      parseTenantctlArgs([
        "validate",
        "--company",
        "company-north",
        "--company",
        "company-south",
        "--manifest",
        "tenants.json",
        "--env-file",
        "/etc/tenantctl/company.env",
        "--resolver",
        "/usr/local/bin/resolver",
      ]),
    /may not be repeated/,
  );
  assert.throws(
    () =>
      parseTenantctlArgs([
        "validate",
        "--company",
        "company-north",
        "--manifest",
        "tenants.json",
        "--env-file",
        "/etc/tenantctl/company.env",
        "--resolver",
        "/usr/local/bin/resolver",
        "--force",
      ]),
    /Unsupported option/,
  );
});

test("tenantctl parser defines safe batch, timeout, and canary contracts", () => {
  const list = parseTenantctlArgs(["list", "--manifest", "tenants.json"]);
  assert.equal(list.command, "list");

  const singleStatus = parseTenantctlArgs([
    "status",
    "--manifest",
    "tenants.json",
    "--company",
    "company-north",
    "--env-file",
    "/etc/tenantctl/company-north.env",
    "--resolver",
    "/usr/local/bin/tenant-secret-resolver",
  ]);
  assert.equal(singleStatus.timeoutMs, 1_800_000);

  const batch = parseTenantctlArgs([
    "backup",
    "--manifest",
    "tenants.json",
    "--env-dir",
    "/etc/pollos/tenants",
    "--resolver",
    "/usr/local/bin/tenant-secret-resolver",
    "--timeout-seconds",
    "60",
    "--continue-on-error",
    "--apply",
    "--reason",
    "MTE-007",
    "--confirm",
  ]);
  assert.equal(batch.timeoutMs, 60_000);
  assert.equal(batch.continueOnError, true);

  const canary = parseTenantctlArgs([
    "migrate",
    "--manifest",
    "tenants.json",
    "--company",
    "company-north",
    "--env-dir",
    "/etc/pollos/tenants",
    "--resolver",
    "/usr/local/bin/tenant-secret-resolver",
    "--canary",
    "--apply",
    "--reason",
    "MTE-007",
    "--confirm",
  ]);
  assert.equal(canary.canary, true);

  assert.throws(
    () =>
      parseTenantctlArgs([
        "migrate",
        "--manifest",
        "tenants.json",
        "--resolver",
        "/usr/local/bin/tenant-secret-resolver",
        "--apply",
      ]),
    /require --env-dir/u,
  );
  assert.throws(
    () =>
      parseTenantctlArgs([
        "migrate",
        "--manifest",
        "tenants.json",
        "--env-dir",
        "/etc/pollos/tenants",
        "--resolver",
        "/usr/local/bin/tenant-secret-resolver",
        "--canary",
        "--apply",
      ]),
    /requires --company and --env-dir/u,
  );
  assert.throws(
    () =>
      parseTenantctlArgs([
        "backup",
        "--manifest",
        "tenants.json",
        "--env-dir",
        "/etc/pollos/tenants",
        "--resolver",
        "/usr/local/bin/tenant-secret-resolver",
        "--continue-on-error",
        "--timeout-seconds",
        "90000",
        "--apply",
      ]),
    /between 1 and 86400/u,
  );
});

test("tenantctl parser requires a ticket and a second confirmation for sensitive apply", () => {
  const provision = [
    "provision",
    "--manifest",
    "tenants.json",
    "--company",
    "company-north",
    "--env-file",
    "/etc/tenantctl/company-north.env",
    "--resolver",
    "/usr/local/bin/tenant-secret-resolver",
    "--output-dir",
    "/etc/pollos/tenants/company-north",
  ];

  assert.throws(
    () => parseTenantctlArgs([...provision, "--apply"]),
    /Missing required option: --reason/u,
  );
  assert.throws(
    () => parseTenantctlArgs([...provision, "--apply", "--reason", "MTE-007"]),
    /requires explicit --confirm/u,
  );
  assert.throws(
    () =>
      parseTenantctlArgs([
        ...provision,
        "--apply",
        "--reason",
        "PASSWORD-123456",
        "--confirm",
      ]),
    /ticket reference/u,
  );

  const parsed = parseTenantctlArgs([
    ...provision,
    "--apply",
    "--reason",
    "MTE-007",
    "--confirm",
    "--operator",
    "ops-user",
    "--audit-log",
    "/var/lib/tenantctl/audit.jsonl",
  ]);
  assert.equal(parsed.reason, "MTE-007");
  assert.equal(parsed.confirm, true);
  assert.equal(parsed.operator, "ops-user");
  assert.equal(parsed.auditLogPath, "/var/lib/tenantctl/audit.jsonl");
  assert.throws(
    () =>
      parseTenantctlArgs([
        "list",
        "--manifest",
        "tenants.json",
        "--operator",
        "AKIAIOSFODNN7EXAMPLE",
      ]),
    /non-secret operator identifier/u,
  );
});

test("checked-in two-company manifest satisfies the shared contract", () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  assert.deepEqual(validateCompanyManifest(manifest), []);
  for (const company of manifest.companies) {
    assert.equal(typeof company.secretRefs.bootstrapAdmin, "string");
  }
});

test("list returns only safe tenant inventory fields without resolving credentials", (t) => {
  const harness = createHarness();
  t.after(harness.cleanup);
  assert.equal(harness.run(["list", "--manifest", harness.manifestPath]), 0);
  const result = JSON.parse(harness.stdout.text);
  assert.equal(result.command, "list");
  assert.equal(result.status, "succeeded");
  assert.equal(result.tenants.length, 2);
  assert.deepEqual(
    result.tenants.map((tenant) => tenant.slug),
    ["company-north", "company-south"],
  );
  assert.equal(result.tenants[0].database, "tenant_company_north");
  assert.equal(result.tenants[0].backupNamespace, "company-north-backups");
  assert.doesNotMatch(harness.stdout.text, /secretRefs|vault:\/\//u);
  assert.doesNotMatch(harness.stdout.text, new RegExp(SECRET_MARKER));
  assert.deepEqual(harness.events, []);
  const auditRecords = readFileSync(harness.auditLogPath, "utf8")
    .trim()
    .split(/\r?\n/u)
    .map((line) => JSON.parse(line));
  assert.equal(auditRecords.length, 4);
  assert.ok(auditRecords.every((record) => record.command === "list"));
  assert.ok(
    auditRecords.every(
      (record) => record.result === "started" || record.result === "succeeded",
    ),
  );
});

test("tenant commands append correlated secret-free JSONL audit records outside the repository", (t) => {
  const harness = createHarness({ manifest: makeActiveManifest() });
  t.after(harness.cleanup);

  assert.equal(harness.run(batchArguments(harness, "status")), 0);
  const result = lastJson(harness.stdout);
  const contents = readFileSync(harness.auditLogPath, "utf8");
  const records = contents
    .trim()
    .split(/\r?\n/u)
    .map((line) => JSON.parse(line));

  assert.equal(records.length, 4);
  assert.deepEqual(
    records.map((record) => record.result),
    ["started", "started", "succeeded", "succeeded"],
  );
  assert.deepEqual(
    [...new Set(records.map((record) => record.tenant))].sort(),
    ["company-north", "company-south"],
  );
  for (const record of records) {
    assert.equal(record.protocolVersion, 1);
    assert.equal(record.operator, "test-operator");
    assert.equal(record.command, "status");
    assert.equal(record.runId, result.runId);
    assert.ok(
      ["development", "staging", "production"].includes(
        record.targetEnvironment,
      ),
    );
    assert.equal(record.timestamp, new Date(1000).toISOString());
    assert.equal(typeof record.durationMs, "number");
    assert.equal(Object.hasOwn(record, "reason"), false);
    assert.deepEqual(
      Object.keys(record).sort(),
      [
        "command",
        "durationMs",
        "operator",
        "protocolVersion",
        "result",
        "runId",
        "targetEnvironment",
        "tenant",
        "timestamp",
      ].sort(),
    );
  }
  assert.equal(contents.includes(SECRET_MARKER), false);
  for (const secret of [
    RESOLVED_SECRETS.database,
    RESOLVED_SECRETS.jwtAccess,
    RESOLVED_SECRETS.jwtRefresh,
    RESOLVED_SECRETS.objectStorage.accessKeyId,
    RESOLVED_SECRETS.objectStorage.secretAccessKey,
    RESOLVED_SECRETS.backup.accessKeyId,
    RESOLVED_SECRETS.backup.secretAccessKey,
    RESOLVED_SECRETS.bootstrapAdmin,
  ]) {
    assert.equal(contents.includes(secret), false);
  }
  assert.equal(statSync(harness.auditLogPath).mode & 0o077, 0);
  assert.equal(
    relative(REPOSITORY_ROOT, harness.auditLogPath).startsWith(".."),
    true,
  );
});

test("sensitive failure audit contains only the ticket reference and result", (t) => {
  const harness = createHarness({ failOperation: "migrate" });
  t.after(harness.cleanup);

  assert.equal(
    harness.run(baseArguments(harness, "bootstrap", ["--apply"])),
    1,
  );
  const contents = readFileSync(harness.auditLogPath, "utf8");
  const records = contents
    .trim()
    .split(/\r?\n/u)
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    records.map((record) => record.result),
    ["started", "failed"],
  );
  assert.equal(records.at(-1).command, "bootstrap");
  assert.equal(records.at(-1).reason, "MTE-007");
  assert.equal(contents.includes(SECRET_MARKER), false);
  assert.equal(contents.includes(RESOLVED_SECRETS.bootstrapAdmin), false);
});

test("missing operator identity and an in-repository audit path fail before tenant work", (t) => {
  const missingOperator = createHarness({ includeOperator: false });
  t.after(missingOperator.cleanup);
  assert.equal(
    missingOperator.run(["list", "--manifest", missingOperator.manifestPath]),
    1,
  );
  assert.match(missingOperator.stderr.text, /TENANTCTL_OPERATOR/u);
  assert.equal(existsSync(missingOperator.auditLogPath), false);

  const inRepository = createHarness();
  t.after(inRepository.cleanup);
  const inRepositoryLog = join(
    REPOSITORY_ROOT,
    ".tenantctl-audit-probe-" + basename(inRepository.temporaryDirectory),
    "audit.jsonl",
  );
  assert.equal(
    inRepository.run(
      baseArguments(inRepository, "migrate", [
        "--apply",
        "--audit-log",
        inRepositoryLog,
      ]),
    ),
    1,
  );
  assert.match(
    inRepository.stderr.text,
    /audit log is unavailable or insecure/u,
  );
  assert.equal(inRepository.calls.length, 0);
  assert.equal(existsSync(dirname(inRepositoryLog)), false);
});

test("audit writes preserve individual partial-batch outcomes", (t) => {
  const harness = createHarness({
    manifest: makeActiveManifest(true),
    failOperation: "backup:company-south",
  });
  t.after(harness.cleanup);

  assert.equal(harness.run(batchArguments(harness, "backup", ["--apply"])), 1);
  const result = lastJson(harness.stdout);
  const records = readFileSync(harness.auditLogPath, "utf8")
    .trim()
    .split(/\r?\n/u)
    .map((line) => JSON.parse(line));
  const terminal = records.filter((record) => record.result !== "started");

  assert.deepEqual(
    result.results.map((tenant) => tenant.status),
    ["succeeded", "failed", "skipped"],
  );
  assert.deepEqual(
    terminal.map((record) => [record.tenant, record.result]),
    [
      ["company-north", "succeeded"],
      ["company-south", "failed"],
      ["company-east", "skipped"],
    ],
  );
  assert.ok(records.every((record) => record.runId === result.runId));
  assert.ok(records.every((record) => record.reason === "MTE-007"));
  assert.equal(
    readFileSync(harness.auditLogPath, "utf8").includes(SECRET_MARKER),
    false,
  );
});

test("audit rejects symlink and group/world-readable log files before tenant work", (t) => {
  const harness = createHarness();
  t.after(harness.cleanup);
  const privateTarget = join(harness.temporaryDirectory, "private-audit.jsonl");
  const symlinkedLog = join(
    harness.temporaryDirectory,
    "symlinked-audit.jsonl",
  );
  const permissiveLog = join(
    harness.temporaryDirectory,
    "permissive-audit.jsonl",
  );
  writeFileSync(privateTarget, "existing\n", { mode: 0o600 });
  symlinkSync(privateTarget, symlinkedLog);
  writeFileSync(permissiveLog, "existing\n", { mode: 0o600 });
  chmodSync(permissiveLog, 0o644);

  assert.equal(
    harness.run([
      "list",
      "--manifest",
      harness.manifestPath,
      "--audit-log",
      symlinkedLog,
    ]),
    1,
  );
  assert.equal(
    harness.run([
      "list",
      "--manifest",
      harness.manifestPath,
      "--audit-log",
      permissiveLog,
    ]),
    1,
  );
  assert.equal(readFileSync(privateTarget, "utf8"), "existing\n");
  assert.equal(readFileSync(permissiveLog, "utf8"), "existing\n");
  assert.deepEqual(harness.events, []);
});

test("validate resolves external refs and checks digest-pinned Compose without logging secrets", (t) => {
  const harness = createHarness();
  t.after(harness.cleanup);
  assert.equal(harness.run(baseArguments(harness, "validate")), 0);
  assert.deepEqual(harness.events, ["resolver", "config"]);
  assert.match(harness.stdout.text, /configuration is valid for company-north/);
  assert.doesNotMatch(harness.stdout.text, new RegExp(SECRET_MARKER));
  assert.doesNotMatch(harness.stderr.text, new RegExp(SECRET_MARKER));
  const auditRecords = readFileSync(harness.auditLogPath, "utf8")
    .trim()
    .split(/\r?\n/u)
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    auditRecords.map((record) => record.result),
    ["started", "succeeded"],
  );
  assert.ok(auditRecords.every((record) => record.command === "validate"));

  const resolverCall = harness.calls.find(
    (call) => call.executable === harness.resolverPath,
  );
  const request = JSON.parse(resolverCall.options.input);
  assert.equal(request.protocolVersion, 1);
  assert.equal(
    request.company.deploymentHostRef,
    harness.company.deploymentHostRef,
  );
  assert.deepEqual(
    Object.keys(request.secretRefs).sort(),
    ["database", "jwtAccess", "jwtRefresh", "objectStorage"].sort(),
  );
  const composeCall = harness.calls.find(
    (call) => call.executable === "docker",
  );
  assert.ok(composeCall.args.includes("--profile"));
  assert.ok(composeCall.args.includes("migration"));
  assert.ok(composeCall.args.includes("config"));
  assert.equal(composeCall.options.env.COMPOSE_PROFILES, undefined);
  assert.equal(
    composeCall.options.env.JWT_ACCESS_SECRET,
    RESOLVED_SECRETS.jwtAccess,
  );
});

test("provision dry-run resolves configuration but does not mutate Compose state", (t) => {
  const harness = createHarness();
  t.after(harness.cleanup);
  const dryRunExitCode = harness.run(
    baseArguments(harness, "provision", ["--dry-run"]),
  );
  assert.equal(dryRunExitCode, 0, harness.stderr.text);
  assert.deepEqual(harness.events, ["resolver", "config", "caddy-validate"]);
  assert.match(harness.stdout.text, /Dry run for tenant company-north/);
  assert.match(harness.stdout.text, /migration service/);
  assert.equal(existsSync(harness.outputDirectory), false);
  assert.doesNotMatch(harness.stdout.text, new RegExp(SECRET_MARKER));
  const auditRecords = readFileSync(harness.auditLogPath, "utf8")
    .trim()
    .split(/\r?\n/u)
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    auditRecords.map((record) => record.result),
    ["started", "planned"],
  );
});

test("provision prepares isolated artifacts and orders validation, migration, bootstrap, readiness, and smoke", (t) => {
  const harness = createHarness();
  t.after(harness.cleanup);
  const provisionExitCode = harness.run(
    baseArguments(harness, "provision", ["--apply"]),
  );
  assert.equal(provisionExitCode, 0, harness.stderr.text);
  assert.deepEqual(harness.events, [
    "resolver",
    "config",
    "caddy-validate",
    "config-generated",
    "pull",
    "migrate",
    "bootstrap",
    "up",
    "readiness",
    "smoke",
  ]);
  const generatedEnv = readFileSync(harness.outputEnvFilePath, "utf8");
  const generatedCaddy = readFileSync(harness.outputCaddyFilePath, "utf8");
  assert.equal(statSync(harness.outputEnvFilePath).mode & 0o777, 0o600);
  assert.equal(statSync(harness.outputDirectory).mode & 0o777, 0o700);
  assert.match(generatedEnv, /POSTGRES_DB=tenant_company_north/u);
  assert.match(generatedEnv, /BACKUP_S3_BUCKET=company-north-backups/u);
  assert.match(
    generatedEnv,
    /BACKUP_COMPOSE_PROJECT_NAME=tenantctl-company-north/u,
  );
  assert.match(
    generatedEnv,
    /BACKUP_LOCAL_DIR=\/var\/lib\/pollos-distribuidor\/company-north\/postgres-backups/u,
  );
  assert.match(
    generatedEnv,
    /BACKUP_S3_CREDENTIAL_REF=vault:\/\/production\/company-north\/backup/u,
  );
  assert.match(
    generatedEnv,
    /FACTURAMA_CREDENTIAL_REF=docker-secret:\/\/company-north-pac/u,
  );
  assert.match(
    generatedEnv,
    /CSD_CREDENTIAL_REF=vault:\/\/production\/company-north\/csd/u,
  );
  assert.match(generatedEnv, /CORS_ORIGIN=https:\/\/erp\.north\.example/u);
  assert.match(
    generatedEnv,
    /OBJECT_STORAGE_PUBLIC_ENDPOINT=https:\/\/objects\.north\.example/u,
  );
  assert.doesNotMatch(
    generatedEnv,
    /DATABASE_URL|POSTGRES_PASSWORD|JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|OBJECT_STORAGE_ACCESS_KEY_ID|SEED_ADMIN_PASSWORD/u,
  );
  assert.match(generatedCaddy, /https:\/\/erp\.north\.example/u);
  assert.match(generatedCaddy, /https:\/\/objects\.north\.example/u);
  assert.doesNotMatch(
    generatedCaddy,
    /erp\.example\.com|objects\.example\.com/u,
  );
  for (const value of [
    RESOLVED_SECRETS.database,
    RESOLVED_SECRETS.jwtAccess,
    RESOLVED_SECRETS.jwtRefresh,
    RESOLVED_SECRETS.objectStorage.accessKeyId,
    RESOLVED_SECRETS.objectStorage.secretAccessKey,
    RESOLVED_SECRETS.bootstrapAdmin,
  ]) {
    assert.equal(generatedEnv.includes(value), false);
  }
  const dockerCalls = harness.calls.filter(
    (call) => call.executable === "docker",
  );
  assert.ok(dockerCalls.every((call) => call.args.includes("--context")));
  assert.ok(dockerCalls.every((call) => call.args.includes("--project-name")));
  const pullCall = dockerCalls.find((call) => call.args.includes("pull"));
  assert.ok(pullCall.args.includes("--profile"));
  assert.ok(pullCall.args.includes("migration"));
  const migrationCall = dockerCalls.find(
    (call) => call.args.at(-1) === "migrate",
  );
  const bootstrapCall = dockerCalls.find(
    (call) => call.args.at(-1) === "bootstrap",
  );
  const startupCall = dockerCalls.find((call) => call.args.includes("up"));
  assert.ok(migrationCall.args.includes("--profile"));
  assert.ok(bootstrapCall.args.includes("--no-deps"));
  assert.ok(startupCall.args.includes("--wait"));
  assert.ok(startupCall.args.includes("--no-build"));
  assert.ok(startupCall.args.includes("--pull"));
  assert.ok(startupCall.args.includes("never"));
  assert.ok(!startupCall.args.includes("--profile"));
  assert.ok(startupCall.args.includes(harness.outputEnvFilePath));
  const smokeCall = dockerCalls.find((call) => call.args.includes("exec"));
  assert.ok(smokeCall.args.includes("node"));
  assert.ok(smokeCall.args.includes("-e"));
  assert.match(smokeCall.args.at(-1), /http:\/\/frontend:3000/u);
  assert.match(smokeCall.args.at(-1), /health\/ready/u);
  for (const call of dockerCalls.filter((candidate) =>
    ["migrate", "bootstrap", "up", "ps", "exec"].some((operation) =>
      candidate.args.includes(operation),
    ),
  )) {
    assert.ok(call.args.includes(harness.outputEnvFilePath));
  }
  assert.ok(
    dockerCalls.every(
      (call) =>
        !call.args.includes("down") &&
        !call.args.includes("volume") &&
        !call.args.includes("psql"),
    ),
  );
  assert.match(harness.stdout.text, /Provisioning completed for company-north/);
  assert.doesNotMatch(harness.stdout.text, new RegExp(SECRET_MARKER));
});

test("renders isolated A/B ERP, Object Storage, CSP and HTTP routes with one frontend digest", (t) => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const companyA = manifest.companies[0];
  const companyB = manifest.companies[1];
  const harnessA = createHarness({ manifest, company: companyA });
  const harnessB = createHarness({ manifest, company: companyB });
  t.after(harnessA.cleanup);
  t.after(harnessB.cleanup);

  for (const harness of [harnessA, harnessB]) {
    assert.equal(
      harness.run(baseArguments(harness, "provision", ["--apply"])),
      0,
      harness.stderr.text,
    );
  }

  const caddyA = readFileSync(harnessA.outputCaddyFilePath, "utf8");
  const caddyB = readFileSync(harnessB.outputCaddyFilePath, "utf8");
  for (const [caddy, company, other] of [
    [caddyA, companyA, companyB],
    [caddyB, companyB, companyA],
  ]) {
    assert.ok(caddy.includes("https://" + company.erpHost));
    assert.ok(caddy.includes("https://" + company.objectStorageHost));
    assert.ok(
      caddy.includes(
        "img-src 'self' data: blob: https://" + company.objectStorageHost + ";",
      ),
    );
    assert.ok(
      !caddy.includes(company.erpHost === other.erpHost ? "" : other.erpHost),
    );
    assert.ok(
      !caddy.includes(
        company.objectStorageHost === other.objectStorageHost
          ? ""
          : other.objectStorageHost,
      ),
    );
    assert.equal(
      (caddy.match(/^\s*>Content-Security-Policy /gm) ?? []).length,
      1,
    );
    assert.equal(
      (caddy.match(/header_down -Content-Security-Policy/g) ?? []).length,
      1,
    );
    assert.ok(caddy.includes("reverse_proxy 127.0.0.1:3000"));
    assert.ok(caddy.includes("reverse_proxy 127.0.0.1:8333"));
  }

  const frontendDigestA = readFileSync(
    harnessA.outputEnvFilePath,
    "utf8",
  ).match(/^FRONTEND_IMAGE=(.+)$/mu)?.[1];
  const frontendDigestB = readFileSync(
    harnessB.outputEnvFilePath,
    "utf8",
  ).match(/^FRONTEND_IMAGE=(.+)$/mu)?.[1];
  assert.ok(frontendDigestA?.includes("@sha256:"));
  assert.equal(frontendDigestA, frontendDigestB);
  const frontendGateway = readFileSync(
    resolve(REPOSITORY_ROOT, "docker/frontend/Dockerfile"),
    "utf8",
  );
  assert.match(frontendGateway, /location \/api\/socket\.io \{/u);
  assert.match(
    frontendGateway,
    /proxy_pass http:\/\/backend:4000\/api\/socket\.io;/u,
  );
  assert.match(frontendGateway, /proxy_set_header Upgrade \$http_upgrade;/u);
  assert.match(frontendGateway, /proxy_set_header Connection "upgrade";/u);
});

test("tenant output must stay outside the repository and use a tenant-specific directory", (t) => {
  const harness = createHarness();
  t.after(harness.cleanup);
  const args = baseArguments(harness, "provision", ["--dry-run"]);
  args[args.indexOf("--output-dir") + 1] = resolve(
    REPOSITORY_ROOT,
    "scripts/multi-company/company-north",
  );
  assert.equal(harness.run(args), 1);
  assert.deepEqual(harness.events, []);
  assert.match(harness.stderr.text, /outside the repository/);
});

test("generated tenant config replacement requires an explicit flag and preserves rollback copies", (t) => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const harness = createHarness({ manifest });
  t.after(harness.cleanup);
  const provisionArgs = () => baseArguments(harness, "provision", ["--apply"]);

  assert.equal(harness.run(provisionArgs()), 0);
  const originalCaddy = readFileSync(harness.outputCaddyFilePath, "utf8");

  manifest.companies[0].erpHost = "erp.north-updated.example";
  writeFileSync(harness.manifestPath, JSON.stringify(manifest), {
    mode: 0o600,
  });
  writeFileSync(
    harness.envFilePath,
    makeExternalConfig(harness.company) + "\n",
    { mode: 0o600 },
  );
  harness.events.length = 0;
  harness.calls.length = 0;
  harness.stderr.text = "";
  assert.equal(harness.run(provisionArgs()), 1);
  assert.deepEqual(harness.events, ["resolver", "config", "caddy-validate"]);
  assert.match(harness.stderr.text, /pass --replace-generated-config/);
  assert.equal(
    readFileSync(harness.outputCaddyFilePath, "utf8"),
    originalCaddy,
  );

  harness.events.length = 0;
  harness.calls.length = 0;
  harness.stderr.text = "";
  assert.equal(
    harness.run(
      baseArguments(harness, "provision", [
        "--apply",
        "--replace-generated-config",
      ]),
    ),
    0,
  );
  assert.notEqual(
    readFileSync(harness.outputCaddyFilePath, "utf8"),
    originalCaddy,
  );
  assert.ok(
    readdirSync(harness.outputDirectory).some((name) =>
      name.startsWith(".tenantctl-rollback-"),
    ),
  );
});

test("CFDI overlay mounts only the selected Docker PAC secret file by reference", (t) => {
  const harness = createHarness();
  t.after(harness.cleanup);
  const pacOverlay = readFileSync(
    resolve(REPOSITORY_ROOT, "docker/multi-company/docker-compose.cfdi.yml"),
    "utf8",
  );
  assert.match(pacOverlay, /source: pac_secret/u);
  assert.match(pacOverlay, /target: \$\{FACTURAMA_DOCKER_SECRET_NAME:/u);
  assert.match(pacOverlay, /file: \$\{FACTURAMA_SECRET_FILE:/u);
  const pacSecretFile = join(harness.temporaryDirectory, "pac-envelope.json");
  writeFileSync(pacSecretFile, SECRET_MARKER, { mode: 0o600 });
  const envContents =
    makeExternalConfig(harness.company).replace(
      "CFDI_ENABLED=false",
      "CFDI_ENABLED=true",
    ) +
    "\nFACTURAMA_SECRET_FILE=" +
    pacSecretFile +
    "\n";
  writeFileSync(harness.envFilePath, envContents, { mode: 0o600 });

  const dryRunExitCode = harness.run(
    baseArguments(harness, "provision", ["--dry-run"]),
  );
  assert.equal(dryRunExitCode, 0, harness.stderr.text);
  const composeConfigCall = harness.calls.find(
    (call) => call.executable === "docker" && call.args.includes("config"),
  );
  assert.ok(
    composeConfigCall.args.includes(
      resolve(REPOSITORY_ROOT, "docker/multi-company/docker-compose.cfdi.yml"),
    ),
  );
  assert.equal(
    composeConfigCall.options.env.FACTURAMA_CREDENTIAL_REF,
    harness.company.secretRefs.pac,
  );
  assert.equal(
    composeConfigCall.options.env.FACTURAMA_DOCKER_SECRET_NAME,
    "company-north-pac",
  );
  assert.doesNotMatch(harness.stdout.text, new RegExp(SECRET_MARKER));
  assert.doesNotMatch(harness.stderr.text, new RegExp(SECRET_MARKER));
});

test("CFDI provisioning fails closed without a supported PAC reference and private secret file", (t) => {
  const missingFile = createHarness({
    envContents: makeExternalConfig(
      JSON.parse(readFileSync(MANIFEST_PATH, "utf8")).companies[0],
    ).replace("CFDI_ENABLED=false", "CFDI_ENABLED=true"),
  });
  t.after(missingFile.cleanup);
  assert.equal(
    missingFile.run(baseArguments(missingFile, "provision", ["--dry-run"])),
    1,
  );
  assert.deepEqual(missingFile.events, []);
  assert.match(missingFile.stderr.text, /FACTURAMA_SECRET_FILE/);

  const unsupportedManifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  unsupportedManifest.companies[0].secretRefs.pac =
    "vault://production/company-north/pac";
  const unsupported = createHarness({ manifest: unsupportedManifest });
  t.after(unsupported.cleanup);
  const pacSecretFile = join(unsupported.temporaryDirectory, "pac.json");
  writeFileSync(pacSecretFile, "{}", { mode: 0o600 });
  writeFileSync(
    unsupported.envFilePath,
    makeExternalConfig(unsupported.company).replace(
      "CFDI_ENABLED=false",
      "CFDI_ENABLED=true",
    ) +
      "\nFACTURAMA_SECRET_FILE=" +
      pacSecretFile +
      "\n",
    { mode: 0o600 },
  );
  assert.equal(
    unsupported.run(baseArguments(unsupported, "provision", ["--dry-run"])),
    1,
  );
  assert.deepEqual(unsupported.events, []);
  assert.match(unsupported.stderr.text, /docker-secret reference/);
});

test("CFDI provisioning rejects a symlinked PAC secret file", (t) => {
  if (process.platform === "win32") {
    t.skip("Symlink creation requires elevated privileges on Windows.");
  }
  const harness = createHarness();
  t.after(harness.cleanup);
  const pacSecretTarget = join(harness.temporaryDirectory, "pac-target.json");
  const pacSecretLink = join(harness.temporaryDirectory, "pac-secret.json");
  writeFileSync(pacSecretTarget, "{}", { mode: 0o600 });
  symlinkSync(pacSecretTarget, pacSecretLink);
  writeFileSync(
    harness.envFilePath,
    makeExternalConfig(harness.company).replace(
      "CFDI_ENABLED=false",
      "CFDI_ENABLED=true",
    ) +
      "\nFACTURAMA_SECRET_FILE=" +
      pacSecretLink +
      "\n",
    { mode: 0o600 },
  );

  assert.equal(
    harness.run(baseArguments(harness, "provision", ["--dry-run"])),
    1,
  );
  assert.deepEqual(harness.events, []);
  assert.match(harness.stderr.text, /non-symlink regular file/u);
  assert.doesNotMatch(harness.stderr.text, new RegExp(SECRET_MARKER));
});

test("migrate and bootstrap always use the selected tenant database", (t) => {
  for (const command of ["migrate", "bootstrap"]) {
    const harness = createHarness();
    t.after(harness.cleanup);
    assert.equal(
      harness.run(baseArguments(harness, command, ["--apply"])),
      0,
      harness.stderr.text,
    );
    const composeCalls = harness.calls.filter(
      (call) => call.executable === "docker",
    );
    assert.ok(composeCalls.length > 0);
    for (const call of composeCalls) {
      assert.equal(call.options.env.POSTGRES_USER, "postgres");
      assert.equal(call.options.env.POSTGRES_DB, "tenant_company_north");
    }
    assert.ok(harness.events.includes("migrate"));
    if (command === "bootstrap")
      assert.ok(harness.events.includes("bootstrap"));
  }
});

test("two tenants derive different database and Compose project identities", (t) => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const north = createHarness({ manifest, company: manifest.companies[0] });
  const south = createHarness({
    manifest,
    company: manifest.companies[1],
    secretValues: {
      database: "south-db-password_123456",
      jwtAccess: "south-jwt-access-secret_123456",
      jwtRefresh: "south-jwt-refresh-secret_654321",
      objectStorage: {
        accessKeyId: "south-object-access-key_123456",
        secretAccessKey: "south-object-secret-key_654321",
      },
      bootstrapAdmin: "south-bootstrap-admin-password_123456",
    },
  });
  t.after(north.cleanup);
  t.after(south.cleanup);

  assert.equal(
    north.run(baseArguments(north, "migrate", ["--apply"])),
    0,
    north.stderr.text,
  );
  assert.equal(
    south.run(baseArguments(south, "migrate", ["--apply"])),
    0,
    south.stderr.text,
  );
  const northDockerCall = north.calls.find(
    (call) => call.executable === "docker",
  );
  const southDockerCall = south.calls.find(
    (call) => call.executable === "docker",
  );
  assert.ok(northDockerCall.args.includes("tenantctl-company-north"));
  assert.ok(southDockerCall.args.includes("tenantctl-company-south"));
  assert.equal(northDockerCall.options.env.POSTGRES_DB, "tenant_company_north");
  assert.equal(southDockerCall.options.env.POSTGRES_DB, "tenant_company_south");
  assert.notEqual(northDockerCall.args[1], southDockerCall.args[1]);
});

test("readiness failure blocks smoke and secret output remains suppressed", (t) => {
  const harness = createHarness({ failOperation: "readiness" });
  t.after(harness.cleanup);
  assert.equal(
    harness.run(baseArguments(harness, "provision", ["--apply"])),
    1,
  );
  assert.deepEqual(harness.events, [
    "resolver",
    "config",
    "caddy-validate",
    "config-generated",
    "pull",
    "migrate",
    "bootstrap",
    "up",
    "readiness",
  ]);
  assert.match(harness.stderr.text, /readiness failed.*backend/);
  assert.doesNotMatch(harness.stderr.text, new RegExp(SECRET_MARKER));
});

test("smoke failure is reported and does not trigger destructive rollback", (t) => {
  const harness = createHarness({ failOperation: "smoke" });
  t.after(harness.cleanup);
  assert.equal(
    harness.run(baseArguments(harness, "provision", ["--apply"])),
    1,
  );
  assert.deepEqual(harness.events, [
    "resolver",
    "config",
    "caddy-validate",
    "config-generated",
    "pull",
    "migrate",
    "bootstrap",
    "up",
    "readiness",
    "smoke",
  ]);
  assert.match(harness.stderr.text, /Production tenant smoke check failed/u);
  assert.doesNotMatch(harness.stderr.text, new RegExp(SECRET_MARKER));
  const dockerCalls = harness.calls.filter(
    (call) => call.executable === "docker",
  );
  assert.equal(
    dockerCalls.some(
      (call) => call.args.includes("down") || call.args.includes("volume"),
    ),
    false,
  );
});

test("bootstrap always aborts before bootstrap when migration fails", (t) => {
  const harness = createHarness({ failOperation: "migrate" });
  t.after(harness.cleanup);
  assert.equal(
    harness.run(baseArguments(harness, "bootstrap", ["--apply"])),
    1,
  );
  assert.deepEqual(harness.events, ["resolver", "config", "migrate"]);
  assert.match(harness.stderr.text, /Production migration failed/);
  assert.doesNotMatch(harness.stderr.text, new RegExp(SECRET_MARKER));
});

test("provision aborts after migration or bootstrap failure", (t) => {
  const migrationFailure = createHarness({ failOperation: "migrate" });
  t.after(migrationFailure.cleanup);
  assert.equal(
    migrationFailure.run(
      baseArguments(migrationFailure, "provision", ["--apply"]),
    ),
    1,
  );
  assert.deepEqual(migrationFailure.events, [
    "resolver",
    "config",
    "caddy-validate",
    "config-generated",
    "pull",
    "migrate",
  ]);
  assert.doesNotMatch(migrationFailure.stderr.text, new RegExp(SECRET_MARKER));

  const bootstrapFailure = createHarness({ failOperation: "bootstrap" });
  t.after(bootstrapFailure.cleanup);
  assert.equal(
    bootstrapFailure.run(
      baseArguments(bootstrapFailure, "provision", ["--apply"]),
    ),
    1,
  );
  assert.deepEqual(bootstrapFailure.events, [
    "resolver",
    "config",
    "caddy-validate",
    "config-generated",
    "pull",
    "migrate",
    "bootstrap",
  ]);
  assert.doesNotMatch(bootstrapFailure.stderr.text, new RegExp(SECRET_MARKER));
});

test("status reads Compose status and emits a structured allowlisted projection", (t) => {
  const harness = createHarness();
  t.after(harness.cleanup);
  assert.equal(harness.run(baseArguments(harness, "status")), 0);
  assert.deepEqual(harness.events, ["resolver", "config", "ps"]);
  const result = JSON.parse(harness.stdout.text);
  assert.equal(result.status, "succeeded");
  assert.match(result.runId, /^[a-f0-9-]{36}$/u);
  assert.equal(result.results[0].tenant, harness.company.slug);
  assert.equal(result.results[0].database, "tenant_company_north");
  assert.deepEqual(
    result.results[0].services.find((service) => service.service === "backend"),
    { service: "backend", state: "running", health: "healthy" },
  );
  assert.deepEqual(
    result.results[0].services.find(
      (service) => service.service === "postgres",
    ),
    { service: "postgres", state: "running", health: "healthy" },
  );
  assert.doesNotMatch(harness.stdout.text, new RegExp(SECRET_MARKER));
  assert.doesNotMatch(harness.stderr.text, new RegExp(SECRET_MARKER));
  assert.ok(
    harness.calls
      .filter((call) => call.executable === "docker")
      .every(
        (call) =>
          !call.args.includes("run") &&
          !call.args.includes("exec") &&
          !call.args.includes("psql"),
      ),
  );
});

test("batch status returns one correlated database-scoped result per active tenant", (t) => {
  const manifest = makeActiveManifest();
  const harness = createHarness({ manifest });
  t.after(harness.cleanup);
  assert.equal(
    harness.run(batchArguments(harness, "status")),
    0,
    harness.stdout.text + harness.stderr.text,
  );
  const result = lastJson(harness.stdout);
  assert.equal(result.status, "succeeded");
  assert.equal(result.results.length, 2);
  assert.ok(
    result.results.every(
      (row) => row.runId === result.runId && row.status === "succeeded",
    ),
  );
  assert.deepEqual(
    result.results.map((row) => [row.tenant, row.database]),
    [
      ["company-north", "tenant_company_north"],
      ["company-south", "tenant_company_south"],
    ],
  );
  assert.deepEqual(
    harness.tenantEvents.filter((event) => event.operation === "status"),
    [
      { tenant: "company-north", operation: "status" },
      { tenant: "company-south", operation: "status" },
    ],
  );
  assert.doesNotMatch(harness.stdout.text, new RegExp(SECRET_MARKER));
  assert.doesNotMatch(harness.stderr.text, new RegExp(SECRET_MARKER));
});

test("successful production canary gates a same-release batch migration", (t) => {
  const manifest = makeActiveManifest();
  const harness = createHarness({ manifest });
  t.after(harness.cleanup);
  const canaryTenant = manifest.companies[0];

  assert.equal(
    harness.run(canaryArguments(harness, canaryTenant, ["--apply"])),
    0,
    harness.stdout.text + harness.stderr.text,
  );
  const canaryResult = lastJson(harness.stdout);
  assert.equal(canaryResult.results[0].tenant, canaryTenant.slug);
  assert.equal(canaryResult.results[0].canary, true);
  const evidencePath = join(
    harness.configDirectory,
    ".tenantctl",
    "migration-canary.json",
  );
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  assert.equal(evidence.status, "passed");
  assert.equal(evidence.tenant, canaryTenant.slug);
  assert.equal(evidence.runId, canaryResult.runId);

  assert.equal(
    harness.run(batchArguments(harness, "migrate", ["--apply"])),
    0,
    harness.stderr.text,
  );
  const batch = lastJson(harness.stdout);
  assert.equal(batch.canary.tenant, canaryTenant.slug);
  assert.equal(batch.canary.runId, canaryResult.runId);
  assert.deepEqual(
    batch.results.map((row) => [row.tenant, row.status]),
    [
      ["company-north", "skipped"],
      ["company-south", "succeeded"],
    ],
  );
  assert.deepEqual(
    harness.tenantEvents.filter((event) => event.operation === "migrate"),
    [
      { tenant: "company-north", operation: "migrate" },
      { tenant: "company-south", operation: "migrate" },
    ],
  );
});

test("batch migration fails before mutation when a tenant release differs from the canary", (t) => {
  const manifest = makeActiveManifest();
  const harness = createHarness({ manifest });
  t.after(harness.cleanup);
  const canaryTenant = manifest.companies[0];

  assert.equal(
    harness.run(canaryArguments(harness, canaryTenant, ["--apply"])),
    0,
    harness.stdout.text + harness.stderr.text,
  );
  const southEnvFile = join(
    harness.configDirectory,
    "company-south",
    ".env.production",
  );
  writeFileSync(
    southEnvFile,
    readFileSync(southEnvFile, "utf8").replace(
      "BACKEND_IMAGE=registry.example/backend@sha256:" + "2".repeat(64),
      "BACKEND_IMAGE=registry.example/backend@sha256:" + "3".repeat(64),
    ),
    { mode: 0o600 },
  );

  assert.equal(harness.run(batchArguments(harness, "migrate", ["--apply"])), 1);
  const result = lastJson(harness.stdout);
  assert.equal(result.results[1].tenant, "company-south");
  assert.equal(result.results[1].status, "failed");
  assert.equal(result.results[1].errorCode, "canary_release_mismatch");
  assert.deepEqual(
    harness.tenantEvents.filter((event) => event.operation === "migrate"),
    [{ tenant: "company-north", operation: "migrate" }],
  );
  assert.doesNotMatch(harness.stdout.text, new RegExp(SECRET_MARKER));
  assert.doesNotMatch(harness.stderr.text, new RegExp(SECRET_MARKER));
});

test("failed canary blocks batch mutation and leaves every other tenant untouched", (t) => {
  const manifest = makeActiveManifest();
  const failures = {};
  const harness = createHarness({ manifest, failOperations: failures });
  t.after(harness.cleanup);
  const canaryTenant = manifest.companies[0];

  assert.equal(
    harness.run(canaryArguments(harness, canaryTenant, ["--apply"])),
    0,
    harness.stdout.text + harness.stderr.text,
  );
  const previousEvidence = JSON.parse(
    readFileSync(
      join(harness.configDirectory, ".tenantctl", "migration-canary.json"),
      "utf8",
    ),
  );
  assert.equal(previousEvidence.status, "passed");
  failures[canaryTenant.slug] = "migrate";

  assert.equal(
    harness.run(canaryArguments(harness, canaryTenant, ["--apply"])),
    1,
  );
  const evidence = JSON.parse(
    readFileSync(
      join(harness.configDirectory, ".tenantctl", "migration-canary.json"),
      "utf8",
    ),
  );
  assert.equal(evidence.status, "failed");
  const operationCountAfterCanary = harness.calls.length;

  assert.equal(harness.run(batchArguments(harness, "migrate", ["--apply"])), 1);
  const batch = lastJson(harness.stdout);
  assert.equal(batch.errorCode, "canary_required");
  assert.equal(batch.results[1].tenant, "company-south");
  assert.equal(batch.results[1].status, "skipped");
  assert.equal(harness.calls.length, operationCountAfterCanary);
  assert.deepEqual(
    harness.tenantEvents.filter((event) => event.tenant === "company-south"),
    [],
  );
  assert.doesNotMatch(harness.stdout.text, new RegExp(SECRET_MARKER));
  assert.doesNotMatch(harness.stderr.text, new RegExp(SECRET_MARKER));
});

test("partial migration preserves completed tenants and never auto-rolls back", (t) => {
  const manifest = makeActiveManifest(true);
  const harness = createHarness({
    manifest,
    failOperation: "migrate:company-east",
  });
  t.after(harness.cleanup);
  assert.equal(
    harness.run(canaryArguments(harness, manifest.companies[0], ["--apply"])),
    0,
    harness.stdout.text + harness.stderr.text,
  );

  assert.equal(harness.run(batchArguments(harness, "migrate", ["--apply"])), 1);
  const result = lastJson(harness.stdout);
  assert.equal(result.status, "failed");
  assert.deepEqual(
    result.results.map((row) => [row.tenant, row.status]),
    [
      ["company-north", "skipped"],
      ["company-south", "succeeded"],
      ["company-east", "failed"],
    ],
  );
  assert.deepEqual(
    harness.tenantEvents.filter((event) => event.operation === "migrate"),
    [
      { tenant: "company-north", operation: "migrate" },
      { tenant: "company-south", operation: "migrate" },
      { tenant: "company-east", operation: "migrate" },
    ],
  );
  assert.ok(
    harness.calls.every(
      (call) =>
        !call.args.includes("down") &&
        !call.args.includes("volume") &&
        !call.args.includes("restore-postgres-from-b2.sh"),
    ),
  );

  const continuingHarness = createHarness({
    manifest,
    failOperation: "migrate:company-south",
  });
  t.after(continuingHarness.cleanup);
  assert.equal(
    continuingHarness.run(
      canaryArguments(continuingHarness, manifest.companies[0], ["--apply"]),
    ),
    0,
    continuingHarness.stdout.text + continuingHarness.stderr.text,
  );
  assert.equal(
    continuingHarness.run(
      batchArguments(continuingHarness, "migrate", [
        "--apply",
        "--continue-on-error",
      ]),
    ),
    1,
  );
  const continued = lastJson(continuingHarness.stdout);
  assert.equal(continued.results[1].status, "failed");
  assert.equal(continued.results[2].status, "succeeded");
  assert.deepEqual(
    continuingHarness.tenantEvents
      .filter((event) => event.operation === "migrate")
      .map((event) => event.tenant),
    ["company-north", "company-south", "company-east"],
  );
});

test("batch migration applies each tenant timeout independently and stops at timeout", (t) => {
  const manifest = makeActiveManifest(true);
  const harness = createHarness({
    manifest,
    timeoutOperation: "migrate:company-south",
  });
  t.after(harness.cleanup);
  assert.equal(
    harness.run(canaryArguments(harness, manifest.companies[0], ["--apply"])),
    0,
    harness.stdout.text + harness.stderr.text,
  );

  assert.equal(
    harness.run(
      batchArguments(harness, "migrate", ["--timeout-seconds", "5", "--apply"]),
    ),
    1,
  );
  const result = lastJson(harness.stdout);
  assert.deepEqual(
    result.results.map((row) => [row.tenant, row.status]),
    [
      ["company-north", "skipped"],
      ["company-south", "timed_out"],
      ["company-east", "skipped"],
    ],
  );
  assert.equal(result.results[1].errorCode, "operation_timeout");
  const migrationCall = harness.calls.find(
    (call) =>
      call.executable === "docker" &&
      call.args.includes("run") &&
      call.args.includes("company-south-prod"),
  );
  assert.equal(migrationCall.options.timeout, 5000);
  assert.deepEqual(
    harness.tenantEvents
      .filter((event) => event.operation === "migrate")
      .map((event) => event.tenant),
    ["company-north", "company-south"],
  );
  assert.doesNotMatch(harness.stdout.text, new RegExp(SECRET_MARKER));
  assert.doesNotMatch(harness.stderr.text, new RegExp(SECRET_MARKER));
});

test("backup batch reports partial failure and only continues when opted in", (t) => {
  const manifest = makeActiveManifest();
  const harness = createHarness({
    manifest,
    failOperation: "backup:company-north",
  });
  t.after(harness.cleanup);
  assert.equal(harness.run(batchArguments(harness, "backup", ["--apply"])), 1);
  const result = lastJson(harness.stdout);
  assert.deepEqual(
    result.results.map((row) => [row.tenant, row.database, row.status]),
    [
      ["company-north", "tenant_company_north", "failed"],
      ["company-south", "tenant_company_south", "skipped"],
    ],
  );
  assert.deepEqual(
    harness.tenantEvents.filter((event) => event.operation === "backup"),
    [{ tenant: "company-north", operation: "backup" }],
  );

  const continuingHarness = createHarness({
    manifest,
    failOperation: "backup:company-north",
  });
  t.after(continuingHarness.cleanup);
  assert.equal(
    continuingHarness.run(
      batchArguments(continuingHarness, "backup", [
        "--apply",
        "--continue-on-error",
      ]),
    ),
    1,
  );
  const continued = lastJson(continuingHarness.stdout);
  assert.deepEqual(
    continued.results.map((row) => [row.tenant, row.status]),
    [
      ["company-north", "failed"],
      ["company-south", "succeeded"],
    ],
  );
  assert.deepEqual(
    continuingHarness.tenantEvents.filter(
      (event) => event.operation === "backup",
    ),
    [
      { tenant: "company-north", operation: "backup" },
      { tenant: "company-south", operation: "backup" },
    ],
  );
  assert.doesNotMatch(continuingHarness.stdout.text, new RegExp(SECRET_MARKER));
  assert.doesNotMatch(continuingHarness.stderr.text, new RegExp(SECRET_MARKER));
});

test("failed restore-drill identifies its isolated target and skips later tenants", (t) => {
  const manifest = makeActiveManifest();
  const harness = createHarness({
    manifest,
    failOperation: "restore-drill:company-north",
  });
  t.after(harness.cleanup);
  assert.equal(
    harness.run(batchArguments(harness, "restore-drill", ["--apply"])),
    1,
  );
  const result = lastJson(harness.stdout);
  const [failed, skipped] = result.results;
  assert.deepEqual(
    [failed.tenant, failed.database, failed.status, failed.backupNamespace],
    [
      "company-north",
      "tenant_company_north",
      "failed",
      "company-north-backups",
    ],
  );
  assert.notEqual(failed.restoreDatabase, failed.productionDatabase);
  assert.match(failed.restoreDatabase, /_restore_drill$/u);
  assert.equal(skipped.tenant, "company-south");
  assert.equal(skipped.database, "tenant_company_south");
  assert.equal(skipped.status, "skipped");
  assert.deepEqual(
    harness.tenantEvents.filter((event) => event.operation === "restore-drill"),
    [{ tenant: "company-north", operation: "restore-drill" }],
  );
  assert.doesNotMatch(harness.stdout.text, new RegExp(SECRET_MARKER));
  assert.doesNotMatch(harness.stderr.text, new RegExp(SECRET_MARKER));
});

test("backup and restore-drill use isolated tenant namespaces and temporary databases", (t) => {
  const manifest = makeActiveManifest();
  const backupHarness = createHarness({ manifest });
  t.after(backupHarness.cleanup);
  assert.equal(
    backupHarness.run(batchArguments(backupHarness, "backup", ["--apply"])),
    0,
    backupHarness.stdout.text + backupHarness.stderr.text,
  );
  const backupResult = lastJson(backupHarness.stdout);
  assert.deepEqual(
    backupResult.results.map((row) => [
      row.tenant,
      row.database,
      row.backupNamespace,
    ]),
    [
      ["company-north", "tenant_company_north", "company-north-backups"],
      ["company-south", "tenant_company_south", "company-south-backups"],
    ],
  );
  assert.ok(backupResult.results.every((row) => row.status === "succeeded"));
  assert.ok(
    backupResult.results.every((row) =>
      BACKUP_KEY_PATTERN_FOR_TEST.test(row.backupKey),
    ),
  );
  assert.deepEqual(
    backupHarness.tenantEvents.filter((event) => event.operation === "backup"),
    [
      { tenant: "company-north", operation: "backup" },
      { tenant: "company-south", operation: "backup" },
    ],
  );
  assert.doesNotMatch(backupHarness.stdout.text, new RegExp(SECRET_MARKER));

  const restoreHarness = createHarness({ manifest });
  t.after(restoreHarness.cleanup);
  assert.equal(
    restoreHarness.run(
      batchArguments(restoreHarness, "restore-drill", ["--apply"]),
    ),
    0,
    restoreHarness.stderr.text,
  );
  const restoreResult = lastJson(restoreHarness.stdout);
  assert.ok(
    restoreResult.results.every(
      (row) =>
        row.status === "succeeded" &&
        row.restoreDatabase !== row.productionDatabase &&
        row.restoreDatabase.endsWith("_restore_drill"),
    ),
  );
  assert.equal(
    new Set(restoreResult.results.map((row) => row.restoreDatabase)).size,
    2,
  );
  assert.deepEqual(
    restoreHarness.tenantEvents.filter(
      (event) => event.operation === "restore-drill",
    ),
    [
      { tenant: "company-north", operation: "restore-drill" },
      { tenant: "company-south", operation: "restore-drill" },
    ],
  );
  assert.doesNotMatch(restoreHarness.stdout.text, new RegExp(SECRET_MARKER));
});

test("tenant timeout is enforced and reported without exposing child output", (t) => {
  const harness = createHarness({ timeoutOperation: "migrate" });
  t.after(harness.cleanup);
  assert.equal(
    harness.run(
      baseArguments(harness, "migrate", ["--timeout-seconds", "5", "--apply"]),
    ),
    1,
  );
  const result = lastJson(harness.stdout);
  assert.equal(result.results[0].status, "timed_out");
  assert.equal(result.results[0].errorCode, "operation_timeout");
  const migrationCall = harness.calls.find(
    (call) => call.executable === "docker" && call.args.includes("run"),
  );
  assert.equal(migrationCall.options.timeout, 5000);
  assert.doesNotMatch(harness.stdout.text, new RegExp(SECRET_MARKER));
  assert.doesNotMatch(harness.stderr.text, new RegExp(SECRET_MARKER));
});

test("resolver failure output is suppressed and prevents Docker operations", (t) => {
  const harness = createHarness({ failResolver: true });
  t.after(harness.cleanup);
  assert.equal(harness.run(baseArguments(harness, "validate")), 1);
  assert.deepEqual(harness.events, ["resolver"]);
  assert.match(harness.stderr.text, /External secret resolution failed/);
  assert.doesNotMatch(harness.stdout.text, new RegExp(SECRET_MARKER));
  assert.doesNotMatch(harness.stderr.text, new RegExp(SECRET_MARKER));
});

test("resolver responses must be complete and their output is never echoed", (t) => {
  const harness = createHarness({ resolverOutput: SECRET_MARKER });
  t.after(harness.cleanup);
  assert.equal(harness.run(baseArguments(harness, "validate")), 1);
  assert.deepEqual(harness.events, ["resolver"]);
  assert.match(harness.stderr.text, /invalid JSON/);
  assert.doesNotMatch(harness.stderr.text, new RegExp(SECRET_MARKER));
});

test("database secrets incompatible with Compose URL construction fail closed", (t) => {
  const secretValues = {
    ...RESOLVED_SECRETS,
    database: "unsafe@database-password",
  };
  const harness = createHarness({ secretValues });
  t.after(harness.cleanup);
  assert.equal(harness.run(baseArguments(harness, "migrate", ["--apply"])), 1);
  assert.deepEqual(harness.events, ["resolver"]);
  const result = lastJson(harness.stdout);
  assert.equal(result.results[0].status, "failed");
  assert.equal(result.results[0].errorCode, "operation_failed");
  assert.doesNotMatch(harness.stdout.text, /unsafe@database-password/);
  assert.doesNotMatch(harness.stderr.text, /unsafe@database-password/);
});

test("external config rejects raw secret fields before invoking the resolver", (t) => {
  const harness = createHarness();
  t.after(harness.cleanup);
  writeFileSync(
    harness.envFilePath,
    makeExternalConfig(harness.company) +
      "\nJWT_ACCESS_SECRET=" +
      SECRET_MARKER +
      "\n",
    { mode: 0o600 },
  );
  assert.equal(harness.run(baseArguments(harness, "validate")), 1);
  assert.deepEqual(harness.events, []);
  assert.match(harness.stderr.text, /Secret values must be supplied/);
  assert.doesNotMatch(harness.stderr.text, new RegExp(SECRET_MARKER));
});

test("external config is never accepted from inside the repository", (t) => {
  const harness = createHarness();
  t.after(harness.cleanup);
  const args = baseArguments(harness, "validate");
  args[args.indexOf("--env-file") + 1] = resolve(
    REPOSITORY_ROOT,
    ".env.production.example",
  );
  assert.equal(harness.run(args), 1);
  assert.deepEqual(harness.events, []);
  assert.match(harness.stderr.text, /outside the repository/);
});

test("relative company map paths fail before external secret resolution", (t) => {
  const harness = createHarness();
  t.after(harness.cleanup);
  writeFileSync(
    harness.envFilePath,
    makeExternalConfig(harness.company).replace(
      "MAP_DATA_DIR=/srv/pollos/maps",
      "MAP_DATA_DIR=relative/maps",
    ) + "\n",
    { mode: 0o600 },
  );
  assert.equal(harness.run(baseArguments(harness, "validate")), 1);
  assert.deepEqual(harness.events, []);
  assert.match(harness.stderr.text, /absolute company-local host path/);
});

test("Compose preflight failure is generic and prevents any mutation", (t) => {
  const harness = createHarness({ failOperation: "config" });
  t.after(harness.cleanup);
  assert.equal(
    harness.run(baseArguments(harness, "provision", ["--apply"])),
    1,
  );
  assert.deepEqual(harness.events, ["resolver", "config"]);
  assert.match(harness.stderr.text, /Production Compose preflight failed/);
  assert.doesNotMatch(harness.stderr.text, new RegExp(SECRET_MARKER));
});

test("missing manifest references and target mismatch fail closed", (t) => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  delete manifest.companies[0].secretRefs.database;
  const missingRefHarness = createHarness({ manifest });
  t.after(missingRefHarness.cleanup);
  assert.equal(
    missingRefHarness.run(baseArguments(missingRefHarness, "validate")),
    1,
  );
  assert.deepEqual(missingRefHarness.events, []);
  assert.match(missingRefHarness.stderr.text, /secretRefs.database/);

  const mismatchHarness = createHarness();
  t.after(mismatchHarness.cleanup);
  writeFileSync(
    mismatchHarness.envFilePath,
    makeExternalConfig(mismatchHarness.company).replace(
      mismatchHarness.company.deploymentHostRef,
      "host://production/another-company",
    ) + "\n",
    { mode: 0o600 },
  );
  assert.equal(
    mismatchHarness.run(baseArguments(mismatchHarness, "validate")),
    1,
  );
  assert.deepEqual(mismatchHarness.events, []);
  assert.match(
    mismatchHarness.stderr.text,
    /must match the selected manifest company/,
  );
});

test("mutable images and company-domain mismatch stop before any mutation", (t) => {
  const mutableImageHarness = createHarness({
    mutateComposeConfig(config) {
      config.services.backend.image = "registry.example/backend:latest";
      return config;
    },
  });
  t.after(mutableImageHarness.cleanup);
  assert.equal(
    mutableImageHarness.run(
      baseArguments(mutableImageHarness, "provision", ["--apply"]),
    ),
    1,
  );
  assert.deepEqual(mutableImageHarness.events, ["resolver", "config"]);
  assert.match(mutableImageHarness.stderr.text, /pinned by sha256 digest/);
  assert.doesNotMatch(mutableImageHarness.stderr.text, /latest/);

  const domainHarness = createHarness({
    mutateComposeConfig(config) {
      config.services.backend.environment.CORS_ORIGIN = "https://wrong.example";
      return config;
    },
  });
  t.after(domainHarness.cleanup);
  assert.equal(
    domainHarness.run(baseArguments(domainHarness, "provision", ["--apply"])),
    1,
  );
  assert.deepEqual(domainHarness.events, ["resolver", "config"]);
  assert.match(domainHarness.stderr.text, /CORS_ORIGIN/);
  assert.doesNotMatch(domainHarness.stderr.text, /wrong.example/);
});

test("production Compose contract remains the source for migration, bootstrap, and health", () => {
  const compose = readFileSync(
    resolve(REPOSITORY_ROOT, "docker-compose.production.yml"),
    "utf8",
  );
  assert.match(compose, /profiles: \["migration"\]/);
  assert.match(compose, /command: npm run migrate:deploy/);
  assert.match(compose, /command: npm run bootstrap:production/);
  assert.match(
    compose,
    /DATABASE_URL: postgresql:\/\/\$\{POSTGRES_USER:-postgres\}:\$\{POSTGRES_PASSWORD:\?POSTGRES_PASSWORD is required\}@postgres:5432/,
  );
  assert.match(compose, /condition: service_healthy/);
  assert.match(compose, /healthcheck:/);
  assert.doesNotMatch(compose, /^\s+build:/m);
});

test("help is read-only and advertises the tenant operations", (t) => {
  const harness = createHarness();
  t.after(harness.cleanup);
  assert.equal(harness.run(["--help"]), 0);
  assert.match(
    harness.stdout.text,
    /list, validate, provision, status, migrate, backup, restore-drill, bootstrap/,
  );
  assert.match(harness.stdout.text, /--reason <ticket-id> and --confirm/u);
  assert.match(harness.stdout.text, /TENANTCTL_OPERATOR/u);
  assert.deepEqual(harness.events, []);
});

test("tenantctl shell entrypoint is executable and delegates to the Node CLI", () => {
  const launcherPath = resolve(
    REPOSITORY_ROOT,
    "scripts/multi-company/tenantctl",
  );
  const launcher = readFileSync(launcherPath, "utf8");
  assert.notEqual(statSync(launcherPath).mode & 0o111, 0);
  assert.match(launcher, /^#!\/bin\/sh/u);
  assert.match(
    launcher,
    /exec node "\$SCRIPT_DIRECTORY\/tenantctl\.mjs" "\$@"/u,
  );
});
