import {
  operationalDateTimeToIso,
  toOperationalDateTimeInput,
} from "../../lib/operationalDate";

/**
 * Formats an instant for an HTML datetime-local input without turning UTC into
 * a local wall-clock value a second time when the form is submitted.
 */
export function toDateTimeLocalInput(
  date = new Date(),
  timezoneOffsetMinutes?: number,
) {
  if (timezoneOffsetMinutes === undefined)
    return toOperationalDateTimeInput(date).slice(0, 16);
  const localWallClock = new Date(
    date.getTime() - timezoneOffsetMinutes * 60_000,
  );
  return localWallClock.toISOString().slice(0, 16);
}

export function toIsoDateTime(value: string) {
  return operationalDateTimeToIso(value);
}
