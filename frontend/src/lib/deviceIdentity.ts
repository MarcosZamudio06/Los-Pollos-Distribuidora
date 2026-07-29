const POS_DEVICE_ID_KEY = 'pollos-pos-device-id'

export function getPosDeviceId() {
  if (typeof window === 'undefined') return 'server-device'
  const stored = window.localStorage.getItem(POS_DEVICE_ID_KEY)?.trim()
  if (stored) return stored
  const deviceId = crypto.randomUUID()
  window.localStorage.setItem(POS_DEVICE_ID_KEY, deviceId)
  return deviceId
}
