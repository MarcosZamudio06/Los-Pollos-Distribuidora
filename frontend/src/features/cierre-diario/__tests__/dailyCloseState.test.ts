import { describe, expect, it } from 'vitest'
import { canValidateDailyClose } from '../types'

describe('daily close validation availability', () => {
  it('allows validation only while the close is editable', () => {
    expect(canValidateDailyClose('DRAFT')).toBe(true)
    expect(canValidateDailyClose('REVIEWED')).toBe(false)
    expect(canValidateDailyClose('CLOSED')).toBe(false)
    expect(canValidateDailyClose('CANCELLED')).toBe(false)
  })
})
