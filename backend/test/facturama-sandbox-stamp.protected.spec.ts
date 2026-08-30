import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
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
import type { CfdiDocumentSnapshot } from '../src/modules/cfdi/domain/cfdi-document.types';
import {
  FISCAL_PROVIDER_PORT,
  FiscalProviderError,
  type FiscalProviderPort,
} from '../src/modules/cfdi/domain/fiscal-provider.port';

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
}

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
            providerDocumentId: stamp.providerDocumentId,
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
            providerDocumentId: stamp.providerDocumentId,
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

function parseCfdiXml(xml: string): ParsedCfdiXml {
  if (!xml.trim()) throw new Error('Facturama returned an empty XML artifact');

  const parser = new SaxesParser({ xmlns: false });
  let depth = 0;
  let root: ParsedXmlElement | undefined;
  let issuer: ParsedXmlElement | undefined;
  let receiver: ParsedXmlElement | undefined;
  let taxStamp: ParsedXmlElement | undefined;
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
  return { root, issuer, receiver, taxStamp };
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

function normalizeUuid(value: string | undefined): string {
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
