import { CfdiDomainError } from './cfdi-domain.error';

export const CFDI_LIFECYCLE_STATES = [
  'DRAFT',
  'VALIDATING',
  'READY_TO_STAMP',
  'STAMPING',
  'STAMP_UNKNOWN',
  'STAMPED',
  'STAMP_ERROR',
  'CANCEL_REQUESTED',
  'CANCEL_PENDING_ACCEPTANCE',
  'CANCELLED',
  'CANCEL_REJECTED',
  'CANCEL_ERROR',
  'SUBSTITUTED',
] as const;

export type CfdiLifecycleState = (typeof CFDI_LIFECYCLE_STATES)[number];

export type CfdiLifecycleEvent =
  | 'START_VALIDATION'
  | 'VALIDATION_PASSED'
  | 'VALIDATION_FAILED'
  | 'START_STAMP'
  | 'STAMP_TIMED_OUT'
  | 'STAMP_CONFIRMED'
  | 'STAMP_FAILED'
  | 'REQUEST_CANCELLATION'
  | 'CANCELLATION_SUBMITTED'
  | 'CANCELLATION_CONFIRMED'
  | 'CANCELLATION_REJECTED'
  | 'CANCELLATION_FAILED'
  | 'MARK_SUBSTITUTED';

type TransitionTable = Record<
  CfdiLifecycleState,
  Partial<Record<CfdiLifecycleEvent, CfdiLifecycleState>>
>;

const TRANSITIONS: TransitionTable = {
  DRAFT: { START_VALIDATION: 'VALIDATING' },
  VALIDATING: {
    VALIDATION_PASSED: 'READY_TO_STAMP',
    VALIDATION_FAILED: 'STAMP_ERROR',
  },
  READY_TO_STAMP: { START_STAMP: 'STAMPING' },
  STAMPING: {
    STAMP_TIMED_OUT: 'STAMP_UNKNOWN',
    STAMP_CONFIRMED: 'STAMPED',
    STAMP_FAILED: 'STAMP_ERROR',
  },
  STAMP_UNKNOWN: {
    STAMP_CONFIRMED: 'STAMPED',
    STAMP_FAILED: 'STAMP_ERROR',
  },
  STAMPED: {
    REQUEST_CANCELLATION: 'CANCEL_REQUESTED',
    MARK_SUBSTITUTED: 'SUBSTITUTED',
  },
  STAMP_ERROR: { START_VALIDATION: 'VALIDATING' },
  CANCEL_REQUESTED: {
    CANCELLATION_SUBMITTED: 'CANCEL_PENDING_ACCEPTANCE',
  },
  CANCEL_PENDING_ACCEPTANCE: {
    CANCELLATION_CONFIRMED: 'CANCELLED',
    CANCELLATION_REJECTED: 'CANCEL_REJECTED',
    CANCELLATION_FAILED: 'CANCEL_ERROR',
  },
  CANCELLED: {},
  CANCEL_REJECTED: { REQUEST_CANCELLATION: 'CANCEL_REQUESTED' },
  CANCEL_ERROR: { REQUEST_CANCELLATION: 'CANCEL_REQUESTED' },
  SUBSTITUTED: {},
};

export interface CfdiPersistenceState {
  fiscalStatus:
    'DRAFT' | 'READY' | 'STAMPING' | 'STAMPED' | 'FAILED' | 'UNKNOWN';
  cancellationStatus:
    'NOT_REQUESTED' | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'UNKNOWN';
  invoiceStatus: 'ACTIVE' | 'CANCELLED' | 'SUBSTITUTED';
}

const ACTIVE = 'ACTIVE' as const;
const NOT_REQUESTED = 'NOT_REQUESTED' as const;

const PERSISTENCE_STATE: Record<CfdiLifecycleState, CfdiPersistenceState> = {
  DRAFT: {
    fiscalStatus: 'DRAFT',
    cancellationStatus: NOT_REQUESTED,
    invoiceStatus: ACTIVE,
  },
  VALIDATING: {
    fiscalStatus: 'DRAFT',
    cancellationStatus: NOT_REQUESTED,
    invoiceStatus: ACTIVE,
  },
  READY_TO_STAMP: {
    fiscalStatus: 'READY',
    cancellationStatus: NOT_REQUESTED,
    invoiceStatus: ACTIVE,
  },
  STAMPING: {
    fiscalStatus: 'STAMPING',
    cancellationStatus: NOT_REQUESTED,
    invoiceStatus: ACTIVE,
  },
  STAMP_UNKNOWN: {
    fiscalStatus: 'UNKNOWN',
    cancellationStatus: NOT_REQUESTED,
    invoiceStatus: ACTIVE,
  },
  STAMPED: {
    fiscalStatus: 'STAMPED',
    cancellationStatus: NOT_REQUESTED,
    invoiceStatus: ACTIVE,
  },
  STAMP_ERROR: {
    fiscalStatus: 'FAILED',
    cancellationStatus: NOT_REQUESTED,
    invoiceStatus: ACTIVE,
  },
  CANCEL_REQUESTED: {
    fiscalStatus: 'STAMPED',
    cancellationStatus: 'PENDING',
    invoiceStatus: ACTIVE,
  },
  CANCEL_PENDING_ACCEPTANCE: {
    fiscalStatus: 'STAMPED',
    cancellationStatus: 'PENDING',
    invoiceStatus: ACTIVE,
  },
  CANCELLED: {
    fiscalStatus: 'STAMPED',
    cancellationStatus: 'ACCEPTED',
    invoiceStatus: 'CANCELLED',
  },
  CANCEL_REJECTED: {
    fiscalStatus: 'STAMPED',
    cancellationStatus: 'REJECTED',
    invoiceStatus: ACTIVE,
  },
  CANCEL_ERROR: {
    fiscalStatus: 'STAMPED',
    cancellationStatus: 'UNKNOWN',
    invoiceStatus: ACTIVE,
  },
  SUBSTITUTED: {
    fiscalStatus: 'STAMPED',
    cancellationStatus: NOT_REQUESTED,
    invoiceStatus: 'SUBSTITUTED',
  },
};

export class CfdiStateMachine {
  static transition(
    current: CfdiLifecycleState,
    event: CfdiLifecycleEvent,
  ): CfdiLifecycleState {
    const next = TRANSITIONS[current][event];
    if (!next) {
      throw new CfdiDomainError('INVALID_STATE_TRANSITION', {
        current,
        event,
      });
    }
    return next;
  }

  static allowedEvents(current: CfdiLifecycleState): CfdiLifecycleEvent[] {
    return Object.keys(TRANSITIONS[current]) as CfdiLifecycleEvent[];
  }

  static toPersistence(current: CfdiLifecycleState): CfdiPersistenceState {
    return { ...PERSISTENCE_STATE[current] };
  }
}
