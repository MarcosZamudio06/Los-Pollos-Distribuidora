import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schema = readFileSync(
  resolve(__dirname, '../../prisma/schema.prisma'),
  'utf8',
);
const migration = readFileSync(
  resolve(
    __dirname,
    '../../prisma/migrations/20260822120000_add_cfdi_fiscal_data_model/migration.sql',
  ),
  'utf8',
);
const issuanceMigration = readFileSync(
  resolve(
    __dirname,
    '../../prisma/migrations/20260823120000_add_cfdi_issuance_coordination/migration.sql',
  ),
  'utf8',
);
const cancellationMigration = readFileSync(
  resolve(
    __dirname,
    '../../prisma/migrations/20260823130000_add_cfdi_cancellation_fields/migration.sql',
  ),
  'utf8',
);
const substitutionMigration = readFileSync(
  resolve(
    __dirname,
    '../../prisma/migrations/20260828100000_add_cfdi_income_substitution_relation/migration.sql',
  ),
  'utf8',
);
const repMigration = readFileSync(
  resolve(
    __dirname,
    '../../prisma/migrations/20260823150000_add_cfdi_rep_payment_receipts/migration.sql',
  ),
  'utf8',
);

function getBlock(kind: 'model' | 'enum', name: string): string {
  const match = schema.match(
    new RegExp(`${kind}\\s+${name}\\s+\\{([\\s\\S]*?)\\n\\}`, 'm'),
  );

  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

describe('CFDI fiscal persistence contract', () => {
  it('uses separate fiscal enums without overloading the legacy invoice status', () => {
    expect(getBlock('enum', 'InvoiceFiscalStatus')).toContain('LEGACY');
    expect(getBlock('enum', 'InvoiceFiscalStatus')).toContain('STAMPED');
    expect(getBlock('enum', 'FiscalOperationType')).toMatch(
      /STAMP[\s\S]*CANCEL[\s\S]*STATUS[\s\S]*RECOVERY/,
    );
    expect(getBlock('enum', 'FiscalArtifactType')).toMatch(
      /XML[\s\S]*PDF[\s\S]*CANCELLATION_ACK/,
    );
    expect(getBlock('enum', 'CfdiDocumentType')).toMatch(
      /INCOME[\s\S]*EXPENSE[\s\S]*PAYMENT_RECEIPT/,
    );
    expect(getBlock('enum', 'InvoiceStatus')).toMatch(
      /ACTIVE[\s\S]*CANCELLED[\s\S]*SUBSTITUTED/,
    );
  });

  it('extends Invoice additively with server-owned fiscal metadata and immutable snapshots', () => {
    const invoice = getBlock('model', 'Invoice');

    expect(invoice).toMatch(
      /origin\s+InvoiceOrigin\s+@default\(LEGACY_EXTERNAL\)/,
    );
    expect(invoice).toMatch(/cfdiVersion\s+String\?/);
    expect(invoice).toMatch(/cfdiType\s+CfdiDocumentType\?/);
    expect(invoice).toMatch(/issuedAt\s+DateTime\?/);
    expect(invoice).toMatch(/stampedAt\s+DateTime\?/);
    expect(invoice).toMatch(/issuerSnapshot\s+Json\?/);
    expect(invoice).toMatch(/receiverSnapshot\s+Json\?/);
    expect(invoice).toMatch(/fiscalRelationships\s+Json\?/);
    expect(invoice).toMatch(/fiscalSnapshotHash\s+String\?/);
    expect(invoice).toMatch(/fiscalIdempotencyKey\s+String\?\s+@unique/);
    expect(invoice).toMatch(/fiscalRequestHash\s+String\?/);
    expect(invoice).toMatch(/fiscalUseCode\s+String\?/);
    expect(invoice).toMatch(/exportCode\s+String\?/);
    expect(invoice).toMatch(/paymentFormCode\s+String\?/);
    expect(invoice).toMatch(/paymentMethodCode\s+String\?/);
    expect(invoice).toMatch(/exchangeRate\s+Decimal\?/);
    expect(invoice).toMatch(/certificateNumber\s+String\?/);
    expect(invoice).toMatch(/certificationProviderTaxId\s+String\?/);
    expect(invoice).toMatch(/cfdiSeal\s+String\?/);
    expect(invoice).toMatch(/satSeal\s+String\?/);
    expect(invoice).toMatch(
      /fiscalStatus\s+InvoiceFiscalStatus\s+@default\(LEGACY\)/,
    );
    expect(invoice).toMatch(
      /cancellationStatus\s+FiscalCancellationStatus\s+@default\(NOT_APPLICABLE\)/,
    );
    expect(invoice).toMatch(/substitutionUuid\s+String\?/);
    expect(invoice).toMatch(/cancellationMotiveCode\s+String\?/);
    expect(invoice).toMatch(/internalReason\s+String\?/);
    expect(invoice).toMatch(/replacementInvoiceId\s+String\?\s+@unique/);
    expect(invoice).toMatch(/replacementUuid\s+String\?/);
    expect(invoice).toMatch(/substitutionOfInvoiceId\s+String\?\s+@unique/);
    expect(invoice).toMatch(
      /substitutionOfInvoice\s+Invoice\?.*InvoiceNativeFiscalSubstitution/,
    );
    expect(invoice).toMatch(
      /nativeSubstitute\s+Invoice\?.*InvoiceNativeFiscalSubstitution/,
    );
    expect(invoice).toMatch(/fiscalAttemptCount\s+Int\s+@default\(0\)/);
    expect(invoice).toMatch(/lastFiscalErrorCode\s+String\?/);
    expect(invoice).toMatch(/lastFiscalErrorMessage\s+String\?/);
    expect(invoice).toMatch(/uuid\s+String\?\s+@unique/);
    expect(invoice).toMatch(/documents\s+InvoiceSaleDocument\[\]/);
  });

  it('persists server-owned cancellation motive and replacement identity with database constraints', () => {
    expect(cancellationMigration).toContain(
      "\"cancellationMotiveCode\" IN ('01', '02', '03', '04')",
    );
    expect(cancellationMigration).toContain(
      '"replacementInvoiceId" IS NOT NULL',
    );
    expect(cancellationMigration).toContain(
      'FOREIGN KEY ("replacementInvoiceId") REFERENCES "Invoice"("id")',
    );
    expect(cancellationMigration).toContain(
      '"cancellationStatus" = \'ACCEPTED\'',
    );
    expect(cancellationMigration).toContain(
      'CREATE TRIGGER invoice_uuid_immutable_after_stamp',
    );
  });

  it('persists the native income substitution relation independently of legacy fields', () => {
    expect(substitutionMigration).toContain(
      'ADD COLUMN "fiscalRelationships" JSONB',
    );
    expect(substitutionMigration).toContain(
      'ADD COLUMN "substitutionOfInvoiceId" TEXT',
    );
    expect(substitutionMigration).toContain(
      'CREATE UNIQUE INDEX "Invoice_substitutionOfInvoiceId_key"',
    );
    expect(substitutionMigration).toContain(
      'FOREIGN KEY ("substitutionOfInvoiceId") REFERENCES "Invoice"("id")',
    );
    expect(substitutionMigration).toContain(
      'NEW."fiscalRelationships" IS DISTINCT FROM OLD."fiscalRelationships"',
    );
  });

  it('persists exact concepts, object-storage metadata, operation attempts and secret-free certificate snapshots', () => {
    const concept = getBlock('model', 'InvoiceConcept');
    const artifact = getBlock('model', 'FiscalArtifact');
    const attempt = getBlock('model', 'FiscalOperationAttempt');
    const certificate = getBlock('model', 'FiscalCertificate');

    expect(concept).toMatch(/invoiceId\s+String/);
    expect(concept).toMatch(/productServiceCode\s+String/);
    expect(concept).toMatch(/unitCode\s+String/);
    expect(concept).toMatch(/taxObjectCode\s+String/);
    expect(concept).toMatch(/snapshotHash\s+String/);
    expect(concept).not.toMatch(/product\s+Product/);
    expect(concept).not.toMatch(/customer\s+Customer/);

    expect(artifact).toMatch(/storageKey\s+String\s+@unique/);
    expect(artifact).toMatch(/mimeType\s+String/);
    expect(artifact).toMatch(/byteSize\s+BigInt\?/);
    expect(artifact).toMatch(/sha256\s+String/);
    expect(artifact).toMatch(/createdAt\s+DateTime/);
    expect(artifact).toMatch(/metadata\s+Json\?/);
    expect(artifact).not.toMatch(/payload|content|data\s+Bytes/i);

    expect(attempt).toMatch(/operation\s+FiscalOperationType/);
    expect(attempt).toMatch(/correlationId\s+String\s+@unique/);
    expect(attempt).toMatch(/idempotencyKey\s+String/);
    expect(attempt).toMatch(/attemptNumber\s+Int/);
    expect(attempt).toMatch(/requestHash\s+String/);

    expect(certificate).toMatch(/serialNumber\s+String/);
    expect(certificate).toMatch(/fingerprintSha256\s+String/);
    expect(certificate).toMatch(/validFrom\s+DateTime/);
    expect(certificate).toMatch(/validTo\s+DateTime/);
    expect(certificate).not.toMatch(/privateKey|password|secret|token/i);
    expect(certificate).not.toMatch(/metadata\s+Json/i);
  });

  it('uses a real expand-backfill-validate migration without fiscal inference', () => {
    expect(migration).toContain('-- Expand');
    expect(migration).toContain('-- Backfill');
    expect(migration).toContain('-- Validate');
    expect(migration).toContain('CREATE TABLE "InvoiceConcept"');
    expect(migration).toContain('CREATE TABLE "FiscalArtifact"');
    expect(migration).toContain('CREATE TABLE "FiscalOperationAttempt"');
    expect(migration).toContain('CREATE TABLE "FiscalCertificate"');
    expect(migration).toContain(
      'UPDATE "Invoice" SET "origin" = \'LEGACY_EXTERNAL\'',
    );
    expect(migration).toContain(
      'UPDATE "Invoice" SET "fiscalStatus" = \'LEGACY\'',
    );
    expect(migration).toContain('LEGACY_INVOICE_UUID_INVALID');
    expect(migration).toContain('LEGACY_INVOICE_TOTAL_INCONSISTENT');
    expect(migration).toContain('Invoice_native_fiscal_snapshot_check');
    expect(migration).toContain('Invoice_stamped_metadata_check');
    expect(migration).toContain('invoice_fiscal_snapshot_immutable');
    expect(migration).toContain('invoice_concept_immutable');
    expect(migration).toContain('fiscal_certificate_metadata_immutable');
    expect(migration).toContain('fiscal_stamp_attempt_guard');
    expect(migration).toContain(
      'prior_attempt."status" <> \'RETRYABLE_FAILURE\'',
    );
    expect(migration).not.toMatch(/UPDATE\s+"Invoice"\s+SET\s+"cfdiVersion"/i);
    expect(migration).not.toMatch(/BYTEA|privateKey|password|pacToken/i);
  });

  it('coordinates native issuance with a PostgreSQL folio sequence and global operation idempotency', () => {
    const sequence = getBlock('model', 'FiscalFolioSequence');
    const attempt = getBlock('model', 'FiscalOperationAttempt');
    const artifact = getBlock('model', 'FiscalArtifact');

    expect(sequence).toMatch(/legalEntityId\s+String/);
    expect(sequence).not.toMatch(/cfdiType\s+CfdiDocumentType/);
    expect(sequence).toMatch(/series\s+String/);
    expect(sequence).toMatch(/nextValue\s+BigInt\s+@default\(1\)/);
    expect(sequence).toMatch(/@@unique\(\[legalEntityId, series\]\)/);
    expect(attempt).toMatch(/idempotencyKey\s+String\s+@unique/);
    expect(artifact).toMatch(/byteSize\s+BigInt\?/);
    expect(artifact).toMatch(/sha256\s+String\?/);
    expect(issuanceMigration).toContain('CREATE TABLE "FiscalFolioSequence"');
    expect(issuanceMigration).toContain(
      'CREATE UNIQUE INDEX "FiscalOperationAttempt_idempotencyKey_key"',
    );
    expect(issuanceMigration).toContain('ALTER COLUMN "sha256" DROP NOT NULL');
  });

  it('models REP applications as fiscal snapshots without duplicating Payment money', () => {
    const payment = getBlock('model', 'Payment');
    const receipt = getBlock('model', 'PaymentReceipt');
    const detail = getBlock('model', 'PaymentReceiptDetail');
    const application = getBlock('model', 'PaymentInvoiceApplication');
    const applicationStatus = getBlock(
      'enum',
      'PaymentInvoiceApplicationStatus',
    );

    expect(payment).toMatch(/currencyCode\s+String\s+@default\("MXN"\)/);
    expect(payment).toMatch(/fiscalPaymentFormCode\s+String\?/);
    expect(receipt).toMatch(/invoiceId\s+String\s+@unique/);
    expect(receipt).toMatch(/snapshotHash\s+String/);
    expect(detail).toMatch(/paymentId\s+String/);
    expect(detail).toMatch(/@@unique\(\[paymentId\]\)/);
    expect(detail).toMatch(/paymentDate\s+DateTime/);
    expect(application).toMatch(/relatedInvoiceId\s+String/);
    expect(application).toMatch(/partialityNumber\s+Int/);
    expect(application).toMatch(/previousBalanceAmount\s+Decimal/);
    expect(application).toMatch(/amountPaid\s+Decimal/);
    expect(application).toMatch(/remainingBalance\s+Decimal/);
    expect(application).toMatch(/snapshotHash\s+String/);
    expect(applicationStatus).toMatch(
      /RESERVED[\s\S]*UNKNOWN[\s\S]*EFFECTIVE[\s\S]*REVERSED/,
    );

    expect(repMigration).toContain('-- Expand');
    expect(repMigration).toContain('-- Backfill');
    expect(repMigration).toContain('-- Validate');
    expect(repMigration).toContain('CREATE TABLE "PaymentReceipt"');
    expect(repMigration).toContain('CREATE TABLE "PaymentReceiptDetail"');
    expect(repMigration).toContain(
      'CREATE UNIQUE INDEX "PaymentReceiptDetail_paymentId_key"',
    );
    expect(repMigration).toContain('CREATE TABLE "PaymentInvoiceApplication"');
    expect(repMigration).toContain('PaymentInvoiceApplication_integrity_check');
    expect(repMigration).toContain(
      '"remainingBalance" = "previousBalanceAmount" - "amountPaid"',
    );
    expect(repMigration).toContain('"relatedUuid" ~*');
    expect(repMigration).not.toMatch(/UPDATE\s+"Payment"\s+SET\s+"amount"/i);
  });
});
