import { DailyCloseDifferenceStatus } from '@prisma/client';

export const DAILY_CLOSE_DIFFERENCE_UNRESOLVED_CODE =
  'DAILY_CLOSE_DIFFERENCE_UNRESOLVED' as const;

export type DailyCloseDifferencePolicyInput = {
  id?: string;
  code?: string | null;
  referenceKey?: string | null;
  differenceValue: number | string | { toString(): string } | null | undefined;
  status?: string | null;
};

export type DailyCloseDifferenceBlocker = {
  code: typeof DAILY_CLOSE_DIFFERENCE_UNRESOLVED_CODE;
  differenceId?: string;
  referenceKey: string;
  status?: string | null;
};

export function getUnresolvedDailyCloseDifferenceBlockers(
  differences: DailyCloseDifferencePolicyInput[],
): DailyCloseDifferenceBlocker[] {
  return differences
    .filter(
      (difference) =>
        Number(difference.differenceValue ?? 0) !== 0 &&
        difference.status !== DailyCloseDifferenceStatus.AUTHORIZED,
    )
    .map((difference) => ({
      code: DAILY_CLOSE_DIFFERENCE_UNRESOLVED_CODE,
      ...(difference.id ? { differenceId: difference.id } : {}),
      referenceKey:
        difference.referenceKey?.trim() || difference.code?.trim() || 'UNKNOWN',
      status: difference.status,
    }));
}
