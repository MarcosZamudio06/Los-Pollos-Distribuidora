import { describe, expect, it } from 'vitest'
import { getOperationalDate } from '../operationalDate'

describe('getOperationalDate', () => {
  it('uses the Mexico City calendar day instead of the UTC date', () => {
    expect(getOperationalDate(new Date('2026-07-22T01:00:00.000Z'))).toBe('2026-07-21')
  })
})
