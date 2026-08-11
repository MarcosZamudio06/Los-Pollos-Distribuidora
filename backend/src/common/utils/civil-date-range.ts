import { BadRequestException } from '@nestjs/common';

export const DEFAULT_APP_TIMEZONE = 'America/Mexico_City';

export const CIVIL_DATE_FROM_QUERY_DESCRIPTION =
  'Inclusive lower bound. Accepts a civil date in YYYY-MM-DD format or a complete ISO 8601 timestamp with timezone.';
export const CIVIL_DATE_TO_QUERY_DESCRIPTION =
  'Upper bound. A YYYY-MM-DD civil date includes the complete day in APP_TIMEZONE; a complete ISO 8601 timestamp is an exact instant.';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-](\d{2}):(\d{2}))$/;

export type CivilDateRangeFilter = {
  gte?: Date;
  lte?: Date;
  lt?: Date;
};

type CivilDateParts = {
  year: number;
  month: number;
  day: number;
};

type LocalDateTimeParts = CivilDateParts & {
  hour: number;
  minute: number;
  second: number;
};

type ParsedBoundary = {
  instant: Date;
  operator: 'gte' | 'lte' | 'lt';
  civilDate?: CivilDateParts;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/**
 * Builds a Prisma-compatible DateTime filter without changing explicit instant semantics.
 * Civil dateTo values use an exclusive beginning-of-the-next-day boundary.
 */
export function buildCivilDateRangeFilter(
  dateFrom?: string,
  dateTo?: string,
  timeZone?: string,
): CivilDateRangeFilter | undefined {
  if (dateFrom === undefined && dateTo === undefined) {
    return undefined;
  }

  const configuredTimeZone =
    timeZone ?? (process.env.APP_TIMEZONE?.trim() || DEFAULT_APP_TIMEZONE);
  const formatter = getFormatter(configuredTimeZone);
  const from =
    dateFrom === undefined
      ? undefined
      : parseBoundary('dateFrom', dateFrom, formatter);
  const to =
    dateTo === undefined
      ? undefined
      : parseBoundary('dateTo', dateTo, formatter);

  const reversedCivilDates =
    from?.civilDate &&
    to?.civilDate &&
    compareCivilDates(from.civilDate, to.civilDate) > 0;
  const reversedInstants =
    from && to && from.instant.getTime() > to.instant.getTime();
  if (reversedCivilDates || reversedInstants) {
    throw new BadRequestException(
      'dateFrom must be less than or equal to dateTo',
    );
  }

  const filter: CivilDateRangeFilter = {};
  if (from) filter.gte = from.instant;
  if (to) {
    if (to.operator === 'lt') filter.lt = to.instant;
    else filter.lte = to.instant;
  }
  return filter;
}

export function buildCivilDateRangeWhere<TField extends string>(
  field: TField,
  dateFrom?: string,
  dateTo?: string,
  timeZone?: string,
): Record<TField, CivilDateRangeFilter> | Record<string, never> {
  const filter = buildCivilDateRangeFilter(dateFrom, dateTo, timeZone);
  return filter
    ? ({ [field]: filter } as Record<TField, CivilDateRangeFilter>)
    : {};
}

function parseBoundary(
  field: 'dateFrom' | 'dateTo',
  value: string,
  formatter: Intl.DateTimeFormat,
): ParsedBoundary {
  const dateOnlyMatch = DATE_ONLY_PATTERN.exec(value);
  if (dateOnlyMatch) {
    const civilDate = parseCivilDate(field, dateOnlyMatch);
    const boundaryDate =
      field === 'dateTo' ? addCivilDay(civilDate) : civilDate;
    return {
      instant: zonedMidnightToUtc(boundaryDate, formatter),
      operator: field === 'dateTo' ? 'lt' : 'gte',
      civilDate,
    };
  }

  const timestampMatch = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!timestampMatch) {
    throw new BadRequestException(
      `${field} must be a YYYY-MM-DD civil date or a complete ISO 8601 timestamp`,
    );
  }

  parseCivilDate(field, timestampMatch, true);
  const hour = Number(timestampMatch[4]);
  const minute = Number(timestampMatch[5]);
  const second = Number(timestampMatch[6] ?? 0);
  const offsetHour = timestampMatch[9] ? Number(timestampMatch[9]) : undefined;
  const offsetMinute = timestampMatch[10]
    ? Number(timestampMatch[10])
    : undefined;

  if (
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    (offsetHour !== undefined && (offsetHour > 23 || (offsetMinute ?? 0) > 59))
  ) {
    throw new BadRequestException(
      `${field} must be a valid ISO 8601 timestamp`,
    );
  }

  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new BadRequestException(
      `${field} must be a valid ISO 8601 timestamp`,
    );
  }

  return { instant, operator: field === 'dateTo' ? 'lte' : 'gte' };
}

function parseCivilDate(
  field: 'dateFrom' | 'dateTo',
  match: RegExpExecArray,
  timestamp = false,
): CivilDateParts {
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };

  if (!isValidCivilDate(parts)) {
    throw new BadRequestException(
      `${field} must contain a valid calendar date`,
    );
  }

  if (!timestamp && !DATE_ONLY_PATTERN.test(match[0])) {
    throw new BadRequestException(
      `${field} must be a YYYY-MM-DD civil date or a complete ISO 8601 timestamp`,
    );
  }

  return parts;
}

function isValidCivilDate({ year, month, day }: CivilDateParts): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const candidate = new Date(0);
  candidate.setUTCFullYear(year, month - 1, day);
  candidate.setUTCHours(0, 0, 0, 0);
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function addCivilDay(date: CivilDateParts): CivilDateParts {
  const next = new Date(0);
  next.setUTCFullYear(date.year, date.month - 1, date.day + 1);
  next.setUTCHours(0, 0, 0, 0);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function compareCivilDates(
  left: CivilDateParts,
  right: CivilDateParts,
): number {
  return (
    left.year - right.year || left.month - right.month || left.day - right.day
  );
}

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, formatter);
    return formatter;
  } catch {
    throw new BadRequestException(`Invalid APP_TIMEZONE value: ${timeZone}`);
  }
}

function zonedMidnightToUtc(
  date: CivilDateParts,
  formatter: Intl.DateTimeFormat,
): Date {
  const wallClockMillis = utcMillis(date);
  let candidateMillis = wallClockMillis;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offsetMillis = getTimeZoneOffsetMillis(
      new Date(candidateMillis),
      formatter,
    );
    const adjustedMillis = wallClockMillis - offsetMillis;
    if (adjustedMillis === candidateMillis) {
      return new Date(candidateMillis);
    }
    candidateMillis = adjustedMillis;
  }

  // A small number of IANA zones have historically skipped local midnight.
  // In that case, use the first representable instant of the civil date.
  const searchStart = wallClockMillis - 36 * 60 * 60 * 1000;
  const searchEnd = wallClockMillis + 36 * 60 * 60 * 1000;
  for (
    let instantMillis = searchStart;
    instantMillis <= searchEnd;
    instantMillis += 60 * 1000
  ) {
    const local = getLocalDateTimeParts(new Date(instantMillis), formatter);
    if (
      local.year === date.year &&
      local.month === date.month &&
      local.day === date.day
    ) {
      return new Date(instantMillis);
    }
  }

  throw new BadRequestException('Unable to resolve the civil date boundary');
}

function getTimeZoneOffsetMillis(
  instant: Date,
  formatter: Intl.DateTimeFormat,
): number {
  const local = getLocalDateTimeParts(instant, formatter);
  return utcMillis(local) - instant.getTime();
}

function getLocalDateTimeParts(
  instant: Date,
  formatter: Intl.DateTimeFormat,
): LocalDateTimeParts {
  const values = Object.fromEntries(
    formatter.formatToParts(instant).map(({ type, value }) => [type, value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function utcMillis(parts: LocalDateTimeParts | CivilDateParts): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(
    'hour' in parts ? parts.hour : 0,
    'minute' in parts ? parts.minute : 0,
    'second' in parts ? parts.second : 0,
    0,
  );
  return date.getTime();
}
