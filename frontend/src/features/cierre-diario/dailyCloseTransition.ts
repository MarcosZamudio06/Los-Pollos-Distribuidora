export type DailyCloseReportAction = 'close' | 'reopen'

export function getDailyCloseTransitionCopy(action: DailyCloseReportAction) {
  return action === 'close'
    ? {
        title: 'Confirmar cierre de jornada',
        description: 'El reporte quedará cerrado con los totales actuales y dejará de actualizarse automáticamente.',
        confirmLabel: 'Cerrar jornada',
        requiresReason: false,
      }
    : {
        title: 'Reabrir cierre diario',
        description: 'El reporte volverá a borrador y podrá resincronizar ventas, pagos, gastos y movimientos.',
        confirmLabel: 'Confirmar reapertura',
        requiresReason: true,
      }
}
