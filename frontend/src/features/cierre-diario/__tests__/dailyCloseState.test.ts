import { describe, expect, it } from 'vitest'
import { canAutoRefreshDailyClose, canValidateDailyClose, costQualityLabel } from '../types'
import { getDailyCloseTransitionCopy } from '../dailyCloseTransition'

describe('daily close validation availability', () => {
  it('allows validation only while the close is editable', () => {
    expect(canValidateDailyClose('DRAFT')).toBe(true)
    expect(canValidateDailyClose('REVIEWED')).toBe(false)
    expect(canValidateDailyClose('CLOSED')).toBe(false)
    expect(canValidateDailyClose('CANCELLED')).toBe(false)
  })
})

it('uses explicit operational copy for closing and reopening reports', () => {
  expect(getDailyCloseTransitionCopy('close')).toMatchObject({
    title: 'Confirmar cierre de jornada',
    confirmLabel: 'Cerrar jornada',
    requiresReason: false,
  })
  expect(getDailyCloseTransitionCopy('reopen')).toMatchObject({
    title: 'Reabrir cierre diario',
    confirmLabel: 'Confirmar reapertura',
    requiresReason: true,
  })
})

it('refreshes only editable closes and labels estimated costs clearly', () => {
  expect(canAutoRefreshDailyClose('DRAFT')).toBe(true)
  expect(canAutoRefreshDailyClose('CLOSED')).toBe(false)
  expect(costQualityLabel('EXACT')).toBe('Costo exacto')
  expect(costQualityLabel('ESTIMATED')).toBe('Costo estimado')
})
