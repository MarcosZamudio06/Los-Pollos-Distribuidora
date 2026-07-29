import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPosDeviceIdentity } from '../deviceIdentity'

function createStorage() {
  const values = new Map<string, string>()
  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe('getPosDeviceIdentity', () => {
  let localStorage: ReturnType<typeof createStorage>
  let sessionStorage: ReturnType<typeof createStorage>

  beforeEach(() => {
    localStorage = createStorage()
    sessionStorage = createStorage()
    vi.stubGlobal('window', { localStorage, sessionStorage })
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps the newly-created signal for the current browser session', () => {
    expect(getPosDeviceIdentity()).toEqual({ id: '00000000-0000-4000-8000-000000000001', isNew: true })
    expect(getPosDeviceIdentity()).toEqual({ id: '00000000-0000-4000-8000-000000000001', isNew: true })
  })

  it('recognizes an existing device identity in a new browser session', () => {
    localStorage.setItem('pollos-pos-device-id', 'device-registered')

    expect(getPosDeviceIdentity()).toEqual({ id: 'device-registered', isNew: false })
  })
})
