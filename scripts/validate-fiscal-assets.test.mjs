import assert from "node:assert/strict";
import test from "node:test";

import {
  validateDeploymentSecretReferences,
  validateFiscalAsset,
} from "./validate-fiscal-assets.mjs";

test("rejects versioned certificate and private-key material", () => {
  assert.ok(validateFiscalAsset("fixtures/issuer.key").length > 0);
  assert.ok(validateFiscalAsset("fixtures/issuer.cer").length > 0);
  assert.ok(
    validateFiscalAsset(
      "fixtures/issuer.txt",
      `${["-----BEGIN", "PRIVATE KEY-----"].join(" ")}\nnot-a-real-key`,
    ).length > 0,
  );
  assert.ok(
    validateFiscalAsset(
      "fixtures/issuer.pem",
      `${["-----BEGIN", "RSA PRIVATE KEY-----"].join(" ")}\nnot-a-real-key`,
    ).length > 0,
  );
});

test("accepts only explicitly synthetic CFDI XML with allowlisted RFCs", () => {
  const synthetic = `<!-- cfdi-fixture:synthetic -->
    <cfdi:Comprobante><cfdi:Emisor Rfc="EKU9003173C9" />
    <cfdi:Receptor Rfc="XAXX010101000" /></cfdi:Comprobante>`;

  assert.deepEqual(
    validateFiscalAsset(
      "backend/test/fixtures/cfdi/sample.sanitized.xml",
      synthetic,
    ),
    [],
  );
  assert.ok(
    validateFiscalAsset(
      "backend/test/fixtures/cfdi/unsafe.xml",
      synthetic.replace("XAXX010101000", "ABC010203XYZ"),
    ).length > 0,
  );
});

test("rejects raw Facturama secrets in deployment configuration", () => {
  assert.ok(
    validateDeploymentSecretReferences(
      ".github/workflows/unsafe.yml",
      "FACTURAMA_PASSWORD: raw-password",
    ).length > 0,
  );
  assert.deepEqual(
    validateDeploymentSecretReferences(
      ".github/workflows/safe.yml",
      "FACTURAMA_PASSWORD: ${{ secrets.FACTURAMA_SANDBOX_PASSWORD }}",
    ),
    [],
  );
});
