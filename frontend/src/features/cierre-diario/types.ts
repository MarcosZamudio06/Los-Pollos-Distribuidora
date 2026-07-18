export type DailyCloseStatus = 'DRAFT' | 'REVIEWED' | 'CLOSED' | 'CANCELLED'

export function canValidateDailyClose(status: DailyCloseStatus) {
  return status === 'DRAFT'
}

export function canAutoRefreshDailyClose(status: DailyCloseStatus) {
  return status === 'DRAFT'
}

export type CostQuality = 'EXACT' | 'ESTIMATED'

export function costQualityLabel(quality: CostQuality) {
  return quality === 'EXACT' ? 'Costo exacto' : 'Costo estimado'
}

export function canUseLocationForDailyClose(type: string) {
  return type === 'BRANCH' || type === 'MIXED' || type === 'EXTERNAL_POINT_OF_SALE'
}

export type DailyClose = {
  id: string; operationalLocationId: string; businessDate: string; status: DailyCloseStatus; version: number
  operationalLocation: { id: string; name: string; code?: string | null }
  totalInputKg: string; totalSoldKg: string; totalRemainingKg: string; totalShortageKg: string; totalSurplusKg: string
  scaleReportedKg: string; scaleDifferenceKg: string; cashTotal: string; cardVoucherTotal: string; transferTotal: string
  expenseTotal: string; grossSalesTotal: string; netCashExpected: string; cashDifferenceTotal: string; purchaseCostTotal: string
  grossProfitTotal: string; netProfitTotal: string; lastValidatedAt?: string | null
  costQuality: CostQuality; dataAsOf: string
  cashMovements: Array<{ id: string; amount: string; reason: string; reference?: string | null; occurredAt: string }>
  scaleTicketReferences: Array<{ id: string; physicalFolio: string; weightKg?: string | null; pieceCount?: number | null; amount?: string | null; product?: { name: string } | null }>
}
