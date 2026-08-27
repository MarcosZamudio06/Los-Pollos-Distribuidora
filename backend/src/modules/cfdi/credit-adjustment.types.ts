import type { CfdiCreditNoteSnapshot } from './domain/cfdi-document.types';
import type { FiscalProviderErrorCode } from './domain/fiscal-provider.port';

export interface PreparedCreditNoteIssuance {
  readonly replayed: boolean;
  readonly creditAdjustmentId: string;
  readonly invoiceId: string;
  readonly attemptId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly actorUserId: string;
  readonly series: string;
  readonly folio: string;
  readonly fiscalStatus: string;
  readonly operationStatus: string;
  readonly adjustmentStatus: string;
  readonly uuid?: string | null;
  readonly snapshot?: CfdiCreditNoteSnapshot;
}

export interface CreditNoteIssuanceResult {
  readonly creditAdjustmentId: string;
  readonly invoiceId: string;
  readonly attemptId: string;
  readonly fiscalStatus: string;
  readonly operationStatus: string;
  readonly adjustmentStatus: string;
  readonly uuid: string | null;
  readonly replayed: boolean;
}

export interface CreditNoteIssuanceFailure {
  readonly code:
    FiscalProviderErrorCode | 'CREDIT_NOTE_RESULT_PERSISTENCE_FAILED';
  readonly statusCode: number | null;
}

export type CreditNoteIssuanceFailureOutcome = 'TERMINAL_FAILURE' | 'UNKNOWN';
