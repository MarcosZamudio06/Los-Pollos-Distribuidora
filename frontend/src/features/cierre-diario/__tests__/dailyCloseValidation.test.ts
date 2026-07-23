import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dailyCloseService } from '../dailyCloseService'
import { validationDifferences, validationWarnings } from '../DailyCloseValidationPanel'
import type { DailyClose, DailyCloseValidationResult } from '../types'

const close = {
  id: 'close-1', operationalLocationId: 'location-1', businessDate: '2026-07-22', status: 'DRAFT', version: 1,
  operationalLocation: { id: 'location-1', name: 'Sucursal Centro' }, totalInputKg: '10', totalSoldKg: '5', totalRemainingKg: '5', totalShortageKg: '1.5', totalSurplusKg: '0.25',
  scaleReportedKg: '4', scaleDifferenceKg: '-1', cashTotal: '100', cardVoucherTotal: '0', transferTotal: '0', expenseTotal: '0', grossSalesTotal: '100', netCashExpected: '100', cashCountedTotal: null, cashDifferenceTotal: null, purchaseCostTotal: '60', grossProfitTotal: '40', netProfitTotal: '40', lastValidatedAt: null, costQuality: 'ESTIMATED', dataAsOf: '2026-07-22T12:00:00.000Z',
  cashMovements: [], scaleTicketReferences: [{ id: 'ticket-1', physicalFolio: 'B-10', weightKg: null, pieceCount: null }], sales: [{ saleNumber: 'V-100', physicalFolio: null, documentType: 'SIMPLE_NOTE' }],
} satisfies DailyClose

describe('daily close validation contract', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('preserves invalid validation results instead of extracting only the close', async () => {
    const result: DailyCloseValidationResult = { close, valid: false, errors: [{ code: 'CASH_COUNT_REQUIRED', message: 'Registra el efectivo contado.' }], differences: [{ code: 'CASH_DIFFERENCE', value: -20, unit: 'MXN' }] }
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: result }), { headers: { 'content-type': 'application/json' }, status: 200 }))

    await expect(dailyCloseService.validate('close-1', 'access-token')).resolves.toEqual(result)
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/point-of-sale-daily-closes/close-1/validate', expect.objectContaining({ method: 'POST' }))
  })

  it('groups stock differences and operational warnings for the validation panel', () => {
    const result: DailyCloseValidationResult = { close, valid: false, errors: [], differences: [{ code: 'SCALE_DIFFERENCE', value: -1, unit: 'kg' }] }

    expect(validationDifferences(result).map((item) => item.code)).toEqual(['SCALE_DIFFERENCE', 'SHORTAGE', 'SURPLUS'])
    expect(validationWarnings(close).map((item) => item.code)).toEqual(['ESTIMATED_COST', 'MISSING_FOLIO_V-100', 'INCOMPLETE_SCALE_REFERENCE_ticket-1'])
  })
})
