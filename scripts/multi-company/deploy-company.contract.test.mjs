import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
