import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { assertDisposableE2eEnvironment } from './e2e-environment';
import { seedFixture } from './fixtures/cfdi-reconciliation.fixture';

const CERTIFICATE_SERIAL = '30001000000500003416';
const CERTIFICATE_FINGERPRINT = 'a'.repeat(64);
const CERTIFICATE_VALID_FROM = new Date('2025-01-01T00:00:00.000Z');
const CERTIFICATE_VALID_TO = new Date('2030-01-01T00:00:00.000Z');

function uniqueIssuerRfc(): string {
  const seed = randomUUID().replaceAll('-', '').toUpperCase();
  const prefix = [...seed.slice(0, 4)]
    .map((character) =>
      String.fromCharCode(65 + Number.parseInt(character, 16)),
    )
    .join('');
  return `${prefix}010101${seed.slice(4, 7)}`;
}

function sandboxOptions(taxId: string) {
  return {
    issuer: {
      taxId,
      legalName: 'SANDBOX ISSUER',
      fiscalPostalCode: '64000',
      fiscalRegime: '601',
    },
    receiver: {
      taxId: 'TST010101AA1',
      fiscalName: 'SANDBOX RECEIVER',
      fiscalPostalCode: '64000',
      fiscalRegime: '601',
      fiscalUseCode: 'G03',
    },
    certificateSerial: CERTIFICATE_SERIAL,
  };
}

describe('CFDI reconciliation sandbox fixture (e2e)', () => {
  let prisma: PrismaClient | undefined;

  beforeAll(async () => {
    assertDisposableE2eEnvironment();
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.E2E_DATABASE_URL } },
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('creates once and reuses deterministic sandbox certificate metadata', async () => {
    const sandbox = sandboxOptions(uniqueIssuerRfc());
    const first = await seedFixture(prisma!, { sandbox });
    const second = await seedFixture(prisma!, { sandbox });
    const firstInvoice = await prisma!.invoice.findUniqueOrThrow({
      where: { id: first.invoiceId },
    });
    const secondInvoice = await prisma!.invoice.findUniqueOrThrow({
      where: { id: second.invoiceId },
    });
    const legalEntity = await prisma!.legalEntity.findUniqueOrThrow({
      where: { id: secondInvoice.legalEntityId },
    });
    expect(firstInvoice.fiscalCertificateId).not.toBeNull();
    expect(secondInvoice.fiscalCertificateId).not.toBeNull();
    const certificate = await prisma!.fiscalCertificate.findUniqueOrThrow({
      where: { id: secondInvoice.fiscalCertificateId! },
    });

    expect(first.marker).not.toBe(second.marker);
    expect(firstInvoice.legalEntityId).toBe(secondInvoice.legalEntityId);
    expect(firstInvoice.fiscalCertificateId).toBe(
      secondInvoice.fiscalCertificateId,
    );
    expect(legalEntity).toMatchObject({
      legalName: sandbox.issuer.legalName,
      fiscalPostalCode: sandbox.issuer.fiscalPostalCode,
      fiscalRegime: sandbox.issuer.fiscalRegime,
      cfdiEnabled: true,
      defaultSeries: 'A',
      certificateSerialNumber: CERTIFICATE_SERIAL,
      certificateFingerprint: CERTIFICATE_FINGERPRINT,
      certificateSubject: `CN=${sandbox.issuer.taxId}`,
      certificateValidFrom: CERTIFICATE_VALID_FROM,
      certificateValidTo: CERTIFICATE_VALID_TO,
    });
    expect(certificate).toMatchObject({
      serialNumber: legalEntity.certificateSerialNumber,
      fingerprintSha256: legalEntity.certificateFingerprint,
      subject: legalEntity.certificateSubject,
      validFrom: legalEntity.certificateValidFrom,
      validTo: legalEntity.certificateValidTo,
    });
    for (const invoice of [firstInvoice, secondInvoice]) {
      expect(invoice.issuerSnapshot).toMatchObject({
        certificateSerialNumber: legalEntity.certificateSerialNumber,
        certificateFingerprint: legalEntity.certificateFingerprint,
      });
    }
  });

  it('reuses a legacy immutable certificate and aligns its LegalEntity', async () => {
    const sandbox = sandboxOptions(uniqueIssuerRfc());
    const legacySubject = 'CN=cfdi-reconciliation-LEGACY';
    const legalEntity = await prisma!.legalEntity.create({
      data: {
        ...sandbox.issuer,
        cfdiEnabled: true,
        defaultSeries: 'A',
        certificateSerialNumber: CERTIFICATE_SERIAL,
        certificateFingerprint: CERTIFICATE_FINGERPRINT,
        certificateSubject: legacySubject,
        certificateValidFrom: CERTIFICATE_VALID_FROM,
        certificateValidTo: CERTIFICATE_VALID_TO,
      },
    });
    const legacyCertificate = await prisma!.fiscalCertificate.create({
      data: {
        legalEntityId: legalEntity.id,
        serialNumber: CERTIFICATE_SERIAL,
        fingerprintSha256: CERTIFICATE_FINGERPRINT,
        subject: legacySubject,
        validFrom: CERTIFICATE_VALID_FROM,
        validTo: CERTIFICATE_VALID_TO,
      },
    });

    const first = await seedFixture(prisma!, { sandbox });
    const second = await seedFixture(prisma!, { sandbox });
    const firstInvoice = await prisma!.invoice.findUniqueOrThrow({
      where: { id: first.invoiceId },
    });
    const secondInvoice = await prisma!.invoice.findUniqueOrThrow({
      where: { id: second.invoiceId },
    });
    const persistedCertificate =
      await prisma!.fiscalCertificate.findUniqueOrThrow({
        where: { id: legacyCertificate.id },
      });
    const persistedLegalEntity = await prisma!.legalEntity.findUniqueOrThrow({
      where: { id: legalEntity.id },
    });

    expect(first.marker).not.toBe(second.marker);
    expect(firstInvoice.legalEntityId).toBe(legalEntity.id);
    expect(secondInvoice.legalEntityId).toBe(legalEntity.id);
    expect(firstInvoice.fiscalCertificateId).toBe(legacyCertificate.id);
    expect(secondInvoice.fiscalCertificateId).toBe(legacyCertificate.id);
    expect(persistedCertificate).toMatchObject({
      id: legacyCertificate.id,
      subject: legacySubject,
      fingerprintSha256: CERTIFICATE_FINGERPRINT,
      validFrom: CERTIFICATE_VALID_FROM,
      validTo: CERTIFICATE_VALID_TO,
    });
    expect(persistedLegalEntity).toMatchObject({
      certificateSerialNumber: persistedCertificate.serialNumber,
      certificateFingerprint: persistedCertificate.fingerprintSha256,
      certificateSubject: persistedCertificate.subject,
      certificateValidFrom: persistedCertificate.validFrom,
      certificateValidTo: persistedCertificate.validTo,
    });
  });
});
