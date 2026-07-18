import { AgingStatus } from '@prisma/client';

const DEFAULT_BUSINESS_TIME_ZONE = 'America/Mexico_City';
const DUE_SOON_DAYS = 7;
const MILLISECONDS_PER_DAY = 86_400_000;

function businessDayNumber(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return Date.UTC(value('year'), value('month') - 1, value('day')) / MILLISECONDS_PER_DAY;
}

export function calculateReceivableAging(
  dueDate: Date,
  outstandingAmount: number,
  asOf = new Date(),
  timeZone = process.env.APP_TIMEZONE?.trim() || DEFAULT_BUSINESS_TIME_ZONE,
) {
  if (outstandingAmount <= 0) {
    return { agingStatus: AgingStatus.CURRENT, daysOverdue: 0 };
  }

  const daysUntilDue = businessDayNumber(dueDate, timeZone) - businessDayNumber(asOf, timeZone);
  if (daysUntilDue < 0) {
    return { agingStatus: AgingStatus.OVERDUE, daysOverdue: Math.abs(daysUntilDue) };
  }

  return {
    agingStatus: daysUntilDue <= DUE_SOON_DAYS ? AgingStatus.DUE_SOON : AgingStatus.CURRENT,
    daysOverdue: 0,
  };
}
