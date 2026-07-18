import { AgingStatus } from '@prisma/client';
import { calculateReceivableAging } from './receivable-aging';

describe('calculateReceivableAging', () => {
  const asOf = new Date('2026-07-17T05:30:00.000Z'); // 2026-07-16 23:30 in Mexico City

  it.each([
    ['more than seven calendar days away', '2026-07-24T06:00:00.000Z', AgingStatus.CURRENT, 0],
    ['exactly seven calendar days away', '2026-07-23T06:00:00.000Z', AgingStatus.DUE_SOON, 0],
    ['on the due calendar day', '2026-07-16T06:00:00.000Z', AgingStatus.DUE_SOON, 0],
    ['from the following calendar day', '2026-07-15T06:00:00.000Z', AgingStatus.OVERDUE, 1],
    ['across several calendar days', '2026-07-13T23:00:00.000Z', AgingStatus.OVERDUE, 3],
  ])('%s', (_label, dueDate, agingStatus, daysOverdue) => {
    expect(calculateReceivableAging(new Date(dueDate), 100, asOf)).toEqual({ agingStatus, daysOverdue });
  });

  it('resets aging when no balance remains', () => {
    expect(calculateReceivableAging(new Date('2026-07-01T06:00:00.000Z'), 0, asOf)).toEqual({
      agingStatus: AgingStatus.CURRENT,
      daysOverdue: 0,
    });
  });

  it('uses the configured operational timezone for calendar boundaries', () => {
    const boundaryAsOf = new Date('2026-07-17T05:30:00.000Z');
    const boundaryDueDate = new Date('2026-07-17T04:30:00.000Z');

    expect(calculateReceivableAging(boundaryDueDate, 100, boundaryAsOf, 'America/Cancun')).toEqual({ agingStatus: AgingStatus.OVERDUE, daysOverdue: 1 });
    expect(calculateReceivableAging(boundaryDueDate, 100, boundaryAsOf, 'America/Tijuana')).toEqual({ agingStatus: AgingStatus.DUE_SOON, daysOverdue: 0 });
  });
});
