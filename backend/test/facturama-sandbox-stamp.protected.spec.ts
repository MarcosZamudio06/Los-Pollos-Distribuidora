import { Prisma } from '@prisma/client';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import { SaxesParser } from 'saxes';

import {
  FACTURAMA_SANDBOX_BASE_URL,
  getFacturamaSandboxStampConfig,
  type FacturamaSandboxStampConfig,
} from '../src/config/facturama-sandbox-stamp-guard';
import { FacturamaAdapter } from '../src/modules/cfdi/adapters/facturama/facturama.adapter';
import {
  FISCAL_CREDENTIAL_RESOLVER,
  type FiscalCredentialResolver,
} from '../src/modules/cfdi/adapters/fiscal-credential.resolver';
import { CfdiModule } from '../src/modules/cfdi/cfdi.module';
import { buildCreditNoteDocument } from '../src/modules/cfdi/domain/credit-note-document-builder';
import type {
  CfdiCreditNoteSnapshot,
  CfdiDocumentSnapshot,
  CfdiPaymentReceiptSnapshot,
} from '../src/modules/cfdi/domain/cfdi-document.types';
import {
  FISCAL_PROVIDER_PORT,
  FiscalProviderError,
  type CfdiProviderSnapshot,
  type FiscalProviderPort,
} from '../src/modules/cfdi/domain/fiscal-provider.port';
import type { CfdiGlobalInformation } from '../../shared/cfdi-global-information';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FACTURAMA_SANDBOX_STAMP_TEST_TIMEOUT_MS = 30_000;

interface ParsedXmlElement {
  readonly name: string;
  readonly attributes: Record<string, string>;
}

interface ParsedCfdiXml {
  readonly root: ParsedXmlElement;
  readonly issuer: ParsedXmlElement;
  readonly receiver: ParsedXmlElement;
  readonly taxStamp: ParsedXmlElement;
  readonly taxSummary?: ParsedXmlElement;
  readonly relationship?: ParsedXmlElement;
  readonly relatedDocuments: readonly ParsedXmlElement[];
  readonly payments: readonly ParsedXmlElement[];
  readonly paymentRelatedDocuments: readonly ParsedXmlElement[];
  readonly globalInformation?: ParsedXmlElement;
  readonly globalInformationCount: number;
}

const GLOBAL_SANDBOX_ISSUER = {
  taxId: 'EKU9003173C9',
  legalName: 'ESCUELA KEMPER URGATE',
  fiscalRegime: '601',
  fiscalPostalCode: '42501',
} as const;

const GLOBAL_SANDBOX_RECEIVER = {
  taxId: 'XAXX010101000',
  legalName: 'PUBLICO EN GENERAL',
  fiscalRegime: '616',
  fiscalPostalCode: '42501',
  fiscalUseCode: 'S01',
} as const;

/**
 * The receiver defaults are the public synthetic fixture from Facturama's
 * CFDI 4.0 Multiemisor guide. Account-specific issuer data remains protected.
 */
const DEFAULT_RECEIVER = {
  taxId: 'URE180429TM6',
  legalName: 'UNIVERSIDAD ROBOTICA ESPAÑOLA',
  fiscalRegime: '601',
  fiscalPostalCode: '86991',
  fiscalUseCode: 'G03',
} as const;

describe('Facturama protected sandbox stamp contract', () => {
  it(
    'stamps and reads back one new CFDI only when the explicit guard is enabled',
    async () => {
      const guarded = getFacturamaSandboxStampConfig();
      if (!guarded.enabled) {
        expect(guarded.reason).toBe(
          'RUN_FACTURAMA_SANDBOX_STAMP must be exactly "true"',
        );
        return;
      }

      const fixture = buildFixture(guarded);
      let moduleFixture: TestingModule | undefined;
      try {
        moduleFixture = await buildModule(guarded);
        const provider =
          moduleFixture.get<FiscalProviderPort>(FISCAL_PROVIDER_PORT);

        expect(provider).toBeInstanceOf(FacturamaAdapter);

        const stamp = await provider.stamp({
          correlationId: `facturama-sandbox-stamp-${fixture.folio}`,
          idempotencyKey: `facturama-sandbox-idempotency-${fixture.folio}`,
          series: 'SBX',
          folio: fixture.folio,
          snapshot: fixture.snapshot,
        });

        expect(stamp.provider).toBe('FACTURAMA');
        expect(stamp.providerDocumentId.trim()).not.toBe('');
        expect(UUID.test(stamp.uuid)).toBe(true);
        expect(Number.isNaN(Date.parse(stamp.stampedAt))).toBe(false);
        expect(stamp.tfd).toEqual(
          expect.objectContaining({
            stampedAt: stamp.stampedAt,
          }),
        );
        expect(normalizeUuid(stamp.tfd.uuid)).toBe(normalizeUuid(stamp.uuid));
        expect(stamp.tfd.cfdiSeal.trim()).not.toBe('');
        expect(stamp.tfd.satSeal.trim()).not.toBe('');
        expect(stamp.tfd.satCertificateNumber.trim()).not.toBe('');
        expect(stamp.tfd.providerCertificateRfc.trim()).not.toBe('');

        console.info(
          JSON.stringify({
            contract: 'FACTURAMA_SANDBOX_STAMP',
            postEndpoint: `${FACTURAMA_SANDBOX_BASE_URL}/api-lite/3/cfdis`,
            folio: fixture.folio,
            provider: stamp.provider,
            providerDocumentId: summarizeProviderDocumentId(
              stamp.providerDocumentId,
            ),
            uuid: redactUuid(stamp.uuid),
            tfdPresent: true,
          }),
        );

        const status = await provider.getStatus({
          correlationId: `facturama-sandbox-status-${fixture.folio}`,
          providerKey: stamp.provider,
          providerDocumentId: stamp.providerDocumentId,
          uuid: stamp.uuid,
        });
        expect(status.provider).toBe('FACTURAMA');
        expect(status.providerDocumentId).toBe(stamp.providerDocumentId);
        expect(status.status).toBe('ACTIVE');
        expect(normalizeUuid(status.uuid)).toBe(normalizeUuid(stamp.uuid));

        const xmlArtifact = await provider.getXml({
          correlationId: `facturama-sandbox-xml-${fixture.folio}`,
          providerKey: stamp.provider,
          providerDocumentId: stamp.providerDocumentId,
        });
        expect(xmlArtifact.provider).toBe('FACTURAMA');
        expect(xmlArtifact.artifactType).toBe('XML');
        expect(xmlArtifact.contentType).toBe('application/xml');
        expect(xmlArtifact.content.length).toBeGreaterThan(0);
        const parsedXml = parseCfdiXml(
          Buffer.from(xmlArtifact.content).toString('utf8'),
        );
        expect(localName(parsedXml.root.name)).toBe('Comprobante');
        expect(parsedXml.root.attributes.Version).toBe('4.0');
        expect(parsedXml.issuer.attributes.Rfc).toBe(fixture.issuerRfc);
        expect(parsedXml.receiver.attributes.Rfc).toBe(
          fixture.snapshot.receiver.taxId,
        );
        expect(parsedXml.root.attributes.Moneda).toBe(
          fixture.snapshot.currencyCode,
        );
        expect(normalizeMoney(parsedXml.root.attributes.Total)).toBe(
          normalizeMoney(fixture.snapshot.totals.total),
        );
        expect(normalizeUuid(parsedXml.taxStamp.attributes.UUID)).toBe(
          normalizeUuid(stamp.uuid),
        );

        let pdfValidation: 'PASS' | 'NOT_AVAILABLE' = 'NOT_AVAILABLE';
        try {
          const pdfArtifact = await provider.getPdf({
            correlationId: `facturama-sandbox-pdf-${fixture.folio}`,
            providerKey: stamp.provider,
            providerDocumentId: stamp.providerDocumentId,
          });
          expect(pdfArtifact.provider).toBe('FACTURAMA');
          expect(pdfArtifact.artifactType).toBe('PDF');
          expect(pdfArtifact.contentType).toBe('application/pdf');
          expect(pdfArtifact.content.length).toBeGreaterThan(0);
          expect(
            Buffer.from(pdfArtifact.content).subarray(0, 4).toString(),
          ).toBe('%PDF');
          pdfValidation = 'PASS';
        } catch (error) {
          if (
            !(error instanceof FiscalProviderError) ||
            ![
              'FISCAL_PROVIDER_ARTIFACT_UNAVAILABLE',
              'FISCAL_PROVIDER_NOT_FOUND',
            ].includes(error.code)
          ) {
            throw error;
          }
        }

        console.info(
          JSON.stringify({
            contract: 'FACTURAMA_SANDBOX_STAMP',
            postConfirmedByStampResponse: true,
            providerDocumentId: summarizeProviderDocumentId(
              stamp.providerDocumentId,
            ),
            uuid: redactUuid(stamp.uuid),
            getStatus: {
              provider: status.provider,
              status: status.status,
              uuidMatchesStamp:
                normalizeUuid(status.uuid) === normalizeUuid(stamp.uuid),
            },
            getXml: {
              downloaded: true,
              cfdiVersion: parsedXml.root.attributes.Version,
              issuerRfcMatchesFixture:
                parsedXml.issuer.attributes.Rfc === fixture.issuerRfc,
              totalMatchesSnapshot:
                normalizeMoney(parsedXml.root.attributes.Total) ===
                normalizeMoney(fixture.snapshot.totals.total),
              currencyMatchesSnapshot:
                parsedXml.root.attributes.Moneda ===
                fixture.snapshot.currencyCode,
              tfdUuidMatchesStamp:
                normalizeUuid(parsedXml.taxStamp.attributes.UUID) ===
                normalizeUuid(stamp.uuid),
            },
            getPdf: pdfValidation,
          }),
        );
      } finally {
        await moduleFixture?.close();
      }
    },
    FACTURAMA_SANDBOX_STAMP_TEST_TIMEOUT_MS,
  );
});

describe('Facturama protected sandbox global stamp contract', () => {
  it(
    'stamps and reads back one global CFDI',
    async () => {
      const guarded = getFacturamaSandboxStampConfig();
      if (!guarded.enabled) {
        expect(guarded.reason).toBe(
          'RUN_FACTURAMA_SANDBOX_STAMP must be exactly "true"',
        );
        return;
      }

      const fixture = buildGlobalFixture(guarded);
      let moduleFixture: TestingModule | undefined;
      try {
        moduleFixture = await buildModule(guarded);
        const provider =
          moduleFixture.get<FiscalProviderPort>(FISCAL_PROVIDER_PORT);

        expect(provider).toBeInstanceOf(FacturamaAdapter);

        const stamp = await provider.stamp({
          correlationId: `facturama-sandbox-global-stamp-${fixture.folio}`,
          idempotencyKey: `facturama-sandbox-global-idempotency-${fixture.folio}`,
          series: 'SBX',
          folio: fixture.folio,
          snapshot: fixture.snapshot,
        });

        expect(stamp.provider).toBe('FACTURAMA');
        expect(stamp.providerDocumentId.trim()).not.toBe('');
        expect(UUID.test(stamp.uuid)).toBe(true);
        expect(Number.isNaN(Date.parse(stamp.stampedAt))).toBe(false);
        expect(stamp.tfd).toEqual(
          expect.objectContaining({
            stampedAt: stamp.stampedAt,
          }),
        );
        expect(normalizeUuid(stamp.tfd.uuid)).toBe(normalizeUuid(stamp.uuid));
        expect(stamp.tfd.cfdiSeal.trim()).not.toBe('');
        expect(stamp.tfd.satSeal.trim()).not.toBe('');
        expect(stamp.tfd.satCertificateNumber.trim()).not.toBe('');
        expect(stamp.tfd.providerCertificateRfc.trim()).not.toBe('');

        const status = await provider.getStatus({
          correlationId: `facturama-sandbox-global-status-${fixture.folio}`,
          providerKey: stamp.provider,
          providerDocumentId: stamp.providerDocumentId,
          uuid: stamp.uuid,
        });
        expect(status.provider).toBe('FACTURAMA');
        expect(status.providerDocumentId).toBe(stamp.providerDocumentId);
        expect(status.status).toBe('ACTIVE');
        expect(normalizeUuid(status.uuid)).toBe(normalizeUuid(stamp.uuid));

        const xmlArtifact = await provider.getXml({
          correlationId: `facturama-sandbox-global-xml-${fixture.folio}`,
          providerKey: stamp.provider,
          providerDocumentId: stamp.providerDocumentId,
        });
        expect(xmlArtifact.provider).toBe('FACTURAMA');
        expect(xmlArtifact.artifactType).toBe('XML');
        expect(xmlArtifact.contentType).toBe('application/xml');
        expect(xmlArtifact.content.length).toBeGreaterThan(0);
        const parsedXml = parseCfdiXml(
          Buffer.from(xmlArtifact.content).toString('utf8'),
        );

        expect(localName(parsedXml.root.name)).toBe('Comprobante');
        expect(parsedXml.root.attributes.Version).toBe('4.0');
        expect(parsedXml.root.attributes.TipoDeComprobante).toBe('I');
        expect(parsedXml.root.attributes.Moneda).toBe('MXN');
        expect(parsedXml.root.attributes.LugarExpedicion).toBe(
          GLOBAL_SANDBOX_ISSUER.fiscalPostalCode,
        );
        expect(parsedXml.root.attributes.MetodoPago).toBe('PUE');
        expect(parsedXml.root.attributes.FormaPago).toBe('01');
        expect(parsedXml.root.attributes.Exportacion).toBe('01');
        expect(normalizeMoney(parsedXml.root.attributes.Total)).toBe(
          normalizeMoney(fixture.snapshot.totals.total),
        );

        expect(parsedXml.issuer.attributes.Rfc).toBe(
          GLOBAL_SANDBOX_ISSUER.taxId,
        );
        expect(parsedXml.issuer.attributes.Nombre).toBe(
          GLOBAL_SANDBOX_ISSUER.legalName,
        );
        expect(parsedXml.issuer.attributes.RegimenFiscal).toBe(
          GLOBAL_SANDBOX_ISSUER.fiscalRegime,
        );
        expect(parsedXml.receiver.attributes.Rfc).toBe(
          GLOBAL_SANDBOX_RECEIVER.taxId,
        );
        expect(parsedXml.receiver.attributes.Nombre).toBe(
          GLOBAL_SANDBOX_RECEIVER.legalName,
        );
        expect(parsedXml.receiver.attributes.RegimenFiscalReceptor).toBe(
          GLOBAL_SANDBOX_RECEIVER.fiscalRegime,
        );
        expect(parsedXml.receiver.attributes.UsoCFDI).toBe(
          GLOBAL_SANDBOX_RECEIVER.fiscalUseCode,
        );
        expect(parsedXml.receiver.attributes.DomicilioFiscalReceptor).toBe(
          GLOBAL_SANDBOX_RECEIVER.fiscalPostalCode,
        );

        expect(parsedXml.globalInformationCount).toBe(1);
        expect(parsedXml.globalInformation).toEqual(
          expect.objectContaining({
            name: expect.stringContaining('InformacionGlobal'),
          }),
        );
        expect(parsedXml.globalInformation?.attributes.Periodicidad).toBe(
          fixture.snapshot.globalInformation?.periodicity,
        );
        expect(parsedXml.globalInformation?.attributes.Meses).toBe(
          fixture.snapshot.globalInformation?.months,
        );
        expect(parsedXml.globalInformation?.attributes['Año']).toBe(
          String(fixture.snapshot.globalInformation?.year),
        );
        expect(normalizeUuid(parsedXml.taxStamp.attributes.UUID)).toBe(
          normalizeUuid(stamp.uuid),
        );

        let pdfValidation: 'PASS' | 'NOT_AVAILABLE' = 'NOT_AVAILABLE';
        try {
          const pdfArtifact = await provider.getPdf({
            correlationId: `facturama-sandbox-global-pdf-${fixture.folio}`,
            providerKey: stamp.provider,
            providerDocumentId: stamp.providerDocumentId,
          });
          expect(pdfArtifact.provider).toBe('FACTURAMA');
          expect(pdfArtifact.artifactType).toBe('PDF');
          expect(pdfArtifact.contentType).toBe('application/pdf');
          expect(pdfArtifact.content.length).toBeGreaterThan(0);
          expect(
            Buffer.from(pdfArtifact.content).subarray(0, 4).toString(),
          ).toBe('%PDF');
          pdfValidation = 'PASS';
        } catch (error) {
          if (
            !(error instanceof FiscalProviderError) ||
            ![
              'FISCAL_PROVIDER_ARTIFACT_UNAVAILABLE',
              'FISCAL_PROVIDER_NOT_FOUND',
            ].includes(error.code)
          ) {
            throw error;
          }
        }

        console.info(
          JSON.stringify({
            contract: 'FACTURAMA_SANDBOX_GLOBAL_STAMP',
            folio: fixture.folio,
            provider: stamp.provider,
            providerDocumentId: summarizeProviderDocumentId(
              stamp.providerDocumentId,
            ),
            uuid: redactUuid(stamp.uuid),
            status: status.status,
            globalInformation: fixture.snapshot.globalInformation,
            validations: {
              provider: stamp.provider === 'FACTURAMA',
              providerDocumentId: stamp.providerDocumentId.trim().length > 0,
              uuid: UUID.test(stamp.uuid),
              tfd: true,
              statusActive: status.status === 'ACTIVE',
              statusUuidMatchesStamp:
                normalizeUuid(status.uuid) === normalizeUuid(stamp.uuid),
              cfdiVersion: parsedXml.root.attributes.Version === '4.0',
              receiver: parsedXml.receiver.attributes.Rfc === 'XAXX010101000',
              fiscalRegime:
                parsedXml.receiver.attributes.RegimenFiscalReceptor === '616',
              cfdiUse: parsedXml.receiver.attributes.UsoCFDI === 'S01',
              postalCode:
                parsedXml.receiver.attributes.DomicilioFiscalReceptor ===
                '42501',
              globalInformation: parsedXml.globalInformationCount === 1,
              tfdUuidMatchesStamp:
                normalizeUuid(parsedXml.taxStamp.attributes.UUID) ===
                normalizeUuid(stamp.uuid),
            },
            getPdf: pdfValidation,
          }),
        );
      } finally {
        await moduleFixture?.close();
      }
    },
    FACTURAMA_SANDBOX_STAMP_TEST_TIMEOUT_MS,
  );
});

describe('Facturama protected sandbox REP 2.0 stamp contract', () => {
  it(
    'stamps a PPD income CFDI, then a related REP, and reads back the Pagos 2.0 fields',
    async () => {
      const guarded = getFacturamaSandboxStampConfig();
      if (!guarded.enabled) {
        expect(guarded.reason).toBe(
          'RUN_FACTURAMA_SANDBOX_STAMP must be exactly "true"',
        );
        return;
      }

      const originFixture = buildPpdFixture(guarded);
      let lastSnapshot: CfdiProviderSnapshot = originFixture.snapshot;
      let moduleFixture: TestingModule | undefined;
      try {
        moduleFixture = await buildModule(guarded);
        const provider =
          moduleFixture.get<FiscalProviderPort>(FISCAL_PROVIDER_PORT);
        expect(provider).toBeInstanceOf(FacturamaAdapter);

        const originStamp = await provider.stamp({
          correlationId: `facturama-sandbox-rep-origin-stamp-${originFixture.folio}`,
          idempotencyKey: `facturama-sandbox-rep-origin-idempotency-${originFixture.folio}`,
          series: 'SBX',
          folio: originFixture.folio,
          snapshot: originFixture.snapshot,
        });
        expect(originStamp.provider).toBe('FACTURAMA');
        expect(UUID.test(originStamp.uuid)).toBe(true);
        expect(normalizeUuid(originStamp.tfd.uuid)).toBe(
          normalizeUuid(originStamp.uuid),
        );

        const repFixture = buildRepFixture(originFixture, originStamp.uuid);
        lastSnapshot = repFixture.snapshot;
        const repStamp = await provider.stamp({
          correlationId: `facturama-sandbox-rep-stamp-${repFixture.folio}`,
          idempotencyKey: `facturama-sandbox-rep-idempotency-${repFixture.folio}`,
          series: 'SBX',
          folio: repFixture.folio,
          snapshot: repFixture.snapshot,
        });
        expect(repStamp.provider).toBe('FACTURAMA');
        expect(repStamp.providerDocumentId.trim()).not.toBe('');
        expect(UUID.test(repStamp.uuid)).toBe(true);
        expect(normalizeUuid(repStamp.tfd.uuid)).toBe(
          normalizeUuid(repStamp.uuid),
        );

        const status = await provider.getStatus({
          correlationId: `facturama-sandbox-rep-status-${repFixture.folio}`,
          providerKey: repStamp.provider,
          providerDocumentId: repStamp.providerDocumentId,
          uuid: repStamp.uuid,
        });
        expect(status.status).toBe('ACTIVE');
        expect(normalizeUuid(status.uuid)).toBe(normalizeUuid(repStamp.uuid));

        const xmlArtifact = await provider.getXml({
          correlationId: `facturama-sandbox-rep-xml-${repFixture.folio}`,
          providerKey: repStamp.provider,
          providerDocumentId: repStamp.providerDocumentId,
        });
        expect(xmlArtifact.content.length).toBeGreaterThan(0);
        const parsedXml = parseCfdiXml(
          Buffer.from(xmlArtifact.content).toString('utf8'),
        );
        const payment = parsedXml.payments[0];
        const relatedDocument = parsedXml.paymentRelatedDocuments[0];
        expect(parsedXml.root.attributes.Version).toBe('4.0');
        expect(parsedXml.root.attributes.TipoDeComprobante).toBe('P');
        expect(parsedXml.root.attributes.UsoCFDI).toBeUndefined();
        expect(parsedXml.root.attributes.FormaPago).toBeUndefined();
        expect(parsedXml.root.attributes.MetodoPago).toBeUndefined();
        expect(parsedXml.receiver.attributes.UsoCFDI).toBe('CP01');
        expect(parsedXml.payments).toHaveLength(1);
        expect(payment?.attributes.FormaDePagoP).toBe(
          repFixture.snapshot.payment.paymentFormCode,
        );
        expect(Date.parse(payment?.attributes.FechaPago ?? '')).toBe(
          Date.parse(repFixture.snapshot.payment.paidAt),
        );
        expect(normalizeMoney(payment?.attributes.Monto)).toBe('0.58');
        expect(payment?.attributes.MonedaP).toBe('MXN');
        expect(parsedXml.paymentRelatedDocuments).toHaveLength(1);
        expect(normalizeUuid(relatedDocument?.attributes.IdDocumento)).toBe(
          normalizeUuid(originStamp.uuid),
        );
        expect(relatedDocument?.attributes.MetodoDePagoDR).toBe('PPD');
        expect(relatedDocument?.attributes.NumParcialidad).toBe('1');
        expect(normalizeMoney(relatedDocument?.attributes.ImpSaldoAnt)).toBe(
          '1.16',
        );
        expect(normalizeMoney(relatedDocument?.attributes.ImpPagado)).toBe(
          '0.58',
        );
        expect(
          normalizeMoney(relatedDocument?.attributes.ImpSaldoInsoluto),
        ).toBe('0.58');
        expect(relatedDocument?.attributes.ObjetoImpDR).toBe('02');
        expect(normalizeUuid(parsedXml.taxStamp.attributes.UUID)).toBe(
          normalizeUuid(repStamp.uuid),
        );

        const pdfArtifact = await provider.getPdf({
          correlationId: `facturama-sandbox-rep-pdf-${repFixture.folio}`,
          providerKey: repStamp.provider,
          providerDocumentId: repStamp.providerDocumentId,
        });
        expect(pdfArtifact.content.length).toBeGreaterThan(0);

        console.info(
          JSON.stringify({
            contract: 'FACTURAMA_SANDBOX_REP20_STAMP',
            folio: repFixture.folio,
            provider: repStamp.provider,
            providerDocumentId: summarizeProviderDocumentId(
              repStamp.providerDocumentId,
            ),
            sourceUuid: redactUuid(originStamp.uuid),
            uuid: redactUuid(repStamp.uuid),
            status: status.status,
            validations: {
              cfdiVersion: parsedXml.root.attributes.Version === '4.0',
              cfdiType: parsedXml.root.attributes.TipoDeComprobante === 'P',
              receiverCfdiUse: parsedXml.receiver.attributes.UsoCFDI === 'CP01',
              payments20: parsedXml.payments.length === 1,
              relatedUuidMatchesOrigin:
                normalizeUuid(relatedDocument?.attributes.IdDocumento) ===
                normalizeUuid(originStamp.uuid),
              tfdUuidMatchesStamp:
                normalizeUuid(parsedXml.taxStamp.attributes.UUID) ===
                normalizeUuid(repStamp.uuid),
              pdfAvailable: pdfArtifact.content.length > 0,
            },
          }),
        );
      } catch (error) {
        reportSandboxPacRejection(
          error,
          lastSnapshot,
          'FACTURAMA_SANDBOX_REP20_STAMP',
        );
        throw error;
      } finally {
        await moduleFixture?.close();
      }
    },
    FACTURAMA_SANDBOX_STAMP_TEST_TIMEOUT_MS,
  );
});

describe('Facturama protected sandbox credit-note stamp contract', () => {
  it(
    'creates a real origin CFDI and reads back one related partial CFDI E',
    async () => {
      const guarded = getFacturamaSandboxStampConfig();
      if (!guarded.enabled) {
        expect(guarded.reason).toBe(
          'RUN_FACTURAMA_SANDBOX_STAMP must be exactly "true"',
        );
        return;
      }

      const originFixture = buildFixture(guarded);
      let lastSnapshot: CfdiProviderSnapshot = originFixture.snapshot;
      let moduleFixture: TestingModule | undefined;
      try {
        moduleFixture = await buildModule(guarded);
        const provider =
          moduleFixture.get<FiscalProviderPort>(FISCAL_PROVIDER_PORT);

        expect(provider).toBeInstanceOf(FacturamaAdapter);

        const originStamp = await provider.stamp({
          correlationId: `facturama-sandbox-credit-origin-stamp-${originFixture.folio}`,
          idempotencyKey: `facturama-sandbox-credit-origin-idempotency-${originFixture.folio}`,
          series: 'SBX',
          folio: originFixture.folio,
          snapshot: originFixture.snapshot,
        });

        expect(originStamp.provider).toBe('FACTURAMA');
        expect(originStamp.providerDocumentId.trim()).not.toBe('');
        expect(UUID.test(originStamp.uuid)).toBe(true);

        const originStatus = await provider.getStatus({
          correlationId: `facturama-sandbox-credit-origin-status-${originFixture.folio}`,
          providerKey: originStamp.provider,
          providerDocumentId: originStamp.providerDocumentId,
          uuid: originStamp.uuid,
        });
        expect(originStatus.provider).toBe('FACTURAMA');
        expect(originStatus.status).toBe('ACTIVE');
        expect(originStatus.providerDocumentId).toBe(
          originStamp.providerDocumentId,
        );
        expect(normalizeUuid(originStatus.uuid)).toBe(
          normalizeUuid(originStamp.uuid),
        );

        const creditFixture = buildCreditNoteFixture(
          originFixture,
          originStamp.uuid,
        );
        lastSnapshot = creditFixture.snapshot;

        expect(creditFixture.snapshot).toMatchObject({
          cfdiVersion: '4.0',
          cfdiType: 'CREDIT_NOTE',
          fiscalUseCode: 'G02',
          paymentMethodCode: 'PUE',
          exportCode: '01',
          relationships: [
            {
              typeCode: '01',
              relatedUuid: originStamp.uuid,
            },
          ],
        });
        assertMoneyEquation(creditFixture.snapshot.totals);

        const creditStamp = await provider.stamp({
          correlationId: `facturama-sandbox-credit-note-stamp-${creditFixture.folio}`,
          idempotencyKey: `facturama-sandbox-credit-note-idempotency-${creditFixture.folio}`,
          series: 'SBX',
          folio: creditFixture.folio,
          snapshot: creditFixture.snapshot,
        });

        expect(creditStamp.provider).toBe('FACTURAMA');
        expect(creditStamp.providerDocumentId.trim()).not.toBe('');
        expect(UUID.test(creditStamp.uuid)).toBe(true);
        expect(normalizeUuid(creditStamp.tfd.uuid)).toBe(
          normalizeUuid(creditStamp.uuid),
        );

        const status = await provider.getStatus({
          correlationId: `facturama-sandbox-credit-note-status-${creditFixture.folio}`,
          providerKey: creditStamp.provider,
          providerDocumentId: creditStamp.providerDocumentId,
          uuid: creditStamp.uuid,
        });
        expect(status.provider).toBe('FACTURAMA');
        expect(status.status).toBe('ACTIVE');
        expect(status.providerDocumentId).toBe(creditStamp.providerDocumentId);
        expect(normalizeUuid(status.uuid)).toBe(
          normalizeUuid(creditStamp.uuid),
        );

        const xmlArtifact = await provider.getXml({
          correlationId: `facturama-sandbox-credit-note-xml-${creditFixture.folio}`,
          providerKey: creditStamp.provider,
          providerDocumentId: creditStamp.providerDocumentId,
        });
        expect(xmlArtifact.provider).toBe('FACTURAMA');
        expect(xmlArtifact.artifactType).toBe('XML');
        expect(xmlArtifact.contentType).toBe('application/xml');
        expect(xmlArtifact.content.length).toBeGreaterThan(0);
        const parsedXml = parseCfdiXml(
          Buffer.from(xmlArtifact.content).toString('utf8'),
        );

        expect(localName(parsedXml.root.name)).toBe('Comprobante');
        expect(parsedXml.root.attributes.Version).toBe('4.0');
        expect(parsedXml.root.attributes.TipoDeComprobante).toBe('E');
        expect(parsedXml.receiver.attributes.UsoCFDI).toBe('G02');
        expect(parsedXml.root.attributes.MetodoPago).toBe('PUE');
        expect(parsedXml.root.attributes.FormaPago).toBe(
          creditFixture.snapshot.paymentFormCode,
        );
        expect(parsedXml.root.attributes.Exportacion).toBe('01');
        expect(parsedXml.root.attributes.Moneda).toBe(
          creditFixture.snapshot.currencyCode,
        );
        expect(normalizeUuid(parsedXml.taxStamp.attributes.UUID)).toBe(
          normalizeUuid(creditStamp.uuid),
        );
        expect(parsedXml.relationship?.attributes.TipoRelacion).toBe('01');
        expect(parsedXml.relatedDocuments).toHaveLength(1);
        expect(
          normalizeUuid(parsedXml.relatedDocuments[0]?.attributes.UUID),
        ).toBe(normalizeUuid(originStamp.uuid));

        const xmlTotals = {
          subtotal: parsedXml.root.attributes.SubTotal,
          discount: parsedXml.root.attributes.Descuento ?? '0.00',
          tax: parsedXml.taxSummary?.attributes.TotalImpuestosTrasladados,
          total: parsedXml.root.attributes.Total,
        };
        expect(normalizeMoney(xmlTotals.subtotal)).toBe(
          normalizeMoney(creditFixture.snapshot.totals.subtotal),
        );
        expect(normalizeMoney(xmlTotals.discount)).toBe(
          normalizeMoney(creditFixture.snapshot.totals.discount),
        );
        expect(normalizeMoney(xmlTotals.tax)).toBe(
          normalizeMoney(creditFixture.snapshot.totals.tax),
        );
        expect(normalizeMoney(xmlTotals.total)).toBe(
          normalizeMoney(creditFixture.snapshot.totals.total),
        );
        assertMoneyEquation(xmlTotals);

        const pdfArtifact = await provider.getPdf({
          correlationId: `facturama-sandbox-credit-note-pdf-${creditFixture.folio}`,
          providerKey: creditStamp.provider,
          providerDocumentId: creditStamp.providerDocumentId,
        });
        expect(pdfArtifact.provider).toBe('FACTURAMA');
        expect(pdfArtifact.artifactType).toBe('PDF');
        expect(pdfArtifact.contentType).toBe('application/pdf');
        expect(pdfArtifact.content.length).toBeGreaterThan(0);
        expect(Buffer.from(pdfArtifact.content).subarray(0, 4).toString()).toBe(
          '%PDF',
        );

        console.info(
          JSON.stringify({
            contract: 'FACTURAMA_SANDBOX_CREDIT_NOTE_STAMP',
            provider: creditStamp.provider,
            sourceProviderDocumentId: summarizeProviderDocumentId(
              originStamp.providerDocumentId,
            ),
            providerDocumentId: summarizeProviderDocumentId(
              creditStamp.providerDocumentId,
            ),
            sourceUuid: redactUuid(originStamp.uuid),
            uuid: redactUuid(creditStamp.uuid),
            sourceStatus: originStatus.status,
            status: status.status,
            snapshot: {
              cfdiVersion: creditFixture.snapshot.cfdiVersion,
              cfdiType: creditFixture.snapshot.cfdiType,
              facturamaCfdiType: 'E',
              nameId: 2,
              cfdiUse: creditFixture.snapshot.fiscalUseCode,
              paymentMethod: creditFixture.snapshot.paymentMethodCode,
              paymentForm: creditFixture.snapshot.paymentFormCode,
              exportation: creditFixture.snapshot.exportCode,
              currency: creditFixture.snapshot.currencyCode,
              totals: creditFixture.snapshot.totals,
            },
            relationship: {
              type: '01',
              originalUuidMatches:
                normalizeUuid(
                  parsedXml.relatedDocuments[0]?.attributes.UUID,
                ) === normalizeUuid(originStamp.uuid),
            },
            validations: {
              cfdiVersion: parsedXml.root.attributes.Version === '4.0',
              cfdiType: parsedXml.root.attributes.TipoDeComprobante === 'E',
              cfdiUse: parsedXml.receiver.attributes.UsoCFDI === 'G02',
              paymentMethod: parsedXml.root.attributes.MetodoPago === 'PUE',
              paymentForm:
                parsedXml.root.attributes.FormaPago ===
                creditFixture.snapshot.paymentFormCode,
              relationship:
                parsedXml.relationship?.attributes.TipoRelacion === '01',
              total:
                normalizeMoney(xmlTotals.total) ===
                normalizeMoney(creditFixture.snapshot.totals.total),
              currency:
                parsedXml.root.attributes.Moneda ===
                creditFixture.snapshot.currencyCode,
              tfdUuid:
                normalizeUuid(parsedXml.taxStamp.attributes.UUID) ===
                normalizeUuid(creditStamp.uuid),
            },
            getPdf: 'PASS',
          }),
        );
      } catch (error) {
        reportSandboxPacRejection(error, lastSnapshot);
        throw error;
      } finally {
        await moduleFixture?.close();
      }
    },
    FACTURAMA_SANDBOX_STAMP_TEST_TIMEOUT_MS,
  );
});

describe('Facturama protected sandbox UUID comparison', () => {
  const uppercaseUuid = '10B5554C-F56C-44F6-8E67-5A80A1F433C9';

  it('keeps the protected timeout above Jest default and accepts UUID casing', () => {
    expect(FACTURAMA_SANDBOX_STAMP_TEST_TIMEOUT_MS).toBeGreaterThan(5_000);
    expect(normalizeUuid(uppercaseUuid.toLowerCase())).toBe(
      normalizeUuid(uppercaseUuid),
    );
  });

  it('rejects a UUID with a changed hexadecimal character', () => {
    expect(normalizeUuid('10B5554C-F56C-44F6-8E67-5A80A1F433C8')).not.toBe(
      normalizeUuid(uppercaseUuid),
    );
  });
});

describe('Facturama global XML readback parser', () => {
  it('parses the global receiver, period, and case-insensitive TFD UUID locally', () => {
    const stampUuid = '10B5554C-F56C-44F6-8E67-5A80A1F433C9';
    const parsed = parseCfdiXml(
      globalXmlFixture({
        uuid: stampUuid.toLowerCase(),
        periodicity: '01',
        months: '08',
        year: 2026,
      }),
    );

    expect(parsed.root.attributes.Version).toBe('4.0');
    expect(parsed.root.attributes.TipoDeComprobante).toBe('I');
    expect(parsed.root.attributes.Moneda).toBe('MXN');
    expect(parsed.root.attributes.LugarExpedicion).toBe('42501');
    expect(parsed.root.attributes.MetodoPago).toBe('PUE');
    expect(parsed.root.attributes.FormaPago).toBe('01');
    expect(parsed.root.attributes.Exportacion).toBe('01');
    expect(parsed.issuer.attributes.Rfc).toBe(GLOBAL_SANDBOX_ISSUER.taxId);
    expect(parsed.issuer.attributes.Nombre).toBe(
      GLOBAL_SANDBOX_ISSUER.legalName,
    );
    expect(parsed.issuer.attributes.RegimenFiscal).toBe(
      GLOBAL_SANDBOX_ISSUER.fiscalRegime,
    );
    expect(parsed.receiver.attributes.Rfc).toBe(GLOBAL_SANDBOX_RECEIVER.taxId);
    expect(parsed.receiver.attributes.Nombre).toBe(
      GLOBAL_SANDBOX_RECEIVER.legalName,
    );
    expect(parsed.receiver.attributes.RegimenFiscalReceptor).toBe('616');
    expect(parsed.receiver.attributes.UsoCFDI).toBe('S01');
    expect(parsed.receiver.attributes.DomicilioFiscalReceptor).toBe('42501');
    expect(parsed.globalInformationCount).toBe(1);
    expect(parsed.globalInformation?.attributes.Periodicidad).toBe('01');
    expect(parsed.globalInformation?.attributes.Meses).toBe('08');
    expect(parsed.globalInformation?.attributes['Año']).toBe('2026');
    expect(normalizeUuid(parsed.taxStamp.attributes.UUID)).toBe(
      normalizeUuid(stampUuid),
    );
  });
});

describe('Facturama credit-note XML readback parser', () => {
  it('parses relation 01 and proves the Decimal total equation locally', () => {
    const originalUuid = '215CEC43-7E57-44AC-9D63-B54BBC4745BD';
    const parsed = parseCfdiXml(
      creditNoteXmlFixture({
        originalUuid: originalUuid.toLowerCase(),
        stampedUuid: '10B5554C-F56C-44F6-8E67-5A80A1F433C9',
      }),
    );

    expect(parsed.root.attributes.Version).toBe('4.0');
    expect(parsed.root.attributes.TipoDeComprobante).toBe('E');
    expect(parsed.root.attributes.Moneda).toBe('MXN');
    expect(parsed.root.attributes.MetodoPago).toBe('PUE');
    expect(parsed.receiver.attributes.UsoCFDI).toBe('G02');
    expect(parsed.relationship?.attributes.TipoRelacion).toBe('01');
    expect(parsed.relatedDocuments).toHaveLength(1);
    expect(normalizeUuid(parsed.relatedDocuments[0]?.attributes.UUID)).toBe(
      normalizeUuid(originalUuid),
    );
    expect(normalizeUuid(parsed.taxStamp.attributes.UUID)).toBe(
      '10B5554C-F56C-44F6-8E67-5A80A1F433C9',
    );
    assertMoneyEquation({
      subtotal: parsed.root.attributes.SubTotal,
      discount: parsed.root.attributes.Descuento,
      tax: parsed.taxSummary?.attributes.TotalImpuestosTrasladados,
      total: parsed.root.attributes.Total,
    });
  });
});

async function buildModule(
  config: Extract<FacturamaSandboxStampConfig, { enabled: true }>,
): Promise<TestingModule> {
  const resolver: FiscalCredentialResolver = {
    resolve: (reference, environment) => {
      if (
        reference !== config.credentialReference ||
        environment !== 'SANDBOX'
      ) {
        return Promise.reject(new Error('invalid sandbox credential request'));
      }
      return Promise.resolve(config.credentials);
    },
  };

  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        ignoreEnvFile: true,
        load: [
          () => ({
            CFDI_ENABLED: true,
            FISCAL_PROVIDER: 'FACTURAMA',
            FISCAL_PROVIDER_ENVIRONMENT: 'SANDBOX',
            FACTURAMA_API_BASE_URL: FACTURAMA_SANDBOX_BASE_URL,
            FACTURAMA_API_MODE: 'MULTI_ISSUER',
            FACTURAMA_CREDENTIAL_REF: config.credentialReference,
            CFDI_REQUEST_TIMEOUT_MS: 30_000,
            CFDI_MAX_RETRIES: 0,
          }),
        ],
      }),
      CfdiModule,
    ],
  })
    .overrideProvider(FISCAL_CREDENTIAL_RESOLVER)
    .useValue(resolver)
    .compile();
}

function buildFixture(
  config: Extract<FacturamaSandboxStampConfig, { enabled: true }>,
): {
  readonly folio: string;
  readonly issuerRfc: string;
  readonly snapshot: CfdiDocumentSnapshot;
} {
  const folio = uniqueFolio();
  const issuedAt = new Date(Date.now() - 30_000).toISOString();
  const issuerRfc = config.issuer.taxId.toUpperCase();
  const receiver = {
    taxId: optionalEnvironmentValue(
      'FACTURAMA_SANDBOX_RECEIVER_RFC',
      DEFAULT_RECEIVER.taxId,
    ).toUpperCase(),
    legalName: optionalEnvironmentValue(
      'FACTURAMA_SANDBOX_RECEIVER_NAME',
      DEFAULT_RECEIVER.legalName,
    ),
    fiscalRegime: optionalEnvironmentValue(
      'FACTURAMA_SANDBOX_RECEIVER_FISCAL_REGIME',
      DEFAULT_RECEIVER.fiscalRegime,
    ),
    fiscalPostalCode: optionalEnvironmentValue(
      'FACTURAMA_SANDBOX_RECEIVER_POSTAL_CODE',
      DEFAULT_RECEIVER.fiscalPostalCode,
    ),
    fiscalUseCode: optionalEnvironmentValue(
      'FACTURAMA_SANDBOX_RECEIVER_CFDI_USE',
      DEFAULT_RECEIVER.fiscalUseCode,
    ),
  };

  return {
    folio,
    issuerRfc,
    snapshot: {
      cfdiVersion: '4.0',
      cfdiType: 'INCOME',
      billingRequestId: `facturama-sandbox-${folio}`,
      billingRequestVersion: 1,
      issuedAt,
      currencyCode: 'MXN',
      exchangeRate: '1.000000',
      exportCode: '01',
      paymentFormCode: '01',
      paymentMethodCode: 'PUE',
      sourceDocumentIds: [`facturama-sandbox-${folio}`],
      issuer: {
        legalEntityId: 'facturama-sandbox-issuer',
        legalName: config.issuer.legalName,
        taxId: issuerRfc,
        fiscalPostalCode: config.issuer.fiscalPostalCode,
        fiscalRegime: config.issuer.fiscalRegime,
        series: 'SBX',
        certificateSerialNumber: 'sandbox-csd-managed-by-facturama',
        certificateFingerprint: 'sandbox-csd-managed-by-facturama',
      },
      receiver: {
        customerId: 'facturama-sandbox-receiver',
        fiscalName: receiver.legalName,
        taxId: receiver.taxId,
        fiscalPostalCode: receiver.fiscalPostalCode,
        fiscalRegime: receiver.fiscalRegime,
        fiscalUseCode: receiver.fiscalUseCode,
        billingEmail: 'sandbox@example.invalid',
      },
      concepts: [
        {
          lineNumber: 1,
          sourceBillingRequestItemId: `facturama-sandbox-item-${folio}`,
          sourceSaleItemId: `facturama-sandbox-sale-item-${folio}`,
          sourceProductId: 'facturama-sandbox-product',
          productServiceCode: '25173108',
          identificationNumber: 'SANDBOX-TEST',
          description: 'SERVICIO DE PRUEBA CFDI SANDBOX',
          quantity: '1.000000',
          unitCode: 'E48',
          unitValue: '1.00',
          amount: '1.00',
          discount: '0.00',
          taxableBase: '1.00',
          taxObjectCode: '02',
          taxCode: '002',
          factorType: 'Tasa',
          rateOrQuota: '0.160000',
          taxAmount: '0.16',
          total: '1.16',
          snapshotHash: 'facturama-sandbox-fixture',
        },
      ],
      totals: {
        subtotal: '1.00',
        discount: '0.00',
        taxableBase: '1.00',
        tax: '0.16',
        total: '1.16',
      },
      snapshotHash: 'facturama-sandbox-fixture',
    },
  };
}

function buildPpdFixture(
  config: Extract<FacturamaSandboxStampConfig, { enabled: true }>,
): ReturnType<typeof buildFixture> {
  const fixture = buildFixture(config);
  return {
    ...fixture,
    snapshot: {
      ...fixture.snapshot,
      paymentFormCode: '99',
      paymentMethodCode: 'PPD',
    },
  };
}

function buildRepFixture(
  origin: ReturnType<typeof buildPpdFixture>,
  originalUuid: string,
): { readonly folio: string; readonly snapshot: CfdiPaymentReceiptSnapshot } {
  const paymentPaidAt = new Date().toISOString();
  const amountPaid = '0.58';
  const previousBalance = origin.snapshot.totals.total;
  const relatedDocument = {
    relatedInvoiceId: origin.snapshot.sourceDocumentIds[0] ?? 'sandbox-invoice',
    relatedUuid: originalUuid,
    relatedSeries: origin.snapshot.issuer.series,
    relatedFolio: origin.folio,
    documentCurrencyCode: 'MXN',
    equivalenceDr: '1.000000',
    paymentMethodDr: 'PPD' as const,
    partialityNumber: 1,
    previousBalanceAmount: previousBalance,
    amountPaid,
    remainingBalance: '0.58',
    taxObjectCode: '02',
    taxesSnapshot: [
      {
        taxCode: '002',
        factorType: 'Tasa',
        rateOrQuota: '0.160000',
        base: '0.50',
        amount: '0.08',
      },
    ],
  } as const;

  return {
    folio: uniqueFolio(),
    snapshot: {
      cfdiVersion: '4.0',
      cfdiType: 'PAYMENT_RECEIPT',
      paymentId: `facturama-sandbox-payment-${origin.folio}`,
      paymentReceiptId: `facturama-sandbox-receipt-${origin.folio}`,
      issuedAt: new Date().toISOString(),
      currencyCode: 'XXX',
      exchangeRate: '1.000000',
      exportCode: '01',
      paymentFormCode: null,
      paymentMethodCode: null,
      sourceDocumentIds: origin.snapshot.sourceDocumentIds,
      issuer: origin.snapshot.issuer,
      receiver: {
        ...origin.snapshot.receiver,
        fiscalUseCode: 'CP01',
      },
      payment: {
        paidAt: paymentPaidAt,
        paymentFormCode: '03',
        currencyCode: 'MXN',
        exchangeRateToMxn: '1.000000',
        amount: amountPaid,
        taxes: relatedDocument.taxesSnapshot,
        relatedDocuments: [relatedDocument],
      },
      concepts: [],
      totals: {
        subtotal: '0.00',
        discount: '0.00',
        taxableBase: '0.00',
        tax: '0.00',
        total: '0.00',
      },
      snapshotHash: 'facturama-sandbox-rep-fixture',
    },
  };
}

function buildCreditNoteFixture(
  origin: ReturnType<typeof buildFixture>,
  originalUuid: string,
): {
  readonly folio: string;
  readonly snapshot: CfdiCreditNoteSnapshot;
} {
  const originalInvoiceId = origin.snapshot.sourceDocumentIds[0];
  const original = origin.snapshot.concepts[0];
  if (!originalInvoiceId || !original) {
    throw new Error('Facturama Sandbox source fixture is incomplete');
  }

  const built = buildCreditNoteDocument({
    creditAdjustmentId: `facturama-sandbox-credit-${origin.folio}`,
    creditAdjustmentVersion: 1,
    issuedAt: new Date(Date.now() - 30_000),
    sourceType: 'BONUS',
    currencyCode: origin.snapshot.currencyCode,
    exchangeRate: new Prisma.Decimal(origin.snapshot.exchangeRate),
    paymentFormCode: origin.snapshot.paymentFormCode,
    issuer: origin.snapshot.issuer,
    receiver: origin.snapshot.receiver,
    applications: [
      {
        originalInvoiceId,
        originalUuid,
        relationshipTypeCode: '01',
        concepts: [
          {
            creditAdjustmentLineId: `facturama-sandbox-credit-line-${origin.folio}`,
            originalInvoiceConceptId: `${origin.folio}-concept-1`,
            creditTotal: new Prisma.Decimal('0.58'),
            availableTotal: new Prisma.Decimal(original.total),
            original: {
              sourceSaleItemId: original.sourceSaleItemId || null,
              productServiceCode: original.productServiceCode,
              identificationNumber: original.identificationNumber,
              description: original.description,
              quantity: new Prisma.Decimal(original.quantity),
              unitCode: original.unitCode,
              unitValue: new Prisma.Decimal(original.unitValue),
              amount: new Prisma.Decimal(original.amount),
              discount: new Prisma.Decimal(original.discount),
              taxableBase: new Prisma.Decimal(original.taxableBase),
              taxObjectCode: original.taxObjectCode,
              taxCode: original.taxCode || null,
              factorType: original.factorType || null,
              rateOrQuota: new Prisma.Decimal(original.rateOrQuota),
              taxAmount: new Prisma.Decimal(original.taxAmount),
              total: new Prisma.Decimal(original.total),
              taxesSnapshot: [
                {
                  taxCode: original.taxCode,
                  factorType: original.factorType,
                  rateOrQuota: original.rateOrQuota,
                  base: original.taxableBase,
                  amount: original.taxAmount,
                },
              ],
            },
          },
        ],
      },
    ],
  });

  return { folio: uniqueFolio(), snapshot: built.snapshot };
}

function buildGlobalFixture(
  config: Extract<FacturamaSandboxStampConfig, { enabled: true }>,
): {
  readonly folio: string;
  readonly issuerRfc: string;
  readonly snapshot: CfdiDocumentSnapshot;
} {
  expect(config.issuer.taxId.toUpperCase()).toBe(GLOBAL_SANDBOX_ISSUER.taxId);
  expect(config.issuer.legalName).toBe(GLOBAL_SANDBOX_ISSUER.legalName);
  expect(config.issuer.fiscalRegime).toBe(GLOBAL_SANDBOX_ISSUER.fiscalRegime);
  expect(config.issuer.fiscalPostalCode).toBe(
    GLOBAL_SANDBOX_ISSUER.fiscalPostalCode,
  );

  const issuedAt = new Date();
  const period = currentFiscalPeriod(issuedAt);
  const fixture = buildFixture(config);

  return {
    ...fixture,
    issuerRfc: GLOBAL_SANDBOX_ISSUER.taxId,
    snapshot: {
      ...fixture.snapshot,
      issuedAt: issuedAt.toISOString(),
      paymentFormCode: '01',
      paymentMethodCode: 'PUE',
      exportCode: '01',
      issuer: {
        ...fixture.snapshot.issuer,
        legalName: GLOBAL_SANDBOX_ISSUER.legalName,
        taxId: GLOBAL_SANDBOX_ISSUER.taxId,
        fiscalPostalCode: GLOBAL_SANDBOX_ISSUER.fiscalPostalCode,
        fiscalRegime: GLOBAL_SANDBOX_ISSUER.fiscalRegime,
      },
      receiver: {
        ...fixture.snapshot.receiver,
        fiscalName: GLOBAL_SANDBOX_RECEIVER.legalName,
        taxId: GLOBAL_SANDBOX_RECEIVER.taxId,
        fiscalPostalCode: GLOBAL_SANDBOX_RECEIVER.fiscalPostalCode,
        fiscalRegime: GLOBAL_SANDBOX_RECEIVER.fiscalRegime,
        fiscalUseCode: GLOBAL_SANDBOX_RECEIVER.fiscalUseCode,
      },
      globalInformation: {
        periodicity: '01',
        months: period.months,
        year: period.year,
      },
    },
  };
}

function currentFiscalPeriod(
  instant: Date,
): Pick<CfdiGlobalInformation, 'months' | 'year'> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(instant);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const months = values.month;
  const year = Number(values.year);
  if (
    !months ||
    !/^(?:0[1-9]|1[0-2])$/.test(months) ||
    !Number.isInteger(year)
  ) {
    throw new Error('Unable to derive the current Sandbox fiscal period');
  }
  return {
    months: months as CfdiGlobalInformation['months'],
    year,
  };
}

function parseCfdiXml(xml: string): ParsedCfdiXml {
  if (!xml.trim()) throw new Error('Facturama returned an empty XML artifact');

  const parser = new SaxesParser({ xmlns: false });
  let depth = 0;
  let root: ParsedXmlElement | undefined;
  let issuer: ParsedXmlElement | undefined;
  let receiver: ParsedXmlElement | undefined;
  let taxStamp: ParsedXmlElement | undefined;
  let taxSummary: ParsedXmlElement | undefined;
  let relationship: ParsedXmlElement | undefined;
  const relatedDocuments: ParsedXmlElement[] = [];
  const payments: ParsedXmlElement[] = [];
  const paymentRelatedDocuments: ParsedXmlElement[] = [];
  let globalInformation: ParsedXmlElement | undefined;
  let globalInformationCount = 0;
  let parseError: unknown;

  parser.on('opentag', (node) => {
    const element: ParsedXmlElement = {
      name: node.name,
      attributes: Object.fromEntries(
        Object.entries(node.attributes).map(([name, value]) => [
          name,
          attributeValue(value),
        ]),
      ),
    };
    depth += 1;
    if (depth === 1) root = element;
    if (localName(element.name) === 'Emisor') issuer = element;
    if (localName(element.name) === 'Receptor') receiver = element;
    if (localName(element.name) === 'Impuestos' && depth === 2) {
      taxSummary = element;
    }
    if (localName(element.name) === 'CfdiRelacionados') {
      relationship = element;
    }
    if (localName(element.name) === 'CfdiRelacionado') {
      relatedDocuments.push(element);
    }
    if (localName(element.name) === 'Pago') payments.push(element);
    if (localName(element.name) === 'DoctoRelacionado') {
      paymentRelatedDocuments.push(element);
    }
    if (localName(element.name) === 'InformacionGlobal') {
      globalInformationCount += 1;
      globalInformation ??= element;
    }
    if (localName(element.name) === 'TimbreFiscalDigital') {
      taxStamp = element;
    }
  });
  parser.on('closetag', () => {
    depth -= 1;
  });
  parser.on('error', (error) => {
    parseError = error;
  });

  try {
    parser.write(xml).close();
  } catch (error) {
    parseError = error;
  }

  if (parseError || depth !== 0 || !root || !issuer || !receiver || !taxStamp) {
    throw new Error('Facturama returned malformed or incomplete CFDI XML');
  }
  return {
    root,
    issuer,
    receiver,
    taxStamp,
    taxSummary,
    relationship,
    relatedDocuments,
    payments,
    paymentRelatedDocuments,
    globalInformation,
    globalInformationCount,
  };
}

function globalXmlFixture(input: {
  readonly uuid: string;
  readonly periodicity: string;
  readonly months: string;
  readonly year: number;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" TipoDeComprobante="I" Moneda="MXN" Total="1.16" FormaPago="01" MetodoPago="PUE" Exportacion="01" LugarExpedicion="42501">
  <cfdi:Emisor Rfc="EKU9003173C9" Nombre="ESCUELA KEMPER URGATE" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="PUBLICO EN GENERAL" RegimenFiscalReceptor="616" UsoCFDI="S01" DomicilioFiscalReceptor="42501"/>
  <cfdi:InformacionGlobal Periodicidad="${input.periodicity}" Meses="${input.months}" Año="${input.year}"/>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="${input.uuid}"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}

function creditNoteXmlFixture(input: {
  readonly originalUuid: string;
  readonly stampedUuid: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" TipoDeComprobante="E" Moneda="MXN" SubTotal="0.50" Descuento="0.00" Total="0.58" FormaPago="01" MetodoPago="PUE" Exportacion="01" LugarExpedicion="42501">
  <cfdi:Emisor Rfc="EKU9003173C9" Nombre="ESCUELA KEMPER URGATE" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="URE180429TM6" Nombre="UNIVERSIDAD ROBOTICA ESPAÑOLA" RegimenFiscalReceptor="601" UsoCFDI="G02" DomicilioFiscalReceptor="86991"/>
  <cfdi:CfdiRelacionados TipoRelacion="01">
    <cfdi:CfdiRelacionado UUID="${input.originalUuid}"/>
  </cfdi:CfdiRelacionados>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="25173108" Cantidad="1" ClaveUnidad="E48" Descripcion="SERVICIO DE PRUEBA CFDI SANDBOX" ValorUnitario="0.50" Importe="0.50" ObjetoImp="02"/>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="0.08"/>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="${input.stampedUuid}"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}

function attributeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (
    value &&
    typeof value === 'object' &&
    'value' in value &&
    typeof value.value === 'string'
  ) {
    return value.value;
  }
  return '';
}

function assertMoneyEquation(totals: {
  readonly subtotal: string | undefined;
  readonly discount: string | undefined;
  readonly tax: string | undefined;
  readonly total: string | undefined;
}): void {
  const subtotal = new Prisma.Decimal(normalizeMoney(totals.subtotal));
  const discount = new Prisma.Decimal(normalizeMoney(totals.discount));
  const tax = new Prisma.Decimal(normalizeMoney(totals.tax));
  const total = new Prisma.Decimal(normalizeMoney(totals.total));

  expect(subtotal.minus(discount).plus(tax).toFixed(2)).toBe(total.toFixed(2));
}

function reportSandboxPacRejection(
  error: unknown,
  snapshot: CfdiProviderSnapshot,
  contract = 'FACTURAMA_SANDBOX_CREDIT_NOTE_STAMP',
): void {
  if (
    !(error instanceof FiscalProviderError) ||
    ![400, 422].includes(error.statusCode ?? 0)
  ) {
    return;
  }

  const documentationExpectation =
    contract === 'FACTURAMA_SANDBOX_REP20_STAMP'
      ? {
          facturamaCfdiType: 'P',
          nameId: 14,
          receiverCfdiUse: 'CP01',
          paymentForm: '03',
          relatedDocumentPaymentMethod: 'PPD',
          pagosVersion: '2.0',
        }
      : {
          facturamaCfdiType: 'E',
          nameId: 2,
          receiverCfdiUse: 'G02',
          paymentMethod: 'PUE',
          relationshipType: '01',
        };

  console.error(
    JSON.stringify({
      contract,
      provider: 'FACTURAMA',
      rejection: {
        operation: error.operation,
        httpStatus: error.statusCode,
        code: error.code,
        rejectedFieldOrStructure: 'unavailable_without_provider_body',
      },
      documentationExpectation,
      snapshot: summarizeSnapshot(snapshot),
    }),
  );
}

function summarizeSnapshot(snapshot: CfdiProviderSnapshot) {
  const summary = {
    cfdiVersion: snapshot.cfdiVersion,
    cfdiType: snapshot.cfdiType,
    paymentFormCode: snapshot.paymentFormCode,
    paymentMethodCode: snapshot.paymentMethodCode,
    currencyCode: snapshot.currencyCode,
    totals: snapshot.totals,
  };
  if (snapshot.cfdiType !== 'CREDIT_NOTE') return summary;
  return {
    ...summary,
    relationship: {
      type: snapshot.relationships[0]?.typeCode,
      originalUuid: redactUuid(snapshot.relationships[0]?.relatedUuid ?? ''),
    },
  };
}

function localName(name: string): string {
  return name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
}

function normalizeMoney(value: string | undefined): string {
  if (!value?.trim() || !/^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    throw new Error('Facturama returned an invalid monetary XML attribute');
  }
  const [integer, fraction = ''] = value.trim().split('.');
  return `${BigInt(integer)}.${fraction.replace(/0+$/, '') || '0'}`;
}

function normalizeUuid(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? '';
}

function uniqueFolio(): string {
  const runId = safeToken(process.env.GITHUB_RUN_ID) || 'LOCAL';
  const attempt = safeToken(process.env.GITHUB_RUN_ATTEMPT) || '1';
  const timestamp = Date.now().toString(36).toUpperCase();
  const nonce = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
  return `SBX-${runId.slice(0, 8)}-${attempt.slice(0, 4)}-${timestamp}-${nonce}`.slice(
    0,
    40,
  );
}

function safeToken(value: string | undefined): string {
  return value?.replace(/[^A-Za-z0-9]/g, '').toUpperCase() ?? '';
}

function optionalEnvironmentValue(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function redactUuid(uuid: string): string {
  return `${uuid.slice(0, 8)}...${uuid.slice(-4)}`;
}

function summarizeProviderDocumentId(value: string | null | undefined) {
  const normalized = value ?? '';

  return {
    length: normalized.length,
    sha256: createHash('sha256').update(normalized).digest('hex'),
    outsideHistoricalAllowlist: !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(
      normalized,
    ),
  };
}
