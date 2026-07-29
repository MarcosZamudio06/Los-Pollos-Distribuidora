const POS_DEVICE_ID_KEY = 'pollos-pos-device-id'
const POS_DEVICE_ID_CREATED_KEY = 'pollos-pos-device-id-created'

export type PosDeviceIdentity = {
  id: string
  isNew: boolean
}

export function getPosDeviceIdentity(): PosDeviceIdentity {
  if (typeof window === 'undefined') return { id: 'server-device', isNew: false }
  const stored = window.localStorage.getItem(POS_DEVICE_ID_KEY)?.trim()
  if (stored) return { id: stored, isNew: window.sessionStorage.getItem(POS_DEVICE_ID_CREATED_KEY) === stored }
  const id = crypto.randomUUID()
  window.localStorage.setItem(POS_DEVICE_ID_KEY, id)
  window.sessionStorage.setItem(POS_DEVICE_ID_CREATED_KEY, id)
  return { id, isNew: true }
}

export function getPosDeviceId() {
  return getPosDeviceIdentity().id
}
