/**
 * Formats an instant for an HTML datetime-local input without turning UTC into
 * a local wall-clock value a second time when the form is submitted.
 */
export function toDateTimeLocalInput(
  date = new Date(),
  timezoneOffsetMinutes = date.getTimezoneOffset(),
) {
  const localWallClock = new Date(
    date.getTime() - timezoneOffsetMinutes * 60_000,
  );
  return localWallClock.toISOString().slice(0, 16);
}

export function toIsoDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("La fecha y hora capturadas no son válidas.");
  }
  return parsed.toISOString();
}
