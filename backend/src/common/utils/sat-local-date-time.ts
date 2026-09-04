export const DEFAULT_CFDI_FISCAL_TIME_ZONE = 'America/Mexico_City';

const OFFSET_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i;
const SAT_LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

export function isValidIanaTimeZone(timeZone: string): boolean {
  const normalized = timeZone.trim();
  if (!normalized) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function formatSatLocalDateTime(
  value: string | Date,
  timeZone: string,
): string {
  if (!isValidIanaTimeZone(timeZone)) {
    throw new Error('SAT_LOCAL_DATE_TIME_INVALID_TIME_ZONE');
  }

  let instant: Date;
  if (value instanceof Date) {
    instant = new Date(value.getTime());
  } else {
    const normalized = value.trim();
    if (!OFFSET_INSTANT.test(normalized)) {
      throw new Error('SAT_LOCAL_DATE_TIME_INVALID_INSTANT');
    }
    instant = new Date(normalized);
  }
  if (Number.isNaN(instant.getTime())) {
    throw new Error('SAT_LOCAL_DATE_TIME_INVALID_INSTANT');
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone.trim(),
    calendar: 'gregory',
    numberingSystem: 'latn',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  const result = `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
  if (!SAT_LOCAL_DATE_TIME.test(result)) {
    throw new Error('SAT_LOCAL_DATE_TIME_INVALID_FORMAT');
  }
  return result;
}
