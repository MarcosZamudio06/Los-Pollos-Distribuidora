import { describe, expect, it } from 'vitest'
import { canUseLocationForDailyClose } from '../types'

describe('daily close locations', () => {
  it('includes registered branches and mixed branches, but excludes warehouses and route stock', () => {
    expect(canUseLocationForDailyClose('BRANCH')).toBe(true)
    expect(canUseLocationForDailyClose('MIXED')).toBe(true)
    expect(canUseLocationForDailyClose('EXTERNAL_POINT_OF_SALE')).toBe(true)
    expect(canUseLocationForDailyClose('WAREHOUSE')).toBe(false)
    expect(canUseLocationForDailyClose('ROUTE_STOCK')).toBe(false)
  })
})
