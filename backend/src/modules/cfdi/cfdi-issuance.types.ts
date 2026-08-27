import type { CfdiDocumentSnapshot } from './domain/cfdi-document.types';
import type { FiscalProviderErrorCode } from './domain/fiscal-provider.port';

export interface PreparedCfdiIssuance {
  readonly replayed: boolean;
  readonly billingRequestId: string;
  readonly invoiceId: string;
  readonly attemptId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly actorUserId: string;
  readonly series: string;
  readonly folio: string;
  readonly version: number;
  readonly fiscalStatus: string;
  readonly operationStatus: string;
  readonly uuid?: string | null;
  readonly snapshot?: CfdiDocumentSnapshot;
}

export interface CfdiIssuanceResult {
  readonly billingRequestId: string;
  readonly invoiceId: string;
  readonly attemptId: string;
  readonly fiscalStatus: string;
  readonly operationStatus: string;
  readonly uuid: string | null;
  readonly replayed: boolean;
}

export interface FiscalIssuanceFailure {
  readonly code: FiscalProviderErrorCode | 'STAMP_RESULT_PERSISTENCE_FAILED';
  readonly statusCode: number | null;
}

export type FiscalIssuanceFailureOutcome = 'TERMINAL_FAILURE' | 'UNKNOWN';
