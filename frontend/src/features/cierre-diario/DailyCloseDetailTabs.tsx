import { useState, type ReactNode } from 'react'
import { AlertTriangle, Banknote, Scale } from 'lucide-react'
import { Table, Td, Th } from '../../components/ui/table'
import { formatMoney as money } from '../../lib/money'
import { DailyCloseInventoryReconciliation } from './DailyCloseInventoryReconciliation'
import { DailyCloseValidationPanel } from './DailyCloseValidationPanel'
import type { DailyClose, DailyCloseInventoryReconciliation as InventoryReconciliation, DailyCloseValidationResult } from './types'

export type DailyCloseTab = 'summary' | 'inventory' | 'sales' | 'cash' | 'expenses' | 'scale' | 'differences' | 'audit'

type Tab = { id: DailyCloseTab; label: string; visible: boolean }

type DailyCloseDetailTabsProps = {
  activeTab: DailyCloseTab
  canEditInventory: boolean
  canViewFinancials: boolean
  canViewInventory: boolean
  close: DailyClose
  inventoryReconciliation: InventoryReconciliation | null
  onDeleteInventoryCount: (countId: string) => void
  onSaveInventoryCount: (countId: string | undefined, productId: string, values: { physicalQuantityKg?: number; physicalQuantityPieces?: number; reason: string }) => void
  onTabChange: (tab: DailyCloseTab) => void
  products: Parameters<typeof DailyCloseInventoryReconciliation>[0]['products']
  validationResult: DailyCloseValidationResult | null
  cashCountForm?: ReactNode
  expenseForm?: ReactNode
  scaleTicketForm?: ReactNode
}

const documentTypeLabels: Record<string, string> = {
  INTERNAL_RECEIPT: 'Comprobante interno',
  LARGE_NOTE: 'Nota grande',
  SCALE_TICKET: 'Ticket de báscula',
  SIMPLE_NOTE: 'Nota simple',
}

const paymentMethodLabels: Record<string, string> = {
  CARD: 'Tarjeta',
  CASH: 'Efectivo',
  CHECK: 'Cheque',
  DEPOSIT: 'Depósito',
  OTHER: 'Otro',
  TRANSFER: 'Transferencia',
  VOUCHER: 'Voucher',
}

const inventoryMovementLabels: Record<string, string> = {
  ADJUSTMENT: 'Ajuste',
  IN: 'Entrada',
  PURCHASE: 'Compra',
  RETURN: 'Devolución',
  TRANSFER_IN: 'Traspaso recibido',
}

const lineConceptLabels: Record<string, string> = {
  CARD_VOUCHER_INCOME: 'Tarjeta o voucher',
  CASH_INCOME: 'Efectivo',
  EXPENSE: 'Gasto',
  NET_PROFIT: 'Utilidad neta',
  PRODUCT_RECEIVED: 'Producto recibido',
  SALE_NOTE: 'Venta con nota',
  SALE_SCALE_TICKET: 'Venta con ticket de báscula',
  TRANSFER_INCOME: 'Transferencia',
}

function dateTime(value: string | null | undefined) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function kilograms(value: string | number | null | undefined) {
  return `${Number(value ?? 0).toFixed(3)} kg`
}

function shortId(value: string | null | undefined) {
  return value ? value.slice(-8).toUpperCase() : 'Sin referencia'
}

function EmptyTable({ colSpan, message }: { colSpan: number; message: string }) {
  return <tr><Td className="py-10 text-center text-[var(--erp-muted-foreground)]" colSpan={colSpan}>{message}</Td></tr>
}

function TableSection({ children, description, title }: { children: ReactNode; description: string; title: string }) {
  return <article className="overflow-hidden rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)]">
    <header className="border-b border-[var(--erp-border)] p-5"><h3 className="font-bold">{title}</h3><p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">{description}</p></header>
    <div className="overflow-x-auto">{children}</div>
  </article>
}

function SummaryMetric({ label, onClick, value }: { label: string; onClick: () => void; value: string }) {
  return <button className="rounded-xl bg-[var(--erp-surface-muted)] p-3 text-left transition hover:bg-[rgba(157,45,36,0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand-red)]" onClick={onClick} type="button">
    <span className="block text-[var(--erp-muted-foreground)]">{label}</span><strong className="mt-1 block tabular-nums">{value}</strong>
  </button>
}

function SalesAndDocuments({ close }: { close: DailyClose }) {
  const sales = close.sales ?? []
  const documents = sales.flatMap((sale) => (sale.documents ?? []).map((document) => ({ ...document, saleNumber: sale.saleNumber })))
  const billingCustomers = sales.filter((sale) => sale.requiresAdministrativeInvoice || (sale.billingRequests?.length ?? 0) > 0)
  const productRows = sales.flatMap((sale) => (sale.items ?? []).map((item) => ({ ...item, saleNumber: sale.saleNumber })))
  return <div className="space-y-4">
    <TableSection description="Ventas confirmadas incluidas en esta jornada." title="Ventas incluidas">
      <Table className="min-w-[880px]"><thead><tr><Th>Venta</Th><Th>Documento</Th><Th>Folio</Th><Th>Pago</Th><Th>Estado</Th><Th className="text-right">Total</Th><Th>Registro</Th></tr></thead><tbody>{sales.length === 0 ? <EmptyTable colSpan={7} message="No hay ventas incluidas en este cierre." /> : sales.map((sale) => <tr key={sale.id}><Td className="font-bold">{sale.saleNumber}</Td><Td>{documentTypeLabels[sale.documentType] ?? sale.documentType}</Td><Td>{sale.physicalFolio || 'Sin folio'}</Td><Td>{sale.paymentType === 'CREDIT_SALE' ? 'Crédito' : 'Contado'}</Td><Td>{sale.status}</Td><Td className="text-right font-bold tabular-nums">{money(sale.total)}</Td><Td>{dateTime(sale.createdAt)}</Td></tr>)}</tbody></Table>
    </TableSection>
    <TableSection description="Notas, tickets y comprobantes operativos. No incluye comprobantes fiscales." title="Notas y folios">
      <Table className="min-w-[760px]"><thead><tr><Th>Venta</Th><Th>Tipo</Th><Th>Folio físico</Th><Th>Estado</Th><Th>Factura administrativa</Th><Th>Registro</Th></tr></thead><tbody>{documents.length === 0 ? <EmptyTable colSpan={6} message="No hay documentos operativos asociados." /> : documents.map((document) => <tr key={document.id}><Td className="font-bold">{document.saleNumber}</Td><Td>{documentTypeLabels[document.documentType] ?? document.documentType}</Td><Td>{document.physicalFolio || 'Sin folio'}</Td><Td>{document.status}</Td><Td>{document.requiresAdministrativeInvoice ? 'Solicitada' : 'No requerida'}</Td><Td>{dateTime(document.createdAt)}</Td></tr>)}</tbody></Table>
    </TableSection>
    <TableSection description="Partidas vendidas, con cantidades y valores conservados en la venta." title="Productos vendidos">
      <Table className="min-w-[860px]"><thead><tr><Th>Venta</Th><Th>Producto</Th><Th>SKU</Th><Th className="text-right">Kilos</Th><Th className="text-right">Piezas</Th><Th className="text-right">Precio unitario</Th><Th className="text-right">Importe</Th></tr></thead><tbody>{productRows.length === 0 ? <EmptyTable colSpan={7} message="No hay productos vendidos en este cierre." /> : productRows.map((item) => <tr key={item.id}><Td className="font-bold">{item.saleNumber}</Td><Td>{item.productNameSnapshot}</Td><Td>{item.productSkuSnapshot || 'Sin SKU'}</Td><Td className="text-right tabular-nums">{kilograms(item.quantityKg)}</Td><Td className="text-right tabular-nums">{item.quantityPieces ?? 0}</Td><Td className="text-right tabular-nums">{money(item.unitPrice)}</Td><Td className="text-right font-bold tabular-nums">{money(item.total)}</Td></tr>)}</tbody></Table>
    </TableSection>
    <TableSection description="Solicitudes administrativas separadas de los documentos operativos." title="Clientes facturables">
      <Table className="min-w-[850px]"><thead><tr><Th>Venta</Th><Th>Cliente</Th><Th>RFC</Th><Th>Solicitud administrativa</Th><Th>Estado</Th><Th>Fecha</Th></tr></thead><tbody>{billingCustomers.length === 0 ? <EmptyTable colSpan={6} message="No hay clientes con solicitud administrativa en este cierre." /> : billingCustomers.flatMap((sale) => {
        const requests = sale.billingRequests ?? []
        return requests.length === 0 ? [<tr key={sale.id}><Td className="font-bold">{sale.saleNumber}</Td><Td>{sale.customer?.name ?? 'Cliente no disponible'}</Td><Td>{sale.customer?.taxId ?? 'Sin RFC'}</Td><Td>Solicitud pendiente de registro</Td><Td>Pendiente</Td><Td>{dateTime(sale.createdAt)}</Td></tr>] : requests.map((request) => <tr key={request.id}><Td className="font-bold">{sale.saleNumber}</Td><Td>{request.customer?.name ?? sale.customer?.name ?? 'Cliente no disponible'}</Td><Td>{request.customer?.taxId ?? sale.customer?.taxId ?? 'Sin RFC'}</Td><Td>{shortId(request.id)}</Td><Td>{request.status}</Td><Td>{dateTime(request.requestedAt)}</Td></tr>)
      })}</tbody></Table>
    </TableSection>
  </div>
}

function CashAndPayments({ close, cashCountForm, paymentMethods }: { close: DailyClose; cashCountForm?: ReactNode; paymentMethods: string[] | null }) {
  const payments = (close.payments ?? []).filter((payment) => !paymentMethods || paymentMethods.includes(payment.paymentMethod))
  const paymentDescription = paymentMethods ? `Pagos aplicados de ${paymentMethods.map((method) => paymentMethodLabels[method] ?? method).join(' y ')} que componen el total seleccionado.` : 'Pagos aplicados asociados al cierre. Cada pago de cobranza conserva una sola cuenta por cobrar.'
  return <div className="space-y-4">
    <TableSection description={paymentDescription} title="Pagos incluidos">
      <Table className="min-w-[900px]"><thead><tr><Th>Método</Th><Th>Referencia</Th><Th>Venta</Th><Th>Cuenta por cobrar</Th><Th>Estado</Th><Th className="text-right">Importe</Th><Th>Fecha</Th></tr></thead><tbody>{payments.length === 0 ? <EmptyTable colSpan={7} message="No hay pagos aplicados en este cierre." /> : payments.map((payment) => <tr key={payment.id}><Td>{paymentMethodLabels[payment.paymentMethod] ?? payment.paymentMethod}</Td><Td>{payment.referenceNumber || 'Sin referencia'}</Td><Td>{shortId(payment.saleId)}</Td><Td>{shortId(payment.accountReceivableId)}</Td><Td>{payment.status}</Td><Td className="text-right font-bold tabular-nums">{money(payment.amount)}</Td><Td>{dateTime(payment.paidAt)}</Td></tr>)}</tbody></Table>
    </TableSection>
    {cashCountForm}
  </div>
}

function Expenses({ close, expenseForm }: { close: DailyClose; expenseForm?: ReactNode }) {
  const expenses = (close.cashMovements ?? []).filter((movement) => movement.type === undefined || movement.type === 'EXPENSE')
  return <div className="space-y-4">
    <TableSection description="Gastos trazables por ubicación, usuario y fecha." title="Gastos registrados">
      <Table className="min-w-[760px]"><thead><tr><Th>Motivo</Th><Th>Canal</Th><Th>Referencia</Th><Th>Fecha</Th><Th className="text-right">Importe</Th></tr></thead><tbody>{expenses.length === 0 ? <EmptyTable colSpan={5} message="No hay gastos registrados para este cierre." /> : expenses.map((expense) => <tr key={expense.id}><Td className="font-bold">{expense.reason}</Td><Td>{expense.movementChannel ?? 'Efectivo'}</Td><Td>{expense.reference || 'Sin referencia'}</Td><Td>{dateTime(expense.occurredAt)}</Td><Td className="text-right font-bold tabular-nums">{money(expense.amount)}</Td></tr>)}</tbody></Table>
    </TableSection>
    {expenseForm}
  </div>
}

function ScaleTickets({ close, scaleTicketForm }: { close: DailyClose; scaleTicketForm?: ReactNode }) {
  const tickets = close.scaleTicketReferences ?? []
  return <div className="space-y-4">
    <TableSection description="Referencias capturadas manualmente; no implican una integración con hardware." title="Referencias de báscula">
      <Table className="min-w-[1040px]"><thead><tr><Th>Folio</Th><Th>Producto</Th><Th className="text-right">Bruto</Th><Th className="text-right">Tara</Th><Th className="text-right">Neto</Th><Th className="text-right">Piezas</Th><Th className="text-right">Importe</Th><Th>Venta</Th><Th>Captura</Th></tr></thead><tbody>{tickets.length === 0 ? <EmptyTable colSpan={9} message="No hay referencias de báscula registradas." /> : tickets.map((ticket) => <tr key={ticket.id}><Td className="font-bold">{ticket.physicalFolio}</Td><Td>{ticket.product?.name ?? 'Sin producto'}</Td><Td className="text-right tabular-nums">{kilograms(ticket.grossWeightKg)}</Td><Td className="text-right tabular-nums">{kilograms(ticket.tareWeightKg)}</Td><Td className="text-right tabular-nums">{kilograms(ticket.netWeightKg ?? ticket.weightKg)}</Td><Td className="text-right tabular-nums">{ticket.pieceCount ?? 0}</Td><Td className="text-right tabular-nums">{ticket.amount === undefined || ticket.amount === null ? 'Sin importe' : money(ticket.amount)}</Td><Td>{shortId(ticket.saleId)}</Td><Td>{ticket.captureSource === 'HARDWARE' ? 'Hardware' : 'Manual'}</Td></tr>)}</tbody></Table>
    </TableSection>
    {scaleTicketForm}
  </div>
}

function InventoryEntries({ close }: { close: DailyClose }) {
  const movements = (close.inventoryMovements ?? []).filter((movement) => ['IN', 'PURCHASE', 'RETURN', 'TRANSFER_IN', 'ADJUSTMENT'].includes(movement.type))
  return <TableSection description="Entradas y movimientos de inventario asociados por ubicación a esta jornada." title="Entradas de inventario">
    <Table className="min-w-[940px]"><thead><tr><Th>Producto</Th><Th>Tipo</Th><Th className="text-right">Kilos</Th><Th className="text-right">Piezas</Th><Th>Motivo</Th><Th>Referencia</Th><Th>Fecha</Th></tr></thead><tbody>{movements.length === 0 ? <EmptyTable colSpan={7} message="No hay entradas de inventario asociadas." /> : movements.map((movement) => <tr key={movement.id}><Td className="font-bold">{movement.product?.name ?? shortId(movement.productId)}</Td><Td>{inventoryMovementLabels[movement.type] ?? movement.type}</Td><Td className="text-right tabular-nums">{kilograms(movement.quantityKg)}</Td><Td className="text-right tabular-nums">{movement.quantityPieces ?? 0}</Td><Td>{movement.reason || 'Sin motivo'}</Td><Td>{movement.referenceId ? `${movement.referenceType ?? 'Referencia'} ${shortId(movement.referenceId)}` : 'Sin referencia'}</Td><Td>{dateTime(movement.createdAt)}</Td></tr>)}</tbody></Table>
  </TableSection>
}

function Differences({ close, validationResult }: { close: DailyClose; validationResult: DailyCloseValidationResult | null }) {
  const lines = close.lines ?? []
  return <div className="space-y-4">
    {validationResult ? <DailyCloseValidationPanel result={validationResult} /> : <article className="flex gap-3 rounded-2xl border border-amber-400 bg-amber-50 p-5 text-amber-950"><AlertTriangle className="shrink-0" /><div><h3 className="font-bold">Validación pendiente</h3><p className="mt-1 text-sm">Ejecuta la validación para registrar bloqueantes, diferencias y advertencias.</p></div></article>}
    <TableSection description="Líneas que componen los totales y diferencias de la conciliación." title="Composición de diferencias">
      <Table className="min-w-[850px]"><thead><tr><Th>Sección</Th><Th>Concepto</Th><Th>Producto</Th><Th className="text-right">Kilos</Th><Th className="text-right">Piezas</Th><Th className="text-right">Importe</Th><Th>Notas</Th></tr></thead><tbody>{lines.length === 0 ? <EmptyTable colSpan={7} message="No hay líneas operativas registradas para este cierre." /> : lines.map((line) => <tr key={line.id}><Td>{line.section}</Td><Td>{lineConceptLabels[line.conceptType] ?? line.conceptType}</Td><Td>{line.product?.name ?? 'No aplica'}</Td><Td className="text-right tabular-nums">{line.quantityKg === null || line.quantityKg === undefined ? 'No aplica' : kilograms(line.quantityKg)}</Td><Td className="text-right tabular-nums">{line.quantityPieces ?? 'No aplica'}</Td><Td className="text-right tabular-nums">{line.amount === null || line.amount === undefined ? 'No aplica' : money(line.amount)}</Td><Td>{line.notes || 'Sin notas'}</Td></tr>)}</tbody></Table>
    </TableSection>
  </div>
}

function Audit({ close }: { close: DailyClose }) {
  const excluded = close.excludedOperations ?? []
  return <div className="space-y-4">
    <TableSection description="Operaciones deliberadamente excluidas de este cierre y su motivo." title="Operaciones excluidas">
      <Table className="min-w-[760px]"><thead><tr><Th>Tipo</Th><Th>Referencia</Th><Th>Motivo de exclusión</Th><Th>Fecha</Th><Th className="text-right">Importe</Th></tr></thead><tbody>{excluded.length === 0 ? <EmptyTable colSpan={5} message="No hay operaciones excluidas reportadas para esta jornada." /> : excluded.map((operation) => <tr key={`${operation.type}-${operation.id}`}><Td>{operation.type === 'PAYMENT' ? 'Pago' : 'Venta'}</Td><Td className="font-bold">{operation.reference}</Td><Td>{operation.reason}</Td><Td>{dateTime(operation.occurredAt)}</Td><Td className="text-right tabular-nums">{operation.amount === null || operation.amount === undefined ? 'No aplica' : money(operation.amount)}</Td></tr>)}</tbody></Table>
    </TableSection>
    <article className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5"><h3 className="font-bold">Auditoría del cierre</h3><dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-sm text-[var(--erp-muted-foreground)]">Versión</dt><dd className="mt-1 font-bold">{close.version}</dd></div><div><dt className="text-sm text-[var(--erp-muted-foreground)]">Última validación</dt><dd className="mt-1 font-bold">{dateTime(close.lastValidatedAt)}</dd></div><div><dt className="text-sm text-[var(--erp-muted-foreground)]">Datos al corte</dt><dd className="mt-1 font-bold">{dateTime(close.dataAsOf)}</dd></div><div><dt className="text-sm text-[var(--erp-muted-foreground)]">Estado</dt><dd className="mt-1 font-bold">{close.status}</dd></div></dl></article>
  </div>
}

export function DailyCloseDetailTabs(props: DailyCloseDetailTabsProps) {
  const { activeTab, canEditInventory, canViewFinancials, canViewInventory, close, inventoryReconciliation, onDeleteInventoryCount, onSaveInventoryCount, onTabChange, products, validationResult } = props
  const [paymentMethods, setPaymentMethods] = useState<string[] | null>(null)
  const tabs: Tab[] = [
    { id: 'summary', label: 'Resumen', visible: true },
    { id: 'inventory', label: 'Producto e inventario', visible: canViewInventory },
    { id: 'sales', label: 'Ventas y documentos', visible: canViewFinancials },
    { id: 'cash', label: 'Caja y pagos', visible: canViewFinancials },
    { id: 'expenses', label: 'Gastos', visible: canViewFinancials },
    { id: 'scale', label: 'Báscula', visible: canViewInventory },
    { id: 'differences', label: 'Diferencias', visible: true },
    { id: 'audit', label: 'Auditoría', visible: true },
  ]
  const visibleTabs = tabs.filter((tab) => tab.visible)
  const navigate = (tab: DailyCloseTab, methods: string[] | null = null) => {
    setPaymentMethods(methods)
    onTabChange(tab)
  }

  return <section className="space-y-4">
    <div aria-label="Secciones del cierre" className="overflow-x-auto rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-2" role="tablist">
      <div className="flex min-w-max gap-1">{visibleTabs.map((tab) => <button aria-controls={`daily-close-panel-${tab.id}`} aria-selected={activeTab === tab.id} className={`rounded-xl px-4 py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand-red)] ${activeTab === tab.id ? 'bg-[var(--erp-brand-red)] text-white shadow-sm' : 'text-[var(--erp-muted-foreground)] hover:bg-[var(--erp-surface-muted)] hover:text-[var(--erp-foreground)]'}`} id={`daily-close-tab-${tab.id}`} key={tab.id} onClick={() => navigate(tab.id)} role="tab" type="button">{tab.label}</button>)}</div>
    </div>
    <div aria-labelledby={`daily-close-tab-${activeTab}`} id={`daily-close-panel-${activeTab}`} role="tabpanel">
      {activeTab === 'summary' && <div className="grid gap-4 lg:grid-cols-2"><article className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5"><h3 className="flex items-center gap-2 font-bold"><Banknote size={18} /> Ventas e ingresos</h3><p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Selecciona un total para revisar las operaciones que lo componen.</p><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><SummaryMetric label="Ventas del día" onClick={() => navigate('sales')} value={money(close.grossSalesTotal)} /><SummaryMetric label="Efectivo recibido" onClick={() => navigate('cash', ['CASH'])} value={money(close.cashTotal)} /><SummaryMetric label="Vouchers y tarjetas" onClick={() => navigate('cash', ['CARD', 'VOUCHER'])} value={money(close.cardVoucherTotal)} /><SummaryMetric label="Transferencias y depósitos" onClick={() => navigate('cash', ['TRANSFER', 'DEPOSIT'])} value={money(close.transferTotal)} /><SummaryMetric label="Gastos" onClick={() => navigate('expenses')} value={money(close.expenseTotal)} /><SummaryMetric label="Diferencia de efectivo" onClick={() => navigate('differences')} value={close.cashDifferenceTotal === null ? 'Pendiente de captura' : money(close.cashDifferenceTotal)} /></div></article><article className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5"><h3 className="flex items-center gap-2 font-bold"><Scale size={18} /> Producto e inventario</h3><p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Kilos conciliados por entradas, ventas, báscula y conteo físico.</p><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><SummaryMetric label="Kilos recibidos" onClick={() => navigate('inventory')} value={kilograms(close.totalInputKg)} /><SummaryMetric label="Kilos vendidos" onClick={() => navigate('sales')} value={kilograms(close.totalSoldKg)} /><SummaryMetric label="Reportados en báscula" onClick={() => navigate('scale')} value={kilograms(close.scaleReportedKg)} /><SummaryMetric label="Diferencia de báscula" onClick={() => navigate('differences')} value={kilograms(close.scaleDifferenceKg)} /><SummaryMetric label="Existencia restante" onClick={() => navigate('inventory')} value={kilograms(close.totalRemainingKg)} /><SummaryMetric label="Faltante / sobrante" onClick={() => navigate('differences')} value={`${kilograms(close.totalShortageKg)} / ${kilograms(close.totalSurplusKg)}`} /></div></article></div>}
      {activeTab === 'inventory' && <div className="space-y-4"><InventoryEntries close={close} /><DailyCloseInventoryReconciliation canEdit={canEditInventory} onDelete={onDeleteInventoryCount} onSave={onSaveInventoryCount} products={products} reconciliation={inventoryReconciliation} /></div>}
      {activeTab === 'sales' && <SalesAndDocuments close={close} />}
      {activeTab === 'cash' && <CashAndPayments cashCountForm={props.cashCountForm} close={close} paymentMethods={paymentMethods} />}
      {activeTab === 'expenses' && <Expenses close={close} expenseForm={props.expenseForm} />}
      {activeTab === 'scale' && <ScaleTickets close={close} scaleTicketForm={props.scaleTicketForm} />}
      {activeTab === 'differences' && <Differences close={close} validationResult={validationResult} />}
      {activeTab === 'audit' && <Audit close={close} />}
    </div>
  </section>
}
