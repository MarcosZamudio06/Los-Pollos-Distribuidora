import { ConfigService } from '@nestjs/config';
import { assertAllowlistedFacturamaBaseUrl } from '../../../../config/fiscal-provider-url';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  FiscalArtifactCommand,
  FiscalArtifactContent,
  FiscalArtifactReference,
  FiscalCancelCommand,
  FiscalCancellationResponse,
  FiscalCancellationStatus,
  FiscalIssueCommand,
  FiscalProviderEnvironment,
  FiscalProviderOperation,
  FiscalProviderPort,
  FiscalStatusCommand,
  FiscalStatusResponse,
  FiscalStampResponse,
  FiscalTfdMetadata,
} from '../../domain/fiscal-provider.port';
import { FiscalProviderError } from '../../domain/fiscal-provider.port';
import type { CfdiPaymentTaxSnapshot } from '../../domain/cfdi-document.types';
import {
  FISCAL_CREDENTIAL_RESOLVER,
  type FiscalCredentialResolver,
  type FiscalProviderCredential,
} from '../fiscal-credential.resolver';

const FACTURAMA_PROVIDER = 'FACTURAMA' as const;
const FACTURAMA_MULTI_ISSUER_MODE = 'MULTI_ISSUER';
const FACTURAMA_DOCUMENT_TYPE = 'issuedLite';
const MAX_FACTURAMA_RESPONSE_BYTES = 16 * 1024 * 1024;
const SAFE_CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonObject = Record<string, unknown>;

interface FacturamaTax {
  Name: string;
  Rate: string;
  Total: string;
  Base: string;
  IsRetention: boolean;
  IsFederalTax: boolean;
  IsQuota?: boolean;
}

interface FacturamaItem {
  ProductCode: string;
  IdentificationNumber?: string;
  Description: string;
  UnitCode: string;
  UnitPrice: string;
  Quantity: string;
  Subtotal: string;
  Discount: string;
  TaxObject: string;
  Taxes?: FacturamaTax[];
  Total: string;
}

interface FacturamaIssuePayload {
  CfdiType: 'I' | 'E';
  NameId: 1 | 2;
  ExpeditionPlace: string;
  Date: string;
  Serie?: string;
  Folio: string;
  PaymentForm: string;
  PaymentMethod: string;
  Currency: string;
  CurrencyExchangeRate?: string;
  Exportation: string;
  Issuer: {
    FiscalRegime: string;
    Rfc: string;
    Name: string;
  };
  Receiver: {
    CfdiUse: string;
    Rfc: string;
    Name: string;
    FiscalRegime: string;
    TaxZipCode: string;
  };
  Items: FacturamaItem[];
  Relations?: {
    Type: '01' | '03';
    Cfdis: Array<{ Uuid: string }>;
  };
}

interface FacturamaPaymentRelatedDocument {
  TaxObject: string;
  Uuid: string;
  Serie?: string;
  Folio?: string;
  Currency: string;
  EquivalenceDocRel: string;
  PaymentMethod: 'PPD';
  PartialityNumber: number;
  PreviousBalanceAmount: string;
  AmountPaid: string;
  ImpSaldoInsoluto: string;
  Taxes?: FacturamaTax[];
}

interface FacturamaPaymentNode {
  Date: string;
  PaymentForm: string;
  Amount: string;
  Currency: string;
  ExchangeRate?: string;
  RelatedDocuments: FacturamaPaymentRelatedDocument[];
  Taxes?: FacturamaTax[];
}

interface FacturamaPaymentReceiptPayload {
  CfdiType: 'P';
  NameId: 14;
  ExpeditionPlace: string;
  Date: string;
  Serie?: string;
  Folio: string;
  Exportation: '01';
  Issuer: {
    FiscalRegime: string;
    Rfc: string;
    Name: string;
  };
  Receiver: {
    CfdiUse: 'CP01';
    Rfc: string;
    Name: string;
    FiscalRegime: string;
    TaxZipCode: string;
  };
  Complemento: { Payments: FacturamaPaymentNode[] };
}

interface FacturamaFileResponse {
  ContentEncoding?: unknown;
  ContentType?: unknown;
  ContentLength?: unknown;
  Content?: unknown;
}

interface FacturamaTaxStamp {
  Uuid?: unknown;
  Date?: unknown;
  CfdiSign?: unknown;
  SatSign?: unknown;
  SatCertNumber?: unknown;
  RfcProvCertif?: unknown;
}

interface FacturamaCancellationResponse {
  Status?: unknown;
  RequestDate?: unknown;
  CancelationDate?: unknown;
  AcuseXmlBase64?: unknown;
}

interface FacturamaInvoiceResponse extends JsonObject {
  Id?: unknown;
  Date?: unknown;
  Status?: unknown;
  IsCanceled?: unknown;
  Complement?: {
    TaxStamp?: FacturamaTaxStamp;
  };
}

interface FiscalHttpResult {
  status: number;
  body: unknown;
}

type FetchLike = typeof fetch;

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function requiredString(
  value: unknown,
  operation: FiscalProviderOperation,
  correlationId: string,
): string {
  const result = stringValue(value);
  if (!result) {
    throw new FiscalProviderError(
      'FISCAL_PROVIDER_RESPONSE_INVALID',
      operation,
      correlationId,
      null,
      false,
    );
  }
  return result;
}

function isoTimestamp(
  value: unknown,
  operation: FiscalProviderOperation,
  correlationId: string,
): string {
  const result = requiredString(value, operation, correlationId);
  const timestamp = new Date(result);
  if (Number.isNaN(timestamp.valueOf())) {
    throw new FiscalProviderError(
      'FISCAL_PROVIDER_RESPONSE_INVALID',
      operation,
      correlationId,
      null,
      false,
    );
  }
  // Facturama's documented examples omit an offset. Do not reinterpret that
  // provider-local wall clock as the host process timezone; preserve it in a
  // deterministic ISO-like form and normalize only values with an offset.
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(result)
    ? timestamp.toISOString()
    : result.replace(' ', 'T');
}

function providerDocumentId(
  value: unknown,
  operation: FiscalProviderOperation,
  correlationId: string,
): string {
  const result = requiredString(value, operation, correlationId);
  if (!SAFE_PROVIDER_ID.test(result)) {
    throw new FiscalProviderError(
      'FISCAL_PROVIDER_RESPONSE_INVALID',
      operation,
      correlationId,
      null,
      false,
    );
  }
  return result;
}

function requiredUuid(
  value: unknown,
  operation: FiscalProviderOperation,
  correlationId: string,
): string {
  const result = requiredString(value, operation, correlationId);
  if (!UUID.test(result)) {
    throw new FiscalProviderError(
      'FISCAL_PROVIDER_RESPONSE_INVALID',
      operation,
      correlationId,
      null,
      false,
    );
  }
  return result.toUpperCase();
}

function safeCorrelationId(value: string, operation: FiscalProviderOperation) {
  const normalized = value.trim();
  if (!SAFE_CORRELATION_ID.test(normalized)) {
    throw new FiscalProviderError(
      'FISCAL_PROVIDER_CONFIGURATION',
      operation,
      'UNKNOWN',
    );
  }
  return normalized;
}

function assertProviderKey(
  providerKey: string | undefined,
  operation: FiscalProviderOperation,
  correlationId: string,
): void {
  if (
    providerKey !== undefined &&
    providerKey.trim().toUpperCase() !== FACTURAMA_PROVIDER
  ) {
    throw new FiscalProviderError(
      'FISCAL_PROVIDER_CONFIGURATION',
      operation,
      correlationId,
      null,
      false,
    );
  }
}

function taxName(code: string): string {
  switch (code.trim().toUpperCase()) {
    case '001':
      return 'ISR';
    case '002':
      return 'IVA';
    case '003':
      return 'IEPS';
    default:
      throw new Error('Unsupported SAT tax code');
  }
}

function buildTax(
  concept: FiscalIssueCommand['snapshot']['concepts'][number],
): FacturamaTax {
  const factorType = concept.factorType.trim().toLowerCase();
  const name =
    factorType === 'exento'
      ? `${taxName(concept.taxCode)} Exento`
      : taxName(concept.taxCode);
  return {
    Name: name,
    Rate: factorType === 'exento' ? '0' : concept.rateOrQuota,
    Total: concept.taxAmount,
    Base: concept.taxableBase,
    IsRetention: false,
    IsFederalTax: true,
    ...(factorType === 'cuota' ? { IsQuota: true } : {}),
  };
}

function paymentTaxName(tax: CfdiPaymentTaxSnapshot): string {
  let name = taxName(tax.taxCode);
  if (tax.isRetention) name = `${name} RET`;
  if (tax.factorType.trim().toLowerCase() === 'exento') name = `${name} Exento`;
  return name;
}

function paymentTaxes(
  value: unknown,
  operation: FiscalProviderOperation,
  correlationId: string,
): FacturamaTax[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map((entry) => {
    if (!isObject(entry)) {
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_VALIDATION',
        operation,
        correlationId,
        null,
        false,
      );
    }
    const taxCode = stringValue(entry.taxCode ?? entry.code);
    const factorType = stringValue(entry.factorType ?? entry.type);
    const rateOrQuota = stringValue(entry.rateOrQuota ?? entry.rate);
    const base = stringValue(entry.base ?? entry.taxableBase);
    const amount = stringValue(entry.amount ?? entry.taxAmount);
    const normalizedFactorType = factorType?.trim().toLowerCase();
    if (
      !taxCode ||
      !factorType ||
      !rateOrQuota ||
      !base ||
      !amount ||
      !normalizedFactorType ||
      !['tasa', 'cuota', 'exento'].includes(normalizedFactorType) ||
      !/^\d+(?:\.\d{1,6})?$/.test(rateOrQuota) ||
      !/^\d+(?:\.\d{1,6})?$/.test(base) ||
      !/^\d+(?:\.\d{1,6})?$/.test(amount) ||
      Number(base) <= 0
    ) {
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_VALIDATION',
        operation,
        correlationId,
        null,
        false,
      );
    }
    let name: string;
    try {
      name = paymentTaxName({
        taxCode,
        factorType,
        rateOrQuota,
        base,
        amount,
        ...(entry.isRetention === true ? { isRetention: true } : {}),
      });
    } catch {
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_VALIDATION',
        operation,
        correlationId,
        null,
        false,
      );
    }
    const tax = {
      Name: name,
      Rate: normalizedFactorType === 'exento' ? '0' : rateOrQuota,
      Total: amount,
      Base: base,
      IsRetention: entry.isRetention === true,
      IsFederalTax: true,
      ...(normalizedFactorType === 'cuota' ? { IsQuota: true } : {}),
    } satisfies FacturamaTax;
    return tax;
  });
}

function buildItem(
  concept: FiscalIssueCommand['snapshot']['concepts'][number],
  operation: FiscalProviderOperation,
  correlationId: string,
): FacturamaItem {
  const taxObjectCode = concept.taxObjectCode.trim();
  const taxAmountIsPositive = Number(concept.taxAmount) > 0;
  const supportsTaxBreakdown = taxObjectCode === '02';

  if (taxAmountIsPositive && !supportsTaxBreakdown) {
    throw new FiscalProviderError(
      'FISCAL_PROVIDER_VALIDATION',
      operation,
      correlationId,
      null,
      false,
    );
  }

  const factorType = concept.factorType.trim().toLowerCase();
  if (!['tasa', 'cuota', 'exento'].includes(factorType)) {
    throw new FiscalProviderError(
      'FISCAL_PROVIDER_VALIDATION',
      operation,
      correlationId,
      null,
      false,
    );
  }

  let tax: FacturamaTax | undefined;
  if (supportsTaxBreakdown) {
    try {
      tax = buildTax(concept);
    } catch {
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_VALIDATION',
        operation,
        correlationId,
        null,
        false,
      );
    }
  }

  return {
    ProductCode: concept.productServiceCode,
    ...(concept.identificationNumber
      ? { IdentificationNumber: concept.identificationNumber }
      : {}),
    Description: concept.description,
    UnitCode: concept.unitCode,
    UnitPrice: concept.unitValue,
    Quantity: concept.quantity,
    Subtotal: concept.amount,
    Discount: concept.discount,
    TaxObject: taxObjectCode,
    ...(tax ? { Taxes: [tax] } : {}),
    Total: concept.total,
  };
}

function buildIssuePayload(
  command: FiscalIssueCommand,
  operation: FiscalProviderOperation,
): FacturamaIssuePayload | FacturamaPaymentReceiptPayload {
  const snapshot = command.snapshot;
  const correlationId = command.correlationId;
  const folio = command.folio.trim();
  if (!folio || folio.includes('|') || folio.length > 40) {
    throw new FiscalProviderError(
      'FISCAL_PROVIDER_CONFIGURATION',
      operation,
      correlationId,
    );
  }

  if (snapshot.cfdiType === 'PAYMENT_RECEIPT') {
    const relatedDocuments = snapshot.payment.relatedDocuments.map(
      (document) => {
        const taxes = paymentTaxes(
          document.taxesSnapshot,
          operation,
          correlationId,
        );
        if (document.taxObjectCode === '02' && taxes.length === 0) {
          throw new FiscalProviderError(
            'FISCAL_PROVIDER_VALIDATION',
            operation,
            correlationId,
            null,
            false,
          );
        }
        return {
          TaxObject: document.taxObjectCode,
          Uuid: document.relatedUuid,
          ...(document.relatedSeries ? { Serie: document.relatedSeries } : {}),
          ...(document.relatedFolio ? { Folio: document.relatedFolio } : {}),
          Currency: document.documentCurrencyCode,
          EquivalenceDocRel: document.equivalenceDr,
          PaymentMethod: document.paymentMethodDr,
          PartialityNumber: document.partialityNumber,
          PreviousBalanceAmount: document.previousBalanceAmount,
          AmountPaid: document.amountPaid,
          ImpSaldoInsoluto: document.remainingBalance,
          ...(taxes.length > 0 ? { Taxes: taxes } : {}),
        };
      },
    );
    if (relatedDocuments.length === 0) {
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_VALIDATION',
        operation,
        correlationId,
        null,
        false,
      );
    }
    return {
      CfdiType: 'P',
      NameId: 14,
      ExpeditionPlace: snapshot.issuer.fiscalPostalCode,
      Date: snapshot.issuedAt,
      ...(command.series?.trim() || snapshot.issuer.series
        ? { Serie: command.series?.trim() || snapshot.issuer.series }
        : {}),
      Folio: folio,
      Exportation: '01',
      Issuer: {
        FiscalRegime: snapshot.issuer.fiscalRegime,
        Rfc: snapshot.issuer.taxId,
        Name: snapshot.issuer.legalName.toUpperCase(),
      },
      Receiver: {
        CfdiUse: 'CP01',
        Rfc: snapshot.receiver.taxId,
        Name: snapshot.receiver.fiscalName.toUpperCase(),
        FiscalRegime: snapshot.receiver.fiscalRegime,
        TaxZipCode: snapshot.receiver.fiscalPostalCode,
      },
      Complemento: {
        Payments: [
          {
            Date: snapshot.payment.paidAt,
            PaymentForm: snapshot.payment.paymentFormCode,
            Amount: snapshot.payment.amount,
            Currency: snapshot.payment.currencyCode,
            ...(snapshot.payment.currencyCode === 'MXN'
              ? {}
              : { ExchangeRate: snapshot.payment.exchangeRateToMxn }),
            RelatedDocuments: relatedDocuments,
            ...(snapshot.payment.taxes && snapshot.payment.taxes.length > 0
              ? {
                  Taxes: paymentTaxes(
                    snapshot.payment.taxes,
                    operation,
                    correlationId,
                  ),
                }
              : {}),
          },
        ],
      },
    };
  }

  let items: FacturamaItem[];
  try {
    items = snapshot.concepts.map((concept) =>
      buildItem(concept, operation, correlationId),
    );
  } catch (error) {
    if (error instanceof FiscalProviderError) throw error;
    throw new FiscalProviderError(
      'FISCAL_PROVIDER_VALIDATION',
      operation,
      correlationId,
    );
  }

  const creditNote = snapshot.cfdiType === 'CREDIT_NOTE';
  let relations: FacturamaIssuePayload['Relations'];
  if (creditNote) {
    const firstType = snapshot.relationships[0]?.typeCode;
    if (
      !firstType ||
      snapshot.relationships.some(
        (relationship) =>
          relationship.typeCode !== firstType ||
          !UUID.test(relationship.relatedUuid),
      )
    ) {
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_VALIDATION',
        operation,
        correlationId,
        null,
        false,
      );
    }
    relations = {
      Type: firstType,
      Cfdis: snapshot.relationships.map((relationship) => ({
        Uuid: relationship.relatedUuid,
      })),
    };
  }

  return {
    CfdiType: creditNote ? 'E' : 'I',
    NameId: creditNote ? 2 : 1,
    ExpeditionPlace: snapshot.issuer.fiscalPostalCode,
    Date: snapshot.issuedAt,
    ...(command.series?.trim() || snapshot.issuer.series
      ? { Serie: command.series?.trim() || snapshot.issuer.series }
      : {}),
    Folio: folio,
    PaymentForm: snapshot.paymentFormCode,
    PaymentMethod: snapshot.paymentMethodCode,
    Currency: snapshot.currencyCode,
    ...(snapshot.currencyCode === 'MXN'
      ? {}
      : { CurrencyExchangeRate: snapshot.exchangeRate }),
    Exportation: snapshot.exportCode,
    Issuer: {
      FiscalRegime: snapshot.issuer.fiscalRegime,
      Rfc: snapshot.issuer.taxId,
      Name: snapshot.issuer.legalName.toUpperCase(),
    },
    Receiver: {
      CfdiUse: creditNote ? 'G02' : snapshot.receiver.fiscalUseCode,
      Rfc: snapshot.receiver.taxId,
      Name: snapshot.receiver.fiscalName.toUpperCase(),
      FiscalRegime: snapshot.receiver.fiscalRegime,
      TaxZipCode: snapshot.receiver.fiscalPostalCode,
    },
    ...(relations ? { Relations: relations } : {}),
    Items: items,
  };
}

function cancellationStatus(value: unknown): FiscalCancellationStatus | null {
  const status = stringValue(value)?.toLowerCase();
  switch (status) {
    case 'canceled':
    case 'cancelled':
    case 'acepted':
    case 'accepted':
    case 'expired':
      return 'CANCELLED';
    case 'pending':
    case 'requested':
      return 'PENDING';
    case 'rejected':
      return 'REJECTED';
    case 'active':
      return 'ACTIVE';
    default:
      return null;
  }
}

function documentStatus(
  value: unknown,
  isCanceled: unknown,
): FiscalStatusResponse['status'] {
  const cancellation = cancellationStatus(value);
  if (cancellation === 'CANCELLED') return 'CANCELLED';
  if (cancellation === 'PENDING') return 'CANCEL_PENDING';
  if (cancellation === 'REJECTED') return 'CANCEL_REJECTED';
  if (cancellation === 'ACTIVE') return 'ACTIVE';
  if (isCanceled === true) return 'CANCELLED';
  if (stringValue(value)) return 'UNKNOWN';
  return 'ACTIVE';
}

function sha256(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

function asBase64Bytes(value: unknown): Uint8Array | undefined {
  const encoded = stringValue(value);
  if (!encoded) return undefined;
  return Buffer.from(encoded, 'base64');
}

@Injectable()
export class FacturamaAdapter implements FiscalProviderPort {
  readonly providerKey = FACTURAMA_PROVIDER;
  readonly capabilities = Object.freeze({
    providerSideIdempotency: false,
  });

  constructor(
    private readonly config: ConfigService,
    @Optional()
    @Inject(FISCAL_CREDENTIAL_RESOLVER)
    private readonly credentialResolver?: FiscalCredentialResolver,
    @Optional()
    private readonly fetcher?: FetchLike,
  ) {}

  async stamp(command: FiscalIssueCommand): Promise<FiscalStampResponse> {
    const operation = 'STAMP' as const;
    const correlationId = safeCorrelationId(command.correlationId, operation);
    const payload = buildIssuePayload({ ...command, correlationId }, operation);
    const response = await this.requestJson<FacturamaInvoiceResponse>(
      operation,
      correlationId,
      '/api-lite/3/cfdis',
      { method: 'POST', body: JSON.stringify(payload) },
    );
    return this.normalizeStamp(response.body, correlationId);
  }

  async cancel(
    command: FiscalCancelCommand,
  ): Promise<FiscalCancellationResponse> {
    const operation = 'CANCEL' as const;
    const correlationId = safeCorrelationId(command.correlationId, operation);
    assertProviderKey(command.providerKey, operation, correlationId);
    const providerDocumentId = providerDocumentIdForCommand(
      command.providerDocumentId,
      operation,
      correlationId,
    );
    const query = new URLSearchParams({
      motive: command.motive,
      ...(command.replacementUuid
        ? { uuidReplacement: command.replacementUuid }
        : {}),
    });
    const response = await this.requestJson<FacturamaCancellationResponse>(
      operation,
      correlationId,
      `/api-lite/cfdis/${encodeURIComponent(providerDocumentId)}?${query.toString()}`,
      { method: 'DELETE' },
    );
    return this.normalizeCancellation(
      response.body,
      providerDocumentId,
      command.uuid,
      correlationId,
    );
  }

  async getStatus(command: FiscalStatusCommand): Promise<FiscalStatusResponse> {
    return this.fetchStatus(command, 'STATUS');
  }

  private async fetchStatus(
    command: FiscalStatusCommand,
    operation: 'STATUS' | 'CANCELLATION_STATUS',
  ): Promise<FiscalStatusResponse> {
    const correlationId = safeCorrelationId(command.correlationId, operation);
    assertProviderKey(command.providerKey, operation, correlationId);
    const providerDocumentId = providerDocumentIdForCommand(
      command.providerDocumentId,
      operation,
      correlationId,
    );
    const response = await this.requestJson<FacturamaInvoiceResponse>(
      operation,
      correlationId,
      `/cfdi/${encodeURIComponent(providerDocumentId)}?type=${FACTURAMA_DOCUMENT_TYPE}`,
      { method: 'GET' },
    );
    return this.normalizeStatus(
      response.body,
      providerDocumentId,
      command.uuid ?? null,
      correlationId,
      operation,
    );
  }

  async getXml(command: FiscalArtifactCommand): Promise<FiscalArtifactContent> {
    return this.getArtifact(command, 'XML', 'xml', 'DOWNLOAD_XML');
  }

  async getPdf(command: FiscalArtifactCommand): Promise<FiscalArtifactContent> {
    return this.getArtifact(command, 'PDF', 'pdf', 'DOWNLOAD_PDF');
  }

  async getCancellationStatus(
    command: FiscalStatusCommand,
  ): Promise<FiscalCancellationResponse> {
    const operation = 'CANCELLATION_STATUS' as const;
    const correlationId = safeCorrelationId(command.correlationId, operation);
    assertProviderKey(command.providerKey, operation, correlationId);
    const providerDocumentId = providerDocumentIdForCommand(
      command.providerDocumentId,
      operation,
      correlationId,
    );
    const response = await this.requestJson<
      FacturamaInvoiceResponse & FacturamaCancellationResponse
    >(
      operation,
      correlationId,
      `/cfdi/${encodeURIComponent(providerDocumentId)}?type=${FACTURAMA_DOCUMENT_TYPE}`,
      { method: 'GET' },
    );
    const status = this.normalizeStatus(
      response.body,
      providerDocumentId,
      command.uuid ?? null,
      correlationId,
      operation,
    );
    const uuid = command.uuid ?? status.uuid;
    if (!uuid) {
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_RESPONSE_INVALID',
        operation,
        correlationId,
        null,
        false,
      );
    }
    const acknowledgmentBytes = isObject(response.body)
      ? asBase64Bytes(response.body.AcuseXmlBase64)
      : undefined;
    const acknowledgment = acknowledgmentBytes
      ? {
          correlationId,
          provider: FACTURAMA_PROVIDER,
          providerDocumentId,
          artifactType: 'CANCELLATION_ACK' as const,
          contentType: 'application/xml',
          content: acknowledgmentBytes,
          sha256: sha256(acknowledgmentBytes),
        }
      : undefined;
    return {
      correlationId,
      provider: FACTURAMA_PROVIDER,
      providerDocumentId,
      status: statusToCancellation(status.status),
      uuid,
      requestedAt: null,
      cancelledAt: status.cancelledAt,
      ...(acknowledgment ? { acknowledgment } : {}),
    };
  }

  private async getArtifact(
    command: FiscalArtifactCommand,
    artifactType: 'XML' | 'PDF',
    format: 'xml' | 'pdf',
    operation: 'DOWNLOAD_XML' | 'DOWNLOAD_PDF',
  ): Promise<FiscalArtifactContent> {
    const correlationId = safeCorrelationId(command.correlationId, operation);
    assertProviderKey(command.providerKey, operation, correlationId);
    const documentId = providerDocumentIdForCommand(
      command.providerDocumentId,
      operation,
      correlationId,
    );
    const response = await this.requestJson<FacturamaFileResponse>(
      operation,
      correlationId,
      `/Cfdi/${format}/${FACTURAMA_DOCUMENT_TYPE}/${encodeURIComponent(documentId)}`,
      { method: 'GET' },
    );
    const body = response.body;
    if (
      !isObject(body) ||
      stringValue(body.ContentEncoding)?.toLowerCase() !== 'base64'
    ) {
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_RESPONSE_INVALID',
        operation,
        correlationId,
        response.status,
        false,
      );
    }
    const content = asBase64Bytes(body.Content);
    if (!content || content.length === 0) {
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_ARTIFACT_UNAVAILABLE',
        operation,
        correlationId,
        response.status,
        true,
      );
    }
    return {
      correlationId,
      provider: FACTURAMA_PROVIDER,
      providerDocumentId: documentId,
      artifactType,
      contentType: normalizeArtifactContentType(body.ContentType, format),
      content,
      sha256: sha256(content),
    };
  }

  private normalizeStamp(
    body: unknown,
    correlationId: string,
  ): FiscalStampResponse {
    const operation = 'STAMP' as const;
    if (!isObject(body)) {
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_RESPONSE_INVALID',
        operation,
        correlationId,
        null,
        false,
      );
    }
    const providerDocumentId = providerDocumentIdForCommand(
      body.Id,
      operation,
      correlationId,
    );
    const stamp = isObject(body.Complement)
      ? body.Complement.TaxStamp
      : undefined;
    if (!isObject(stamp)) {
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_RESPONSE_INVALID',
        operation,
        correlationId,
        null,
        false,
      );
    }
    const tfd: FiscalTfdMetadata = {
      uuid: requiredUuid(stamp.Uuid, operation, correlationId),
      stampedAt: isoTimestamp(stamp.Date, operation, correlationId),
      cfdiSeal: requiredString(stamp.CfdiSign, operation, correlationId),
      satSeal: requiredString(stamp.SatSign, operation, correlationId),
      satCertificateNumber: requiredString(
        stamp.SatCertNumber,
        operation,
        correlationId,
      ),
      providerCertificateRfc: requiredString(
        stamp.RfcProvCertif,
        operation,
        correlationId,
      ),
    };
    const issuedAt = isoTimestamp(body.Date, operation, correlationId);
    const reference = (
      artifactType: FiscalArtifactReference['artifactType'],
    ): FiscalArtifactReference => ({ artifactType, providerDocumentId });
    return {
      correlationId,
      provider: FACTURAMA_PROVIDER,
      providerDocumentId,
      outcome: 'STAMPED',
      uuid: tfd.uuid,
      issuedAt,
      stampedAt: tfd.stampedAt,
      tfd,
      xmlReference: reference('XML'),
      pdfReference: reference('PDF'),
    };
  }

  private normalizeStatus(
    body: unknown,
    providerDocumentId: string,
    fallbackUuid: string | null,
    correlationId: string,
    operationName: 'STATUS' | 'CANCELLATION_STATUS' = 'STATUS',
  ): FiscalStatusResponse {
    const operation = operationName;
    if (!isObject(body)) {
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_RESPONSE_INVALID',
        operation,
        correlationId,
        null,
        false,
      );
    }
    const stamp = isObject(body.Complement)
      ? body.Complement.TaxStamp
      : undefined;
    const uuid =
      (isObject(stamp) ? stringValue(stamp.Uuid) : null) ?? fallbackUuid;
    const issuedAt = stringValue(body.Date);
    const cancelledAt =
      stringValue(body.CancelationDate) ?? stringValue(body.CancellationDate);
    return {
      correlationId,
      provider: FACTURAMA_PROVIDER,
      providerDocumentId,
      status: documentStatus(body.Status, body.IsCanceled),
      uuid,
      issuedAt: issuedAt
        ? isoTimestamp(issuedAt, operation, correlationId)
        : null,
      cancelledAt: cancelledAt
        ? isoTimestamp(cancelledAt, operation, correlationId)
        : null,
    };
  }

  private normalizeCancellation(
    body: unknown,
    providerDocumentId: string,
    uuid: string,
    correlationId: string,
  ): FiscalCancellationResponse {
    const operation = 'CANCEL' as const;
    if (!isObject(body)) {
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_RESPONSE_INVALID',
        operation,
        correlationId,
        null,
        false,
      );
    }
    const status = cancellationStatus(body.Status);
    if (!status) {
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_RESPONSE_INVALID',
        operation,
        correlationId,
        null,
        false,
      );
    }
    const requestedAt = stringValue(body.RequestDate);
    const cancelledAt = stringValue(body.CancelationDate);
    const acknowledgmentBytes = asBase64Bytes(body.AcuseXmlBase64);
    const acknowledgment = acknowledgmentBytes
      ? {
          correlationId,
          provider: FACTURAMA_PROVIDER,
          providerDocumentId,
          artifactType: 'CANCELLATION_ACK' as const,
          contentType: 'application/xml',
          content: acknowledgmentBytes,
          sha256: sha256(acknowledgmentBytes),
        }
      : undefined;
    return {
      correlationId,
      provider: FACTURAMA_PROVIDER,
      providerDocumentId,
      status,
      uuid,
      requestedAt: requestedAt
        ? isoTimestamp(requestedAt, operation, correlationId)
        : null,
      cancelledAt: cancelledAt
        ? isoTimestamp(cancelledAt, operation, correlationId)
        : null,
      ...(acknowledgment ? { acknowledgment } : {}),
    };
  }

  private async requestJson<T>(
    operation: FiscalProviderOperation,
    correlationId: string,
    path: string,
    init: RequestInit,
  ): Promise<FiscalHttpResult & { body: T }> {
    const { baseUrl, environment, timeoutMs, credentialRef } =
      this.configuration(operation, correlationId);
    const credentials = await this.credentials(
      credentialRef,
      environment,
      operation,
      correlationId,
    );
    const url = new URL(path, `${baseUrl.replace(/\/$/, '')}/`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await (this.fetcher ?? globalThis.fetch)(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Correlation-ID': correlationId,
          Authorization: `Basic ${this.basicToken(credentials)}`,
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      clearTimeout(timeout);
      if (isTimeoutError(error)) {
        throw new FiscalProviderError(
          'FISCAL_PROVIDER_TIMEOUT',
          operation,
          correlationId,
          null,
          true,
        );
      }
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_UNAVAILABLE',
        operation,
        correlationId,
        null,
        true,
      );
    }
    let text = '';
    let parsedBody: unknown = undefined;
    try {
      this.assertResponseSizeHeader(response, operation, correlationId);
      if (typeof response.text === 'function') {
        text = await this.readBoundedResponseText(
          response,
          operation,
          correlationId,
        );
      } else if (typeof response.json === 'function') {
        parsedBody = await response.json();
      }
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new FiscalProviderError(
          'FISCAL_PROVIDER_TIMEOUT',
          operation,
          correlationId,
          null,
          true,
        );
      }
    } finally {
      clearTimeout(timeout);
    }
    const body = parsedBody === undefined ? parseJson(text) : parsedBody;
    const responseOk =
      typeof response.ok === 'boolean'
        ? response.ok
        : response.status >= 200 && response.status < 300;
    if (!responseOk) {
      throw this.httpError(operation, correlationId, response.status);
    }
    if (body === null) {
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_RESPONSE_INVALID',
        operation,
        correlationId,
        response.status,
        false,
      );
    }
    return { status: response.status, body: body as T };
  }

  private assertResponseSizeHeader(
    response: Response,
    operation: FiscalProviderOperation,
    correlationId: string,
  ): void {
    const rawContentLength = response.headers?.get?.('content-length');
    if (!rawContentLength) return;
    const contentLength = Number(rawContentLength);
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_FACTURAMA_RESPONSE_BYTES
    ) {
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_RESPONSE_INVALID',
        operation,
        correlationId,
        response.status,
        false,
      );
    }
  }

  private async readBoundedResponseText(
    response: Response,
    operation: FiscalProviderOperation,
    correlationId: string,
  ): Promise<string> {
    if (!response.body || typeof response.body.getReader !== 'function') {
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > MAX_FACTURAMA_RESPONSE_BYTES) {
        throw new FiscalProviderError(
          'FISCAL_PROVIDER_RESPONSE_INVALID',
          operation,
          correlationId,
          response.status,
          false,
        );
      }
      return text;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parts: string[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_FACTURAMA_RESPONSE_BYTES) {
          await reader.cancel().catch(() => undefined);
          throw new FiscalProviderError(
            'FISCAL_PROVIDER_RESPONSE_INVALID',
            operation,
            correlationId,
            response.status,
            false,
          );
        }
        parts.push(decoder.decode(value, { stream: true }));
      }
      parts.push(decoder.decode());
      return parts.join('');
    } finally {
      reader.releaseLock();
    }
  }

  private configuration(
    operation: FiscalProviderOperation,
    correlationId: string,
  ): {
    baseUrl: string;
    environment: FiscalProviderEnvironment;
    timeoutMs: number;
    credentialRef: string;
  } {
    const baseUrl = this.config.get<string>('FACTURAMA_API_BASE_URL')?.trim();
    const environment = this.config.get<FiscalProviderEnvironment>(
      'FISCAL_PROVIDER_ENVIRONMENT',
      'SANDBOX',
    );
    const provider = this.config.get<string>('FISCAL_PROVIDER', 'NONE');
    const mode = this.config.get<string>(
      'FACTURAMA_API_MODE',
      FACTURAMA_MULTI_ISSUER_MODE,
    );
    const timeoutMs = this.config.get<number>(
      'CFDI_REQUEST_TIMEOUT_MS',
      30_000,
    );
    const credentialRef = this.config
      .get<string>('FACTURAMA_CREDENTIAL_REF')
      ?.trim();
    if (
      !baseUrl ||
      provider !== FACTURAMA_PROVIDER ||
      (environment !== 'SANDBOX' && environment !== 'PRODUCTION') ||
      mode !== FACTURAMA_MULTI_ISSUER_MODE ||
      !credentialRef
    ) {
      throw new FiscalProviderError(
        !credentialRef
          ? 'FISCAL_PROVIDER_CREDENTIALS_UNAVAILABLE'
          : 'FISCAL_PROVIDER_CONFIGURATION',
        operation,
        correlationId,
      );
    }
    try {
      assertAllowlistedFacturamaBaseUrl(baseUrl, environment);
    } catch {
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_CONFIGURATION',
        operation,
        correlationId,
      );
    }
    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 100 ||
      timeoutMs > 120_000
    ) {
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_CONFIGURATION',
        operation,
        correlationId,
      );
    }
    return { baseUrl, environment, timeoutMs, credentialRef };
  }

  private async credentials(
    reference: string,
    environment: FiscalProviderEnvironment,
    operation: FiscalProviderOperation,
    correlationId: string,
  ): Promise<FiscalProviderCredential> {
    if (!this.credentialResolver) {
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_CREDENTIALS_UNAVAILABLE',
        operation,
        correlationId,
      );
    }
    try {
      const credentials = await this.credentialResolver.resolve(
        reference,
        environment,
      );
      if (
        !credentials ||
        typeof credentials.username !== 'string' ||
        !credentials.username.trim() ||
        typeof credentials.password !== 'string' ||
        !credentials.password
      ) {
        throw new Error('invalid credentials');
      }
      return {
        username: credentials.username.trim(),
        password: credentials.password,
      };
    } catch {
      throw new FiscalProviderError(
        'FISCAL_PROVIDER_CREDENTIALS_UNAVAILABLE',
        operation,
        correlationId,
      );
    }
  }

  private basicToken(credentials: FiscalProviderCredential): string {
    return Buffer.from(
      `${credentials.username}:${credentials.password}`,
    ).toString('base64');
  }

  private httpError(
    operation: FiscalProviderOperation,
    correlationId: string,
    statusCode: number,
  ): FiscalProviderError {
    if (statusCode === 401 || statusCode === 403) {
      return new FiscalProviderError(
        'FISCAL_PROVIDER_AUTHENTICATION',
        operation,
        correlationId,
        statusCode,
        false,
      );
    }
    if (statusCode === 400 || statusCode === 422) {
      return new FiscalProviderError(
        'FISCAL_PROVIDER_VALIDATION',
        operation,
        correlationId,
        statusCode,
        false,
      );
    }
    if (statusCode === 404) {
      return new FiscalProviderError(
        'FISCAL_PROVIDER_NOT_FOUND',
        operation,
        correlationId,
        statusCode,
        false,
      );
    }
    if (statusCode === 408) {
      return new FiscalProviderError(
        'FISCAL_PROVIDER_TIMEOUT',
        operation,
        correlationId,
        statusCode,
        true,
      );
    }
    if (statusCode === 429 || statusCode >= 500) {
      return new FiscalProviderError(
        'FISCAL_PROVIDER_UNAVAILABLE',
        operation,
        correlationId,
        statusCode,
        true,
      );
    }
    return new FiscalProviderError(
      'FISCAL_PROVIDER_UNKNOWN',
      operation,
      correlationId,
      statusCode,
      false,
    );
  }
}

function normalizeArtifactContentType(
  value: unknown,
  format: 'xml' | 'pdf',
): string {
  const normalized = stringValue(value)?.toLowerCase();
  if (normalized === 'xml' || normalized === 'application/xml') {
    return 'application/xml';
  }
  if (normalized === 'pdf' || normalized === 'application/pdf') {
    return 'application/pdf';
  }
  return `application/${format}`;
}

function providerDocumentIdForCommand(
  value: unknown,
  operation: FiscalProviderOperation,
  correlationId: string,
): string {
  return providerDocumentId(value, operation, correlationId);
}

function parseJson(value: string): unknown {
  if (!value.trim()) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { name?: unknown; code?: unknown };
  return (
    value.name === 'AbortError' ||
    value.code === 'ETIMEDOUT' ||
    value.code === 'ECONNABORTED'
  );
}

function statusToCancellation(
  status: FiscalStatusResponse['status'],
): FiscalCancellationStatus {
  switch (status) {
    case 'CANCELLED':
      return 'CANCELLED';
    case 'CANCEL_PENDING':
      return 'PENDING';
    case 'CANCEL_REJECTED':
      return 'REJECTED';
    case 'ACTIVE':
      return 'ACTIVE';
    default:
      return 'UNKNOWN';
  }
}
