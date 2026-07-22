export const OPERATIONAL_TIME_ZONE = 'America/Mexico_City'

export function getOperationalDate(date = new Date(), timeZone = OPERATIONAL_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value

  return `${value('year')}-${value('month')}-${value('day')}`
}
