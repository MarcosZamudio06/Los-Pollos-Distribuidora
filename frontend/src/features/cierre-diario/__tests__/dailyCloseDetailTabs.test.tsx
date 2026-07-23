// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DailyCloseDetailTabs, type DailyCloseTab } from '../DailyCloseDetailTabs'
import type { DailyClose } from '../types'

const close: DailyClose = {
  id: 'close-1', operationalLocationId: 'location-1', businessDate: '2026-07-22', status: 'DRAFT', version: 2,
  operationalLocation: { id: 'location-1', name: 'Sucursal Centro' }, totalInputKg: '30', totalSoldKg: '20', totalRemainingKg: '10', totalShortageKg: '1', totalSurplusKg: '0',
  scaleReportedKg: '19.5', scaleDifferenceKg: '-0.5', cashTotal: '300', cardVoucherTotal: '400', transferTotal: '12500', expenseTotal: '80', grossSalesTotal: '13200', netCashExpected: '220', cashCountedTotal: '210', cashDifferenceTotal: '-10', purchaseCostTotal: '8000', grossProfitTotal: '5200', netProfitTotal: '5120', costQuality: 'EXACT', dataAsOf: '2026-07-22T14:00:00.000Z',
  sales: [{ id: 'sale-1', saleNumber: 'V-100', documentType: 'SIMPLE_NOTE', paymentType: 'CASH_SALE', status: 'CONFIRMED', physicalFolio: 'N-100', requiresAdministrativeInvoice: true, total: '13200', createdAt: '2026-07-22T12:00:00.000Z', customer: { id: 'customer-1', name: 'Restaurante El Pollo', taxId: 'RPO010101AA1' }, items: [{ id: 'item-1', productId: 'product-1', productNameSnapshot: 'Pollo entero', productSkuSnapshot: 'POL-001', unit: 'KG', unitPrice: '120', quantityKg: '20', quantityPieces: null, subtotal: '2400', total: '2400', unitCostSnapshot: '70', costSubtotalSnapshot: '1400', costSnapshotSource: 'SALE_CONFIRMATION' }], documents: [{ id: 'document-1', saleId: 'sale-1', documentType: 'SIMPLE_NOTE', physicalFolio: 'N-100', status: 'ISSUED', requiresAdministrativeInvoice: true, createdAt: '2026-07-22T12:00:00.000Z' }], billingRequests: [{ id: 'billing-1', status: 'REQUESTED', requestedAt: '2026-07-22T12:01:00.000Z', customer: { id: 'customer-1', name: 'Restaurante El Pollo', taxId: 'RPO010101AA1' } }] }],
  payments: [{ id: 'payment-1', saleId: 'sale-1', amount: '12500', paymentMethod: 'TRANSFER', status: 'APPLIED', referenceNumber: 'SPEI-123', paidAt: '2026-07-22T12:05:00.000Z' }, { id: 'payment-2', saleId: 'sale-1', amount: '300', paymentMethod: 'CASH', status: 'APPLIED', referenceNumber: 'CAJA-100', paidAt: '2026-07-22T12:06:00.000Z' }],
  cashMovements: [{ id: 'expense-1', amount: '80', type: 'EXPENSE', movementChannel: 'CASH', reason: 'Hielo para mostrador', reference: 'T-22', occurredAt: '2026-07-22T13:00:00.000Z' }],
  scaleTicketReferences: [{ id: 'scale-1', physicalFolio: 'B-100', saleId: 'sale-1', weightKg: '19.5', grossWeightKg: '20', tareWeightKg: '0.5', netWeightKg: '19.5', pieceCount: 1, amount: '2400', captureSource: 'MANUAL', product: { name: 'Pollo entero' } }],
  inventoryMovements: [{ id: 'movement-1', productId: 'product-1', type: 'TRANSFER_IN', quantityKg: '30', quantityPieces: 0, previousQuantityKg: '0', newQuantityKg: '30', reason: 'Resurtido', referenceType: 'TRANSFER', referenceId: 'transfer-1', createdAt: '2026-07-22T08:00:00.000Z', product: { id: 'product-1', name: 'Pollo entero', sku: 'POL-001' } }],
  lines: [{ id: 'line-1', section: 'INCOME', conceptType: 'TRANSFER_INCOME', quantityKg: null, quantityPieces: null, amount: '12500', notes: 'SPEI-123', createdAt: '2026-07-22T12:05:00.000Z' }],
  excludedOperations: [{ id: 'excluded-1', type: 'PAYMENT', reference: 'RUTA-123', amount: '500', reason: 'Pago asociado a una ruta pendiente de liquidación.', occurredAt: '2026-07-22T13:30:00.000Z' }],
}

function renderTab(activeTab: DailyCloseTab) {
  return renderToStaticMarkup(<DailyCloseDetailTabs activeTab={activeTab} canEditInventory={false} canViewFinancials canViewInventory close={close} inventoryReconciliation={null} onDeleteInventoryCount={vi.fn()} onSaveInventoryCount={vi.fn()} onTabChange={vi.fn()} products={[]} validationResult={null} />)
}

describe('daily close operational detail tabs', () => {
  it('renders all required sections and makes financial totals available from the summary', () => {
    const html = renderTab('summary')

    expect(html).toContain('Resumen')
    expect(html).toContain('Producto e inventario')
    expect(html).toContain('Ventas y documentos')
    expect(html).toContain('Caja y pagos')
    expect(html).toContain('Gastos')
    expect(html).toContain('Báscula')
    expect(html).toContain('Diferencias')
    expect(html).toContain('Auditoría')
    expect(html).toContain('Transferencias y depósitos')
    expect(html).toContain('$12,500.00')
  })

  it('renders the operational tables from the daily close response', () => {
    expect(renderTab('sales')).toContain('Restaurante El Pollo')
    expect(renderTab('sales')).toContain('Productos vendidos')
    expect(renderTab('cash')).toContain('SPEI-123')
    expect(renderTab('expenses')).toContain('Hielo para mostrador')
    expect(renderTab('scale')).toContain('B-100')
    expect(renderTab('inventory')).toContain('Entradas de inventario')
    expect(renderTab('audit')).toContain('Operaciones excluidas')
    expect(renderTab('audit')).toContain('RUTA-123')
  })

  it('opens the transfer total with only transfer and deposit payments', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onTabChange = vi.fn()
    function StatefulTabs() {
      const [activeTab, setActiveTab] = useState<DailyCloseTab>('summary')
      return <DailyCloseDetailTabs activeTab={activeTab} canEditInventory={false} canViewFinancials canViewInventory close={close} inventoryReconciliation={null} onDeleteInventoryCount={vi.fn()} onSaveInventoryCount={vi.fn()} onTabChange={(tab) => { onTabChange(tab); setActiveTab(tab) }} products={[]} validationResult={null} />
    }

    try {
      await act(async () => root.render(<StatefulTabs />))
      const transferButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Transferencias y depósitos'))
      if (!transferButton) throw new Error('Transfer total button not found')

      await act(async () => transferButton.click())

      expect(onTabChange).toHaveBeenCalledWith('cash')
      expect(container.textContent).toContain('SPEI-123')
      expect(container.textContent).not.toContain('CAJA-100')
    } finally {
      await act(async () => root.unmount())
    }
  })
})
