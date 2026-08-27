import {
  CFDI_LIFECYCLE_STATES,
  CfdiLifecycleEvent,
  CfdiLifecycleState,
  CfdiStateMachine,
} from './cfdi-state-machine';
import { CfdiDomainError } from './cfdi-domain.error';

describe('CfdiStateMachine', () => {
  const expectedTransitions: Record<
    CfdiLifecycleState,
    Partial<Record<CfdiLifecycleEvent, CfdiLifecycleState>>
  > = {
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

  it('defines every required lifecycle state exactly once', () => {
    expect(CFDI_LIFECYCLE_STATES).toEqual(Object.keys(expectedTransitions));
  });

  it.each(
    Object.entries(expectedTransitions).flatMap(([from, transitions]) =>
      Object.entries(transitions).map(([event, to]) => [from, event, to]),
    ),
  )('transitions %s with %s to %s', (from, event, to) => {
    expect(
      CfdiStateMachine.transition(
        from as CfdiLifecycleState,
        event as CfdiLifecycleEvent,
      ),
    ).toBe(to);
  });

  it('rejects every event not explicitly allowed from the current state', () => {
    const allEvents: CfdiLifecycleEvent[] = [
      'START_VALIDATION',
      'VALIDATION_PASSED',
      'VALIDATION_FAILED',
      'START_STAMP',
      'STAMP_TIMED_OUT',
      'STAMP_CONFIRMED',
      'STAMP_FAILED',
      'REQUEST_CANCELLATION',
      'CANCELLATION_SUBMITTED',
      'CANCELLATION_CONFIRMED',
      'CANCELLATION_REJECTED',
      'CANCELLATION_FAILED',
      'MARK_SUBSTITUTED',
    ];

    for (const state of CFDI_LIFECYCLE_STATES) {
      const allowed = expectedTransitions[state];
      for (const event of allEvents) {
        if (allowed[event]) continue;
        expect(() => CfdiStateMachine.transition(state, event)).toThrow(
          expect.objectContaining<CfdiDomainError>({
            code: 'INVALID_STATE_TRANSITION',
          }),
        );
      }
    }
  });

  it('projects combined domain states to the separate persisted states', () => {
    expect(CfdiStateMachine.toPersistence('READY_TO_STAMP')).toEqual({
      fiscalStatus: 'READY',
      cancellationStatus: 'NOT_REQUESTED',
      invoiceStatus: 'ACTIVE',
    });
    expect(CfdiStateMachine.toPersistence('STAMP_UNKNOWN').fiscalStatus).toBe(
      'UNKNOWN',
    );
    expect(CfdiStateMachine.toPersistence('CANCELLED')).toEqual({
      fiscalStatus: 'STAMPED',
      cancellationStatus: 'ACCEPTED',
      invoiceStatus: 'CANCELLED',
    });
    expect(CfdiStateMachine.toPersistence('SUBSTITUTED')).toEqual({
      fiscalStatus: 'STAMPED',
      cancellationStatus: 'NOT_REQUESTED',
      invoiceStatus: 'SUBSTITUTED',
    });
  });
});
