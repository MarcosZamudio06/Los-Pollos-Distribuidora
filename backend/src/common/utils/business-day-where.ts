import { Prisma } from '@prisma/client';

type Range = { gte: Date; lt: Date };

/** Stored business dates are civil labels at UTC midnight, not UTC instants. */
export function buildSaleBusinessDayWhere(
  businessDate: Date,
  range: Range,
): Prisma.SaleWhereInput {
  return {
    OR: [
      { businessDate },
      { businessDate: null, cashShift: { is: { businessDate } } },
      {
        businessDate: null,
        cashShiftId: null,
        pointOfSaleDailyClose: { is: { businessDate } },
      },
      {
        businessDate: null,
        cashShiftId: null,
        pointOfSaleDailyCloseId: null,
        createdAt: range,
      },
    ],
  };
}

/** A collection belongs to its own shift/close; never inherit the sale's date. */
export function buildPaymentBusinessDayWhere(
  businessDate: Date,
  range: Range,
): Prisma.PaymentWhereInput {
  return {
    OR: [
      { cashShift: { is: { businessDate } } },
      { cashShiftId: null, pointOfSaleDailyClose: { is: { businessDate } } },
      { cashShiftId: null, pointOfSaleDailyCloseId: null, paidAt: range },
    ],
  };
}
