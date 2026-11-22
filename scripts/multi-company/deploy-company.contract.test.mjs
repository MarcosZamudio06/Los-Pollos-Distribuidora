import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const workflow = readFileSync(
  resolve(repositoryRoot, ".github/workflows/deploy-company.yml"),
  "utf8",
);
const remoteScript = readFileSync(
  resolve(repositoryRoot, "scripts/multi-company/deploy-company-remote.sh"),
  "utf8",
);

test("deployment requires a protected per-company GitHub Environment", () => {
  assert.match(
    workflow,
    /environment:\s*\n\s+name:\s+company-\$\{\{ inputs\.company_slug \}\}/u,
  );
  assert.match(workflow, /required_reviewers/u);
  assert.match(
    workflow,
    /group:\s+deploy-company-\$\{\{ inputs\.company_slug \}\}/u,
  );
  assert.match(workflow, /cancel-in-progress:\s+false/u);
});

test("deployment accepts immutable candidate and prior digests only", () => {
  assert.match(workflow, /@sha256:\[a-f0-9\]\{64\}/u);
  assert.match(workflow, /previous_schema_compatible/u);
  assert.match(
    remoteScript,
    /requested rollback digest is not the currently recorded tenant release/u,
  );
  assert.match(
    remoteScript,
    /Candidate and rollback digests must refer to the same image repositories/u,
  );
});

test("candidate canary is mandatory and rollback is limited to one company project", () => {
  assert.match(remoteScript, /run --rm --no-deps migrate/u);
  assert.match(remoteScript, /api\/health\/ready/u);
  assert.match(remoteScript, /project_name="tenant-\$\{company_slug\}"/u);
  assert.match(remoteScript, /ROLLED_BACK company=/u);
  assert.match(
    remoteScript,
    /up -d --no-build --pull never --wait backend frontend/u,
  );
  assert.doesNotMatch(remoteScript, /docker\s+build/u);
  assert.doesNotMatch(workflow, /docker\s+build/u);
});

const deployStep = workflow.slice(
  workflow.indexOf(
    "- name: Run tenant-scoped candidate canary and digest deployment",
  ),
);
const deployBody = deployStep
  .slice(deployStep.indexOf("          set -Eeuo pipefail"))
  .split("\n")
  .map((line) => line.replace(/^          /u, ""))
  .join("\n");

function simulateDeployment(overrides = {}, failLogin = false) {
  const temporary = mkdtempSync(resolve(tmpdir(), "tenant-ssh-contract-"));
  try {
    return spawnSync(
      "bash",
      [
        "-c",
        `
      ssh() {
        printf '%s\\0' "$@" >> "$RUNNER_TEMP/ssh-arguments"
        if [[ "$*" == *'docker login'* ]]; then
          local token
          token="$(cat)"
          [[ "$token" == "$TENANT_REGISTRY_TOKEN" ]] || return 31
          [[ "$FAIL_LOGIN" == false ]] || return 32
        else
          cat >/dev/null
        fi
      }
      ${deployBody}
    `,
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          RUNNER_TEMP: temporary,
          COMPANY_SLUG: "company-a",
          TENANT_DEPLOY_HOST: "deploy.example.test",
          TENANT_DEPLOY_USER: "deployer",
          TENANT_DEPLOY_ROOT: "/srv/tenants",
          TENANT_DEPLOY_SSH_KEY: "synthetic-ssh-fixture",
          TENANT_DEPLOY_KNOWN_HOSTS: "synthetic-known-host-fixture",
          TENANT_REGISTRY_USER: "registry-user_1.test",
          TENANT_REGISTRY_TOKEN: "synthetic-registry-fixture",
          BACKEND_DIGEST: "backend@sha256:candidate",
          FRONTEND_DIGEST: "frontend@sha256:candidate",
          PREVIOUS_BACKEND_DIGEST: "backend@sha256:previous",
          PREVIOUS_FRONTEND_DIGEST: "frontend@sha256:previous",
          PREVIOUS_SCHEMA_COMPATIBLE: "true",
          CHANGE_REFERENCE: "fixture change reference",
          FAIL_LOGIN: String(failLogin),
          ...overrides,
        },
      },
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

test("SSH expands the validated registry user locally and preserves remote arguments", () => {
  // Capture only synthetic invocation arguments; no network or remote command runs.
  const temporary = mkdtempSync(resolve(tmpdir(), "tenant-ssh-arguments-"));
  try {
    const result = simulateDeployment({ RUNNER_TEMP: temporary });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    const calls = readFileSync(
      resolve(temporary, "ssh-arguments"),
      "utf8",
    ).split("\0");
    assert.deepEqual(calls, [
      "-i",
      `${temporary}/tenant-ssh/id_ed25519`,
      "-o",
      "IdentitiesOnly=yes",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      `UserKnownHostsFile=${temporary}/tenant-ssh/known_hosts`,
      "deployer@deploy.example.test",
      "docker",
      "login",
      "ghcr.io",
      "--username",
      "registry-user_1.test",
      "--password-stdin",
      "-i",
      `${temporary}/tenant-ssh/id_ed25519`,
      "-o",
      "IdentitiesOnly=yes",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      `UserKnownHostsFile=${temporary}/tenant-ssh/known_hosts`,
      "deployer@deploy.example.test",
      "bash",
      "-s",
      "--",
      "company-a",
      "/srv/tenants",
      "backend@sha256:candidate",
      "frontend@sha256:candidate",
      "backend@sha256:previous",
      "frontend@sha256:previous",
      "true",
      "fixture change reference",
      "",
    ]);
    assert.ok(!calls.join(" ").includes("synthetic-registry-fixture"));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("SSH rejects unsafe local expansion and stops if registry login fails", () => {
  const validation = deployBody.match(
    /^\[\[ "\$TENANT_REGISTRY_USER" =~ .*$/mu,
  );
  assert.ok(validation);
  const unsafe = spawnSync("bash", ["-c", validation[0]], {
    env: { PATH: process.env.PATH, TENANT_REGISTRY_USER: "bad'$(exit 99)" },
  });
  assert.equal(unsafe.status, 1);
  const failure = simulateDeployment({}, true);
  assert.equal(failure.status, 32);
});
