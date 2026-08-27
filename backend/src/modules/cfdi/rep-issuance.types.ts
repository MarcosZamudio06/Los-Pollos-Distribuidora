import type { CfdiPaymentReceiptSnapshot } from './domain/cfdi-document.types';
import type {
  FiscalProviderErrorCode,
  FiscalStampResponse,
} from './domain/fiscal-provider.port';

export interface PreparedRepIssuance {
  readonly replayed: boolean;
  readonly paymentId: string;
  readonly invoiceId: string;
  readonly paymentReceiptId: string;
  readonly paymentReceiptDetailId: string;
  readonly attemptId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly actorUserId: string;
  readonly series: string;
  readonly folio: string;
  readonly fiscalStatus: string;
  readonly operationStatus: string;
  readonly uuid?: string | null;
  readonly snapshot?: CfdiPaymentReceiptSnapshot;
}

export interface RepIssuanceResult {
  readonly paymentId: string;
  readonly invoiceId: string;
  readonly paymentReceiptId: string;
  readonly paymentReceiptDetailId: string;
  readonly attemptId: string;
  readonly fiscalStatus: string;
  readonly operationStatus: string;
  readonly uuid: string | null;
  readonly replayed: boolean;
}

export interface RepIssuanceFailure {
  readonly code: FiscalProviderErrorCode | 'REP_RESULT_PERSISTENCE_FAILED';
  readonly statusCode: number | null;
}

export type RepIssuanceFailureOutcome = 'TERMINAL_FAILURE' | 'UNKNOWN';

export type RepStampResponse = FiscalStampResponse;
