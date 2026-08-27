#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROHIBITED_CERTIFICATE_EXTENSIONS = new Set([
  ".cer",
  ".der",
  ".key",
  ".p12",
  ".pfx",
  ".p8",
]);
const PRIVATE_KEY_MARKER =
  /-----BEGIN (?:ENCRYPTED |RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/;
const FISCAL_XML_MARKER = /<(?:\w+:)?(?:Comprobante|TimbreFiscalDigital)\b/i;
const SYNTHETIC_XML_MARKER = /<!--\s*cfdi-fixture:synthetic\s*-->/i;
const ALLOWED_SYNTHETIC_RFCS = new Set([
  "AAA010101AAA",
  "EKU9003173C9",
  "XAXX010101000",
  "XEXX010101000",
]);

export function validateFiscalAsset(path, content = "") {
  const normalized = path.replaceAll("\\", "/");
  const extension = extname(normalized).toLowerCase();
  const errors = [];

  if (PROHIBITED_CERTIFICATE_EXTENSIONS.has(extension)) {
    errors.push(
      `${normalized}: fiscal certificate/private-key files must not be versioned`,
    );
  }
  if (PRIVATE_KEY_MARKER.test(content)) {
    errors.push(`${normalized}: private-key material detected`);
  }
  if (extension !== ".xml" || !FISCAL_XML_MARKER.test(content)) return errors;

  if (!/(?:^|\/)fixtures?\//i.test(normalized)) {
    errors.push(
      `${normalized}: fiscal XML is allowed only under a fixture directory`,
    );
  }
  if (!SYNTHETIC_XML_MARKER.test(content)) {
    errors.push(
      `${normalized}: fiscal XML must declare cfdi-fixture:synthetic`,
    );
  }

  for (const match of content.matchAll(/\bRfc=["']([^"']+)["']/gi)) {
    const rfc = match[1].trim().toUpperCase();
    if (!ALLOWED_SYNTHETIC_RFCS.has(rfc)) {
      errors.push(
        `${normalized}: RFC ${rfc} is not approved for sanitized fixtures`,
      );
    }
  }
  return errors;
}

export function validateDeploymentSecretReferences(path, content) {
  if (
    !/(?:^|\/)(?:\.github\/workflows\/.*\.ya?ml|docker-compose[^/]*\.ya?ml|\.env(?:\..+)?\.example)$/i.test(
      path,
    )
  ) {
    return [];
  }
  const errors = [];
  const assignment =
    /^\s*(FACTURAMA_(?:USERNAME|PASSWORD|API_KEY|TOKEN|CREDENTIALS))\s*[:=]\s*(.*?)\s*$/gim;
  for (const match of content.matchAll(assignment)) {
    const value = match[2].replace(/^['"]|['"]$/g, "").trim();
    if (value && !value.includes("${{ secrets.") && !value.startsWith("${")) {
      errors.push(
        `${path}: ${match[1]} must be a secret reference, never a versioned value`,
      );
    }
  }
  return errors;
}

export function trackedFiles(repositoryRoot) {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
}

export function validateRepository(
  repositoryRoot,
  paths = trackedFiles(repositoryRoot),
) {
  const errors = [];
  for (const path of paths) {
    const absolutePath = resolve(repositoryRoot, path);
    const metadata = statSync(absolutePath);
    if (!metadata.isFile() || metadata.size > 5_000_000) continue;
    const content = readFileSync(absolutePath, "utf8");
    errors.push(...validateFiscalAsset(path, content));
    errors.push(...validateDeploymentSecretReferences(path, content));
  }
  return errors;
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (executedPath === fileURLToPath(import.meta.url)) {
  const repositoryRoot = resolve(fileURLToPath(import.meta.url), "..", "..");
  const paths = process.argv.includes("--files-from-stdin")
    ? readFileSync(0, "utf8").split("\0").filter(Boolean)
    : undefined;
  const errors = validateRepository(repositoryRoot, paths);
  if (errors.length > 0) {
    console.error(`Fiscal asset validation failed:\n- ${errors.join("\n- ")}`);
    process.exitCode = 1;
  } else {
    console.log("Fiscal asset validation passed.");
  }
}
