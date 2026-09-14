import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { validateCompanyManifest } from "./validate-company-manifest.mjs";

const repositoryRoot = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const examplePath = resolve(
  repositoryRoot,
  "docker/multi-company/tenant.example.json",
);
const schemaPath = resolve(
  repositoryRoot,
  "docker/multi-company/company-manifest.schema.json",
);

const REQUIRED_COMPANY_FIELDS = [
  "slug",
  "backupBucket",
  "displayName",
  "erpHost",
  "objectStorageHost",
  "environment",
  "deploymentHostRef",
  "status",
];

function company(slug = "company-north") {
  return {
    slug,
    backupBucket: `${slug}-backups`,
    displayName: "Company North",
    erpHost: `erp.${slug}.example`,
    objectStorageHost: `objects.${slug}.example`,
    environment: "production",
    deploymentHostRef: `host://production/${slug}`,
    status: "planned",
  };
}

function manifest(companies = [company()]) {
  return { companies };
}

test("accepts the checked-in two-company example", () => {
  const example = JSON.parse(readFileSync(examplePath, "utf8"));

  assert.equal(example.companies.length, 2);
  assert.deepEqual(validateCompanyManifest(example), []);
});

test("schema requires the deployment fields and rejects unrecognized fields", () => {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const companySchema = schema.$defs.company;

  assert.deepEqual(companySchema.required, REQUIRED_COMPANY_FIELDS);
  assert.equal(companySchema.additionalProperties, false);
  assert.equal(schema.additionalProperties, false);
  assert.equal(companySchema.properties.secretRefs.additionalProperties, false);
  assert.equal(Object.hasOwn(companySchema.properties, "tenantId"), false);
  assert.equal(Object.hasOwn(companySchema.properties, "companyId"), false);
  assert.equal(
    new RegExp(companySchema.properties.slug.pattern).test("company-north"),
    true,
  );
  assert.equal(
    new RegExp(companySchema.properties.slug.pattern).test("company-north\n"),
    false,
  );
  assert.equal(
    new RegExp(companySchema.properties.backupBucket.pattern).test(
      "company-north-backups",
    ),
    true,
  );
  assert.equal(
    new RegExp(schema.$defs.hostname.pattern).test("erp.north.example"),
    true,
  );
  assert.equal(
    new RegExp(schema.$defs.hostname.pattern).test("erp.north.example\n"),
    false,
  );
});

test("rejects an invalid or unstable slug", () => {
  for (const slug of ["Company North", "company-north\n"]) {
    const invalid = company(slug);

    assert.ok(
      validateCompanyManifest(manifest([invalid])).some((error) =>
        error.includes("companies[0].slug"),
      ),
      `slug ${JSON.stringify(slug)} should be rejected`,
    );
  }
});

test("rejects domains that are not lowercase DNS hostnames", () => {
  for (const [field, value] of [
    ["erpHost", "https://erp.company.example"],
    ["objectStorageHost", "objects..company.example"],
    ["erpHost", "erp.company.example\n"],
  ]) {
    const invalid = company();
    invalid[field] = value;

    assert.ok(
      validateCompanyManifest(manifest([invalid])).some((error) =>
        error.includes(`companies[0].${field}`),
      ),
      `${field} should reject an invalid hostname`,
    );
  }
});

test("rejects duplicate slugs, service hosts, deployment targets, backup buckets, and secret references", () => {
  for (const field of [
    "slug",
    "backupBucket",
    "erpHost",
    "objectStorageHost",
    "deploymentHostRef",
  ]) {
    const first = company("company-north");
    const second = company("company-south");
    second[field] = first[field];

    assert.ok(
      validateCompanyManifest(manifest([first, second])).some((error) =>
        error.includes("must be unique within the manifest"),
      ),
      `${field} should be unique`,
    );
  }

  const first = company("company-north");
  const second = company("company-south");
  first.secretRefs = { database: "vault://production/shared/database" };
  second.secretRefs = { database: "vault://production/shared/database" };

  assert.ok(
    validateCompanyManifest(manifest([first, second])).some((error) =>
      error.includes("secretRefs.database must be unique"),
    ),
  );
});

test("rejects backup bucket names that cannot form isolated S3 buckets", () => {
  for (const bucket of ["ab", "Company-Backups", "bad_bucket", "x".repeat(64)]) {
    const invalid = company();
    invalid.backupBucket = bucket;

    assert.ok(
      validateCompanyManifest(manifest([invalid])).some((error) =>
        error.includes("companies[0].backupBucket"),
      ),
      `backup bucket ${JSON.stringify(bucket)} should be rejected`,
    );
  }
});

test("rejects every missing required company field", () => {
  for (const field of REQUIRED_COMPANY_FIELDS) {
    const incomplete = company();
    delete incomplete[field];

    assert.ok(
      validateCompanyManifest(manifest([incomplete])).some((error) =>
        error === `companies[0].${field} is required`,
      ),
      `${field} should be required`,
    );
  }

  assert.ok(
    validateCompanyManifest({}).includes("manifest.companies is required"),
  );
});

test("rejects accidental secret values and does not echo them in errors", () => {
  const invalid = company();
  const accidentalValue = "not-a-real-secret-placeholder";
  invalid.password = accidentalValue;

  const errors = validateCompanyManifest(manifest([invalid]));
  assert.ok(errors.some((error) => error.includes("unsupported fields")));
  assert.equal(errors.join(" ").includes(accidentalValue), false);

  const invalidReference = company();
  invalidReference.secretRefs = { database: "raw-secret-placeholder" };
  assert.ok(
    validateCompanyManifest(manifest([invalidReference])).some((error) =>
      error.includes("must be an external secret reference"),
    ),
  );

  const newlineReference = company();
  newlineReference.secretRefs = {
    database: "vault://production/company/database\n",
  };
  assert.ok(
    validateCompanyManifest(manifest([newlineReference])).some((error) =>
      error.includes("must be an external secret reference"),
    ),
  );
});
