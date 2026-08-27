import type {
  CfdiDocumentSnapshot,
  CfdiCreditNoteSnapshot,
  CfdiPaymentReceiptSnapshot,
} from './cfdi-document.types';

export const FISCAL_PROVIDER_PORT = Symbol('FISCAL_PROVIDER_PORT');

/** Provider keys are opaque, normalized strings persisted with each fiscal
 * operation. Adding an adapter must not require a domain-model change. */
export type FiscalProviderKey = string;
export type FiscalProviderEnvironment = 'SANDBOX' | 'PRODUCTION';

export interface FiscalProviderCapabilities {
  /** True only when the provider contract itself guarantees replay safety for
   * the same issue idempotency key. PostgreSQL remains authoritative either
   * way. */
  readonly providerSideIdempotency: boolean;
}

export type FiscalProviderOperation =
  | 'STAMP'
  | 'CANCEL'
  | 'STATUS'
  | 'DOWNLOAD_XML'
  | 'DOWNLOAD_PDF'
  | 'CANCELLATION_STATUS';

export type CfdiProviderSnapshot =
  CfdiDocumentSnapshot | CfdiPaymentReceiptSnapshot | CfdiCreditNoteSnapshot;

export type FiscalArtifactType = 'XML' | 'PDF' | 'CANCELLATION_ACK';

export interface FiscalIssueCommand {
  readonly correlationId: string;
  readonly idempotencyKey: string;
  /** Multi-issuer providers require the invoice folio to be explicit. */
  readonly folio: string;
  readonly series?: string;
  readonly snapshot: CfdiProviderSnapshot;
}

export type FiscalCancellationMotive = '01' | '02' | '03' | '04';

export interface FiscalCancelCommand {
  readonly correlationId: string;
  readonly providerKey?: FiscalProviderKey;
  readonly providerDocumentId: string;
  readonly uuid: string;
  readonly motive: FiscalCancellationMotive;
  readonly replacementUuid?: string;
}

export interface FiscalStatusCommand {
  readonly correlationId: string;
  readonly providerKey?: FiscalProviderKey;
  readonly providerDocumentId: string;
  readonly uuid?: string;
}

export interface FiscalArtifactCommand {
  readonly correlationId: string;
  readonly providerKey?: FiscalProviderKey;
  readonly providerDocumentId: string;
}

export interface FiscalTfdMetadata {
  readonly uuid: string;
  readonly stampedAt: string;
  readonly cfdiSeal: string;
  readonly satSeal: string;
  readonly satCertificateNumber: string;
  readonly providerCertificateRfc: string;
}

export interface FiscalArtifactReference {
  readonly artifactType: FiscalArtifactType;
  readonly providerDocumentId: string;
}

export interface FiscalProviderResponseBase {
  readonly correlationId: string;
  readonly provider: FiscalProviderKey;
  readonly providerDocumentId: string;
}

export interface FiscalStampResponse extends FiscalProviderResponseBase {
  readonly outcome: 'STAMPED';
  readonly uuid: string;
  readonly issuedAt: string;
  readonly stampedAt: string;
  readonly tfd: FiscalTfdMetadata;
  readonly xmlReference: FiscalArtifactReference;
  readonly pdfReference: FiscalArtifactReference;
}

export type FiscalDocumentStatus =
  'ACTIVE' | 'CANCEL_PENDING' | 'CANCELLED' | 'CANCEL_REJECTED' | 'UNKNOWN';

export interface FiscalStatusResponse extends FiscalProviderResponseBase {
  readonly status: FiscalDocumentStatus;
  readonly uuid: string | null;
  readonly issuedAt: string | null;
  readonly cancelledAt: string | null;
}

export type FiscalCancellationStatus =
  'CANCELLED' | 'PENDING' | 'REJECTED' | 'ACTIVE' | 'UNKNOWN';

export interface FiscalCancellationResponse extends FiscalProviderResponseBase {
  readonly status: FiscalCancellationStatus;
  readonly uuid: string;
  readonly requestedAt: string | null;
  readonly cancelledAt: string | null;
  readonly acknowledgment?: FiscalArtifactContent;
}

export interface FiscalArtifactContent extends FiscalProviderResponseBase {
  readonly artifactType: FiscalArtifactType;
  readonly contentType: string;
  readonly content: Uint8Array;
  readonly sha256: string;
}

export type FiscalProviderErrorCode =
  | 'FISCAL_PROVIDER_CONFIGURATION'
  | 'FISCAL_PROVIDER_CREDENTIALS_UNAVAILABLE'
  | 'FISCAL_PROVIDER_AUTHENTICATION'
  | 'FISCAL_PROVIDER_VALIDATION'
  | 'FISCAL_PROVIDER_NOT_FOUND'
  | 'FISCAL_PROVIDER_TIMEOUT'
  | 'FISCAL_PROVIDER_UNAVAILABLE'
  | 'FISCAL_PROVIDER_RESPONSE_INVALID'
  | 'FISCAL_PROVIDER_ARTIFACT_UNAVAILABLE'
  | 'FISCAL_PROVIDER_CANCEL_REJECTED'
  | 'FISCAL_PROVIDER_UNKNOWN';

/** Safe, stable error shape. It intentionally carries no PAC payload/body. */
export class FiscalProviderError extends Error {
  override readonly name = 'FiscalProviderError';

  constructor(
    readonly code: FiscalProviderErrorCode,
    readonly operation: FiscalProviderOperation,
    readonly correlationId: string,
    readonly statusCode: number | null = null,
    readonly retryable = false,
  ) {
    super(code);
  }
}

export interface FiscalProviderPort {
  readonly providerKey: FiscalProviderKey;
  readonly capabilities: FiscalProviderCapabilities;
  stamp(command: FiscalIssueCommand): Promise<FiscalStampResponse>;
  cancel(command: FiscalCancelCommand): Promise<FiscalCancellationResponse>;
  getStatus(command: FiscalStatusCommand): Promise<FiscalStatusResponse>;
  getXml(command: FiscalArtifactCommand): Promise<FiscalArtifactContent>;
  getPdf(command: FiscalArtifactCommand): Promise<FiscalArtifactContent>;
  getCancellationStatus(
    command: FiscalStatusCommand,
  ): Promise<FiscalCancellationResponse>;
}
