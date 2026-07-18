import { BadRequestException } from '@nestjs/common';
import { CollectionStatus, CreditStatus } from '@prisma/client';
import { calculateCreditState, evaluateCreditDecision } from './credit-decision';

describe('evaluateCreditDecision', () => {
  const asOf = new Date('2026-07-17T12:00:00Z');
  const customer = { id: 'customer-1', creditStatus: CreditStatus.ACTIVE, creditLimit: 1000, commercialPolicyId: 'policy-1' };
  const policy = {
    id: 'policy-1', isActive: true, effectiveFrom: new Date('2026-01-01'), effectiveTo: null,
    overdueBlockingMode: 'BLOCK_NEW_CREDIT', allowAdministrativeOverride: true,
  };
  const tx = {
    commercialPolicy: { findFirst: jest.fn() },
    accountReceivable: { findMany: jest.fn() },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    tx.commercialPolicy.findFirst.mockResolvedValue(policy);
    tx.accountReceivable.findMany.mockResolvedValue([]);
  });

  const evaluate = (overrides: Record<string, unknown> = {}) => evaluateCreditDecision(tx as never, {
    customer,
    newOutstandingAmount: 250,
    actor: { id: 'seller-1', role: 'SELLER' },
    asOf,
    ...overrides,
  });

  it.each([CreditStatus.BLOCKED, CreditStatus.SUSPENDED])('never overrides administrative status %s', async (creditStatus) => {
    await expect(evaluate({
      customer: { ...customer, creditStatus },
      actor: { id: 'admin-1', role: 'ADMIN' },
      overrideReason: 'Director approval',
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'CREDIT_ADMINISTRATIVELY_BLOCKED' }) });
  });

  it('rejects a requested policy that differs from the customer assignment', async () => {
    await expect(evaluate({ policyId: 'policy-2' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CREDIT_POLICY_MISMATCH' }),
    });
    expect(tx.commercialPolicy.findFirst).not.toHaveBeenCalled();
  });

  it.each(['future', 'expired'])('treats a %s policy as ineligible null-mode', async () => {
    tx.commercialPolicy.findFirst.mockResolvedValueOnce(null);
    tx.accountReceivable.findMany.mockResolvedValueOnce([
      { dueDate: new Date('2026-07-15T06:00:00Z'), outstandingAmount: 200, status: CollectionStatus.UNPAID },
    ]);

    await expect(evaluate()).resolves.toMatchObject({ policyId: null, overdueBlockingMode: null, outcome: 'PERMITTED' });
    expect(tx.commercialPolicy.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: 'policy-1', isActive: true, effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
    } }));
  });

  it('blocks from current overdue dates without trusting persisted aging status', async () => {
    tx.accountReceivable.findMany.mockResolvedValue([
      { dueDate: new Date('2026-07-15T06:00:00Z'), outstandingAmount: 200, status: CollectionStatus.UNPAID, agingStatus: 'CURRENT' },
    ]);

    await expect(evaluate()).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CREDIT_OVERDUE_BLOCKED' }),
    });
    expect(tx.accountReceivable.findMany).toHaveBeenCalledWith({
      where: { customerId: 'customer-1', status: { in: [CollectionStatus.UNPAID, CollectionStatus.PARTIALLY_PAID] }, outstandingAmount: { gt: 0 } },
      select: { dueDate: true, outstandingAmount: true, status: true },
    });
  });

  it('permits WARN_ONLY with a warning and null mode without an overdue warning', async () => {
    tx.accountReceivable.findMany.mockResolvedValue([
      { dueDate: new Date('2026-07-15T06:00:00Z'), outstandingAmount: 200, status: CollectionStatus.UNPAID },
    ]);
    tx.commercialPolicy.findFirst.mockResolvedValueOnce({ ...policy, overdueBlockingMode: 'WARN_ONLY' });
    await expect(evaluate()).resolves.toMatchObject({ outcome: 'WARNING', warnings: ['CREDIT_OVERDUE_WARNING'], overdueAmount: 200, maximumDaysOverdue: 2 });

    tx.commercialPolicy.findFirst.mockResolvedValueOnce({ ...policy, overdueBlockingMode: null });
    await expect(evaluate()).resolves.toMatchObject({ outcome: 'PERMITTED', warnings: [] });
  });

  it('preserves hard credit-limit denial with a stable code', async () => {
    tx.accountReceivable.findMany.mockResolvedValue([
      { dueDate: new Date('2026-08-01T06:00:00Z'), outstandingAmount: 900, status: CollectionStatus.UNPAID },
    ]);
    await expect(evaluate()).rejects.toMatchObject({ response: expect.objectContaining({ code: 'CREDIT_LIMIT_EXCEEDED' }) });
  });

  it('rejects a supplied but blank override reason instead of ignoring it', async () => {
    await expect(evaluate({ actor: { id: 'admin-1', role: 'ADMIN' }, overrideReason: '   ' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an override when there is no overdue or limit denial to override', async () => {
    await expect(evaluate({ actor: { id: 'admin-1', role: 'ADMIN' }, overrideReason: 'Not needed' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts only an authorized policy-backed ADMIN override for overdue and limit', async () => {
    tx.accountReceivable.findMany.mockResolvedValue([
      { dueDate: new Date('2026-07-15T06:00:00Z'), outstandingAmount: 900, status: CollectionStatus.UNPAID },
    ]);
    await expect(evaluate({ overrideReason: 'Requested' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(evaluate({ actor: { id: 'admin-1', role: 'ADMIN' }, overrideReason: '   ' })).rejects.toBeInstanceOf(BadRequestException);

    tx.commercialPolicy.findFirst.mockResolvedValueOnce({ ...policy, allowAdministrativeOverride: false });
    await expect(evaluate({ actor: { id: 'admin-1', role: 'ADMIN' }, overrideReason: 'Requested' })).rejects.toBeInstanceOf(BadRequestException);

    await expect(evaluate({ actor: { id: 'admin-1', role: 'ADMIN' }, overrideReason: ' Director approval ' })).resolves.toMatchObject({
      outcome: 'OVERRIDDEN',
      warnings: ['CREDIT_OVERRIDE_APPLIED'],
      overrideActorId: 'admin-1',
      overrideReason: 'Director approval',
      projectedExposure: 1150,
    });
  });
});

describe('calculateCreditState', () => {
  const asOf = new Date('2026-07-17T12:00:00Z');
  const receivables = [{ dueDate: new Date('2026-07-15T06:00:00Z'), outstandingAmount: 200, status: CollectionStatus.UNPAID }];
  const base = {
    creditStatus: CreditStatus.ACTIVE,
    creditLimit: 1000,
    newOutstandingAmount: 0,
    receivables,
    asOf,
  };

  it.each([
    ['BLOCK_NEW_CREDIT', 'BLOCKED', ['CREDIT_OVERDUE_BLOCKED']],
    ['WARN_ONLY', 'WARNING', ['CREDIT_OVERDUE_WARNING']],
    [null, 'ACTIVE', []],
  ])('derives %s overdue policy consistently', (overdueBlockingMode, effectiveCreditStatus, blockingReasons) => {
    expect(calculateCreditState({ ...base, policy: overdueBlockingMode === null ? null : {
      id: 'policy-1', isActive: true, effectiveFrom: new Date('2026-01-01'), effectiveTo: null,
      overdueBlockingMode, allowAdministrativeOverride: true,
    } })).toMatchObject({ effectiveCreditStatus, blockingReasons, overdueAmount: 200, maximumDaysOverdue: 2 });
  });

  it('prioritizes administrative status and derives limit blocking', () => {
    expect(calculateCreditState({ ...base, creditStatus: CreditStatus.BLOCKED, policy: null })).toMatchObject({
      effectiveCreditStatus: 'BLOCKED', blockingReasons: ['CREDIT_ADMINISTRATIVELY_BLOCKED'], canAdministrativeOverride: false,
    });
    expect(calculateCreditState({ ...base, creditLimit: 100, policy: null })).toMatchObject({
      effectiveCreditStatus: 'BLOCKED', blockingReasons: ['CREDIT_LIMIT_EXCEEDED'], canAdministrativeOverride: false,
    });
  });

  it('treats expired policy as null-mode while keeping overdue visible', () => {
    expect(calculateCreditState({ ...base, policy: {
      id: 'policy-1', isActive: true, effectiveFrom: new Date('2026-01-01'), effectiveTo: new Date('2026-07-16'),
      overdueBlockingMode: 'BLOCK_NEW_CREDIT', allowAdministrativeOverride: true,
    } })).toMatchObject({ effectiveCreditStatus: 'ACTIVE', overdueAmount: 200, overdueBlockingMode: null, canAdministrativeOverride: false });
  });

  it('treats an active policy with null effectiveFrom as ineligible', () => {
    expect(calculateCreditState({ ...base, policy: {
      id: 'policy-1', isActive: true, effectiveFrom: null, effectiveTo: null,
      overdueBlockingMode: 'BLOCK_NEW_CREDIT', allowAdministrativeOverride: true,
    } })).toMatchObject({ effectiveCreditStatus: 'ACTIVE', overdueAmount: 200, overdueBlockingMode: null, policyId: null });
  });
});
