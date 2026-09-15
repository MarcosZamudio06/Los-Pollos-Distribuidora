import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { FacturamaAdapter } from '../src/modules/cfdi/adapters/facturama/facturama.adapter';

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
    for (const fixture of [first, second]) {
      const prepared = fixture.prepared!;
      const concept = prepared.snapshot!.concepts[0];
      const sku = `CFDI-${fixture.marker.replace('cfdi-reconciliation-', '')}`;
      expect(sku).toHaveLength(37);
      expect(sku).toMatch(/^CFDI-[0-9A-F]{32}$/);
      expect(concept.identificationNumber).toBe(sku);
      const sourceItem = await prisma!.saleItem.findUniqueOrThrow({
        where: { id: concept.sourceSaleItemId },
        include: { product: true },
      });
      expect(sourceItem.productSkuSnapshot).toBe(sku);
      expect(sourceItem.product.sku).toBe(sku);

      // Inspect the exact adapter JSON; this transport never accesses a PAC.
      const fetcher = jest.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        const payload = JSON.parse(init!.body as string) as Record<
          string,
          unknown
        >;
        expect(payload).toMatchObject({
          CfdiType: 'I',
          ExpeditionPlace: sandbox.issuer.fiscalPostalCode,
          Serie: 'A',
          Folio: prepared.folio,
          Currency: 'MXN',
          PaymentMethod: 'PUE',
          PaymentForm: '01',
          Exportation: '01',
          Issuer: {
            Rfc: sandbox.issuer.taxId,
            Name: sandbox.issuer.legalName,
            FiscalRegime: '601',
          },
          Receiver: {
            Rfc: sandbox.receiver.taxId,
            Name: sandbox.receiver.fiscalName,
            FiscalRegime: '601',
            TaxZipCode: '64000',
            CfdiUse: 'G03',
          },
          Items: [
            {
              ProductCode: '10101504',
              IdentificationNumber: sku,
              Description: sourceItem.product.name,
              Quantity: '2.000000',
              UnitCode: 'H87',
              UnitPrice: '50.00',
              Subtotal: '100.00',
              Discount: '0.00',
              TaxObject: '02',
              Total: '116.00',
              Taxes: [
                {
                  Name: 'IVA',
                  Base: '100.00',
                  Rate: '0.160000',
                  Total: '16.00',
                  IsRetention: false,
                },
              ],
            },
          ],
        });
        expect(prepared.folio).toMatch(/^[0-9A-F]{32}$/);
        return Promise.resolve(new Response('{}', { status: 400 }));
      });
      const adapter = new FacturamaAdapter(
        new ConfigService({
          FACTURAMA_API_BASE_URL: 'https://apisandbox.facturama.mx',
          FACTURAMA_API_MODE: 'MULTI_ISSUER',
          FACTURAMA_CREDENTIAL_REF: 'fixture-only',
          FISCAL_PROVIDER_ENVIRONMENT: 'SANDBOX',
          FISCAL_PROVIDER: 'FACTURAMA',
        }),
        {
          resolve: () =>
            Promise.resolve({ username: 'fixture', password: 'fixture' }),
        },
        fetcher,
      );
      await expect(
        adapter.stamp({
          correlationId: prepared.correlationId,
          idempotencyKey: prepared.idempotencyKey,
          folio: prepared.folio,
          series: prepared.series,
          snapshot: prepared.snapshot!,
        }),
      ).rejects.toMatchObject({ code: 'FISCAL_PROVIDER_VALIDATION' });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
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
