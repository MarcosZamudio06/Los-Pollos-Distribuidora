import { describe, expect, it } from 'vitest';
import { toPaymentPayload } from './accountsReceivableService';

describe('toPaymentPayload', () => {
  it('serializes a partial payment as a decimal string for the API', () => {
    const payload = toPaymentPayload({
      accountReceivableId: 'ar-1',
      amount: 2500,
      paymentMethod: 'TRANSFER',
    });

    expect(payload.amount).toBe('2500');
  });
});
