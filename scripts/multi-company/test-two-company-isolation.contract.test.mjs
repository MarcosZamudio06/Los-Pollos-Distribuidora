import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const harness = readFileSync(
  resolve(
    repositoryRoot,
    "scripts/multi-company/test-two-company-isolation.sh",
  ),
  "utf8",
);
const integration = readFileSync(
  resolve(
    repositoryRoot,
    "backend/test/multi-company-isolation.mte-integration.ts",
  ),
  "utf8",
);
const qualityGate = readFileSync(
  resolve(repositoryRoot, ".github/workflows/quality-gate.yml"),
  "utf8",
);

test("persistent Compose run services retain their DNS aliases", () => {
  const startService = harness.match(/start_service\(\) \{[\s\S]*?\n\}/u)?.[0];
  assert.ok(startService, "persistent service launcher must remain explicit");
  assert.match(startService, /\brun\s+\\?\s*--use-aliases\s+\\?\s*--detach/u);
});

test("CEDIS fixture identity comes from the existing SEED_CEDIS_CODE contract", () => {
  assert.match(
    integration,
    /describe\('MTE-007 real two-company data-plane isolation'/u,
  );
  assert.ok(integration.includes("${prefix}_SEED_CEDIS_CODE"));
  assert.ok(integration.includes("${prefix}_SEED_LOCATION_CODE"));
  assert.ok(
    harness.includes(
      'export MTE_TENANT_A_SEED_CEDIS_CODE="$SEED_CEDIS_CODE_A"',
    ),
  );
  assert.ok(
    harness.includes(
      'export MTE_TENANT_B_SEED_CEDIS_CODE="$SEED_CEDIS_CODE_B"',
    ),
  );
  assert.ok(!integration.includes("${prefix}_CEDIS_CODE`"));

  const fixtureSetup = integration.match(
    /async function createAOnlyFixtures[\s\S]*?\n\}/u,
  )?.[0];
  assert.ok(fixtureSetup);
  assert.ok(fixtureSetup.includes("cedis.id !== admin.cedisLocationId"));
  assert.ok(fixtureSetup.includes("branch.id !== admin.operationalLocationId"));
  assert.ok(!fixtureSetup.includes("admin.id !=="));
});

test("both backend processes use and report the same immutable image identity", () => {
  assert.match(harness, /BACKEND_IMAGE_DIGEST=.*docker image inspect/u);
  assert.match(harness, /BACKEND_A_IMAGE_ID=.*docker inspect/u);
  assert.match(harness, /BACKEND_B_IMAGE_ID=.*docker inspect/u);
  assert.match(harness, /BACKEND_A_IMAGE_ID[\s\S]*BACKEND_B_IMAGE_ID/u);
});

test("the MTE integration runner uses npm rather than adding a pnpm CI lane", () => {
  assert.doesNotMatch(harness, /\bpnpm\b/u);
  assert.match(harness, /npm\s+--prefix\s+[^\n]*\s+exec/u);
  assert.match(
    qualityGate,
    /npm --prefix backend exec -- prisma generate --schema "\$GITHUB_WORKSPACE\/backend\/prisma\/schema\.prisma"/u,
  );
});
