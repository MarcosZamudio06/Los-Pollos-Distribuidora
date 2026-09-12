import { PrismaClient } from '@prisma/client';

import { assertDisposableE2eEnvironment } from './e2e-environment';
import { seedFixture } from './fixtures/cfdi-reconciliation.fixture';

const CERTIFICATE_SERIAL = '30001000000500003416';
const CERTIFICATE_FINGERPRINT = 'a'.repeat(64);
const CERTIFICATE_VALID_FROM = new Date('2025-01-01T00:00:00.000Z');
const CERTIFICATE_VALID_TO = new Date('2030-01-01T00:00:00.000Z');

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

  it(
    'persists a CFDI-enabled LegalEntity with constraint-valid certificate metadata',
    async () => {
      const fixture = await seedFixture(prisma!, {
        sandbox: {
          issuer: {
            taxId: 'AAA010101AAA',
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
        },
      });
      const invoice = await prisma!.invoice.findUniqueOrThrow({
        where: { id: fixture.invoiceId },
      });
      const legalEntity = await prisma!.legalEntity.findUniqueOrThrow({
        where: { id: invoice.legalEntityId },
      });
      expect(invoice.fiscalCertificateId).not.toBeNull();
      const certificate = await prisma!.fiscalCertificate.findUniqueOrThrow({
        where: { id: invoice.fiscalCertificateId! },
      });

      expect(legalEntity).toMatchObject({
        cfdiEnabled: true,
        certificateSerialNumber: CERTIFICATE_SERIAL,
        certificateFingerprint: CERTIFICATE_FINGERPRINT,
        certificateSubject: `CN=${fixture.marker}`,
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
      expect(invoice.issuerSnapshot).toMatchObject({
        certificateSerialNumber: legalEntity.certificateSerialNumber,
        certificateFingerprint: legalEntity.certificateFingerprint,
      });
    },
  );
});
