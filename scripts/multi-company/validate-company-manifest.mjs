#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const ALLOWED_COMPANY_FIELDS = new Set([
  ...REQUIRED_COMPANY_FIELDS,
  "secretRefs",
]);
const ALLOWED_SECRET_REF_FIELDS = new Set([
  "database",
  "jwtAccess",
  "jwtRefresh",
  "objectStorage",
  "backup",
  "pac",
  "csd",
  "tls",
  "bootstrapAdmin",
]);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?![\s\S])/;
const BACKUP_BUCKET_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])(?![\s\S])/;
const HOSTNAME_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?![\s\S])/;
const DEPLOYMENT_HOST_REF_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}(?![\s\S])/;
const SECRET_REFERENCE_PATTERN =
  /^(?:vault|docker-secret|aws-sm|gcp-sm|azure-kv|op):\/\/[A-Za-z0-9][A-Za-z0-9._/-]{0,478}(?![\s\S])/;

const ENVIRONMENTS = new Set(["development", "staging", "production"]);
const STATUSES = new Set([
  "planned",
  "provisioning",
  "active",
  "suspended",
  "decommissioned",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addUnique(value, seen, fieldPath, errors) {
  if (seen.has(value)) {
    errors.push(`${fieldPath} must be unique within the manifest`);
    return;
  }
  seen.add(value);
}

function readRequiredString(company, index, field, errors) {
  const fieldPath = `companies[${index}].${field}`;
  if (!Object.hasOwn(company, field)) {
    errors.push(`${fieldPath} is required`);
    return undefined;
  }

  const value = company[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${fieldPath} must be a non-empty string`);
    return undefined;
  }
  if (value.trim() !== value) {
    errors.push(`${fieldPath} must not have leading or trailing whitespace`);
    return undefined;
  }

  return value;
}

/**
 * Validate a non-secret inventory of company deployment targets.
 * Error messages contain field paths only and never echo manifest values.
 */
export function validateCompanyManifest(manifest) {
  const errors = [];
  if (!isRecord(manifest)) return ["manifest must be an object"];

  if (Object.keys(manifest).some((field) => field !== "companies")) {
    errors.push("manifest contains unsupported fields");
  }
  if (!Object.hasOwn(manifest, "companies")) {
    errors.push("manifest.companies is required");
    return errors;
  }
  if (!Array.isArray(manifest.companies)) {
    errors.push("manifest.companies must be an array");
    return errors;
  }
  if (manifest.companies.length === 0) {
    errors.push("manifest.companies must contain at least one company");
  }

  const seenSlugs = new Set();
  const seenBackupBuckets = new Set();
  const seenHosts = new Set();
  const seenDeploymentTargets = new Set();
  const seenSecretRefs = new Set();

  manifest.companies.forEach((company, index) => {
    const companyPath = `companies[${index}]`;
    if (!isRecord(company)) {
      errors.push(`${companyPath} must be an object`);
      return;
    }

    if (
      Object.keys(company).some((field) => !ALLOWED_COMPANY_FIELDS.has(field))
    ) {
      errors.push(`${companyPath} contains unsupported fields`);
    }

    const slug = readRequiredString(company, index, "slug", errors);
    if (slug !== undefined) {
      if (slug.length > 63 || !SLUG_PATTERN.test(slug)) {
        errors.push(`${companyPath}.slug must be a lowercase DNS-safe slug`);
      } else {
        addUnique(slug, seenSlugs, `${companyPath}.slug`, errors);
      }
    }

    const backupBucket = readRequiredString(
      company,
      index,
      "backupBucket",
      errors,
    );
    if (backupBucket !== undefined) {
      if (
        backupBucket.length > 63 ||
        !BACKUP_BUCKET_PATTERN.test(backupBucket)
      ) {
        errors.push(
          `${companyPath}.backupBucket must be a lowercase DNS-safe bucket name`,
        );
      } else {
        addUnique(
          backupBucket,
          seenBackupBuckets,
          `${companyPath}.backupBucket`,
          errors,
        );
      }
    }

    const displayName = readRequiredString(
      company,
      index,
      "displayName",
      errors,
    );
    if (displayName !== undefined) {
      if (
        displayName.length > 120 ||
        /[\u0000-\u001f\u007f]/u.test(displayName)
      ) {
        errors.push(`${companyPath}.displayName has an invalid format`);
      }
    }

    for (const field of ["erpHost", "objectStorageHost"]) {
      const host = readRequiredString(company, index, field, errors);
      if (host === undefined) continue;
      if (host.length > 253 || !HOSTNAME_PATTERN.test(host)) {
        errors.push(
          `${companyPath}.${field} must be a lowercase DNS hostname without scheme, port, or path`,
        );
      } else {
        addUnique(host, seenHosts, `${companyPath}.${field}`, errors);
      }
    }

    const environment = readRequiredString(
      company,
      index,
      "environment",
      errors,
    );
    if (environment !== undefined && !ENVIRONMENTS.has(environment)) {
      errors.push(`${companyPath}.environment is unsupported`);
    }

    const deploymentHostRef = readRequiredString(
      company,
      index,
      "deploymentHostRef",
      errors,
    );
    if (deploymentHostRef !== undefined) {
      if (!DEPLOYMENT_HOST_REF_PATTERN.test(deploymentHostRef)) {
        errors.push(`${companyPath}.deploymentHostRef has an invalid format`);
      } else {
        addUnique(
          deploymentHostRef,
          seenDeploymentTargets,
          `${companyPath}.deploymentHostRef`,
          errors,
        );
      }
    }

    const status = readRequiredString(company, index, "status", errors);
    if (status !== undefined && !STATUSES.has(status)) {
      errors.push(`${companyPath}.status is unsupported`);
    }

    if (!Object.hasOwn(company, "secretRefs")) return;
    const secretRefs = company.secretRefs;
    if (!isRecord(secretRefs)) {
      errors.push(`${companyPath}.secretRefs must be an object`);
      return;
    }
    if (Object.keys(secretRefs).length === 0) {
      errors.push(`${companyPath}.secretRefs must not be empty when provided`);
    }
    if (
      Object.keys(secretRefs).some(
        (field) => !ALLOWED_SECRET_REF_FIELDS.has(field),
      )
    ) {
      errors.push(`${companyPath}.secretRefs contains unsupported fields`);
    }

    for (const [field, reference] of Object.entries(secretRefs)) {
      const fieldPath = `${companyPath}.secretRefs.${field}`;
      if (
        typeof reference !== "string" ||
        reference.trim() !== reference ||
        !SECRET_REFERENCE_PATTERN.test(reference)
      ) {
        errors.push(
          `${fieldPath} must be an external secret reference, never a secret value`,
        );
        continue;
      }
      addUnique(reference, seenSecretRefs, fieldPath, errors);
    }
  });

  return errors;
}

function runCli() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error(
      "Usage: node scripts/multi-company/validate-company-manifest.mjs <manifest.json>",
    );
    process.exitCode = 2;
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), manifestPath), "utf8"),
    );
  } catch {
    console.error("Manifest must be readable JSON; contents were not displayed.");
    process.exitCode = 1;
    return;
  }

  const errors = validateCompanyManifest(manifest);
  if (errors.length > 0) {
    console.error(
      `Company manifest validation failed:\n- ${errors.join("\n- ")}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Company manifest valid: ${manifest.companies.length} companies.`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runCli();
}
