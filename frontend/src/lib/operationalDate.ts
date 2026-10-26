export const OPERATIONAL_TIME_ZONE = "America/Mexico_City";

export function getOperationalDate(
  date = new Date(),
  timeZone = String(import.meta.env.VITE_APP_TIMEZONE || OPERATIONAL_TIME_ZONE),
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;

  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function getOperationalTimeZone() {
  return String(import.meta.env.VITE_APP_TIMEZONE || OPERATIONAL_TIME_ZONE);
}

export function toOperationalDateTimeInput(
  date = new Date(),
  timeZone = getOperationalTimeZone(),
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}`;
}

/** Interpret an explicit civil date/wall time in the operational IANA zone, never the browser's zone. */
export function operationalDateTimeToIso(
  value: string,
  timeZone = getOperationalTimeZone(),
) {
  const normalized =
    value.length === 10
      ? `${value}T00:00:00`
      : value.length === 16
        ? `${value}:00`
        : value;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(
    normalized,
  );
  if (!match) throw new Error("La fecha operacional no es válida.");
  const numbers = match.slice(1).map(Number);
  const utc = Date.UTC(
    numbers[0],
    numbers[1] - 1,
    numbers[2],
    numbers[3],
    numbers[4],
    numbers[5],
  );
  let instant = utc;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const represented = toOperationalDateTimeInput(new Date(instant), timeZone);
    if (represented === normalized) return new Date(instant).toISOString();
    const wallUtc = Date.parse(`${represented}Z`);
    instant += utc - wallUtc;
  }
  throw new Error("La fecha y hora no existen en la zona operacional.");
}
