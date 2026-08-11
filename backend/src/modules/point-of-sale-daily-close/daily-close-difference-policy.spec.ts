import { DailyCloseDifferenceStatus } from '@prisma/client';
import { getUnresolvedDailyCloseDifferenceBlockers } from './daily-close-difference-policy';

describe('daily close difference policy', () => {
  it.each([
    DailyCloseDifferenceStatus.PENDING_JUSTIFICATION,
    DailyCloseDifferenceStatus.PENDING_AUTHORIZATION,
  ])('blocks a non-zero difference in %s', (status) => {
    expect(
      getUnresolvedDailyCloseDifferenceBlockers([
        {
          id: 'difference-1',
          referenceKey: 'SCALE',
          differenceValue: -5,
          status,
        },
      ]),
    ).toEqual([
      {
        code: 'DAILY_CLOSE_DIFFERENCE_UNRESOLVED',
        differenceId: 'difference-1',
        referenceKey: 'SCALE',
        status,
      },
    ]);
  });

  it('does not block an authorized or zero difference', () => {
    expect(
      getUnresolvedDailyCloseDifferenceBlockers([
        {
          referenceKey: 'SCALE',
          differenceValue: -5,
          status: DailyCloseDifferenceStatus.AUTHORIZED,
        },
        {
          referenceKey: 'CASH',
          differenceValue: 0,
          status: DailyCloseDifferenceStatus.PENDING_JUSTIFICATION,
        },
      ]),
    ).toEqual([]);
  });
});
