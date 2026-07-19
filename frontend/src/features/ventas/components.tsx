import { AlertTriangle, CheckCircle2, PackageSearch, Search, ShoppingCart } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { OperationalLocation } from '../compras/types'
import type { CartItem, CustomerOption, PaymentMethod, PaymentType, ProductOption, TicketData } from './types'
import { calculateCartTotal, calculateItemSubtotal, getCreditRestriction, getQuantityValidationError, toMoney, type CreditRestrictionOptions } from './posLogic'
import { operationalUnitLabel, paymentMethodLabel, paymentTypeLabel } from './saleLabels'

type ProductSearchProps = {
  error: unknown
  isLoading: boolean
  locations: OperationalLocation[]
  locationsError: unknown
  locationsLoading: boolean
  locationId: string
  onAdd: (product: ProductOption) => void
  onLocationChange: (locationId: string) => void
  onSearchChange: (search: string) => void
  products: ProductOption[]
  search: string
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return String(error.message)
  return fallback
}

const panelClass = 'rounded-[1.5rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5 shadow-[var(--erp-shadow)]'
const inputClass = 'rounded-xl border border-[color:var(--erp-border)] bg-white px-4 py-3 text-[var(--erp-foreground)] outline-none transition focus:border-[var(--erp-info)] focus:ring-2 focus:ring-[rgba(47,111,115,0.16)]'

function effectiveCreditLabel(customer: CustomerOption) {
  const status = customer.creditSummary?.effectiveCreditStatus ?? customer.effectiveCreditStatus
  if (status === 'BLOCKED') return 'Crédito bloqueado'
  if (status === 'WARNING') return 'Advertencia de crédito'
  return 'Crédito disponible'
}

function overduePolicyLabel(customer: CustomerOption) {
  const mode = customer.creditSummary?.overdueBlockingMode
  if (mode === 'BLOCK_NEW_CREDIT') return 'Bloquea crédito nuevo'
  if (mode === 'WARN_ONLY') return 'Solo advertencia'
  return 'Sin bloqueo automático'
}

export function ProductSearch({
  error,
  isLoading,
  locations,
  locationsError,
  locationsLoading,
  locationId,
  onAdd,
  onLocationChange,
  onSearchChange,
  products,
  search,
}: ProductSearchProps) {
  return (
    <section className={panelClass}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-info)]">Ubicación y productos</p>
          <h2 className="mt-1 text-xl font-black tracking-[-0.04em]">Buscador de productos</h2>
        </div>
        <PackageSearch className="h-6 w-6 text-[var(--erp-muted-foreground)]" />
      </div>
      <div className="grid gap-3 md:grid-cols-[0.9fr_1.1fr]">
        <label className="grid gap-2 text-sm font-bold text-[var(--erp-muted-foreground)]">
          Ubicación operativa
          <select
            className={inputClass}
            onChange={(event) => onLocationChange(event.target.value)}
            value={locationId}
          >
            <option value="">Selecciona ubicación operativa</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}{location.code ? ` · ${location.code}` : ''}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold text-[var(--erp-muted-foreground)]">
          Búsqueda de productos
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-muted-foreground)]" />
            <input
              className={`${inputClass} w-full pl-10`}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Busca por nombre o SKU"
              value={search}
            />
          </span>
        </label>
      </div>

      {!locationId && (
        <p className="mt-4 rounded-2xl border border-[rgba(214,155,45,0.30)] bg-[rgba(214,155,45,0.12)] p-3 text-sm font-bold text-[var(--erp-brand-gold-deep)]">
          Selecciona una ubicación operativa antes de agregar productos. El inventario del POS nunca es global.
        </p>
      )}
      {locationsLoading && <p className="mt-4 rounded-2xl bg-[rgba(47,111,115,0.08)] p-3 text-sm font-bold text-[var(--erp-info)]">Cargando ubicaciones operativas...</p>}
      {Boolean(locationsError) && <p role="alert" className="mt-4 rounded-2xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] p-3 text-sm font-bold text-[var(--erp-danger)]">{errorMessage(locationsError, 'No se pudieron cargar las ubicaciones operativas.')}</p>}
      {isLoading && <p className="mt-4 rounded-2xl bg-[rgba(47,111,115,0.08)] p-3 text-sm font-bold text-[var(--erp-info)]">Cargando productos...</p>}
      {Boolean(error) && <p role="alert" className="mt-4 rounded-2xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] p-3 text-sm font-bold text-[var(--erp-danger)]">{errorMessage(error, 'La búsqueda de productos falló.')}</p>}
      {locationId && !isLoading && !error && products.length === 0 && (
        <p className="mt-4 rounded-2xl border border-dashed border-[color:var(--erp-border)] p-4 text-sm text-[var(--erp-muted-foreground)]">No se encontraron productos para esta ubicación y búsqueda.</p>
      )}
      <div className="mt-5 grid gap-3">
        {products.map((product) => {
          const hasNoStock = product.availableKg <= 0 && product.availablePieces <= 0
          return (
            <article className="rounded-[1.25rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] p-4 transition hover:border-[rgba(47,111,115,0.35)]" key={product.id}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-danger)]">{product.presentationType} · {product.unit}</p>
                  <h3 className="mt-1 text-xl font-black tracking-[-0.04em]">{product.name}</h3>
                  <p className="text-sm text-[var(--erp-muted-foreground)]">SKU {product.sku ?? '—'} · Precio {toMoney(product.salePrice)}</p>
                  <p className="mt-2 text-sm font-bold text-[var(--erp-foreground)]">
                    {product.locationName ?? product.locationId}: {product.availableKg} kg · {product.availablePieces} piezas
                  </p>
                  <p className="text-xs font-bold text-[var(--erp-muted-foreground)]">Equivalencia: {String(product.equivalentPolicyStatus ?? 'No requerida')}</p>
                </div>
                <div className="flex items-center gap-3">
                  {hasNoStock ? <span className="rounded-full border border-[rgba(157,45,36,0.22)] bg-[rgba(157,45,36,0.08)] px-3 py-1 text-xs font-black text-[var(--erp-danger)]">Sin stock</span> : product.isLowStock && <span className="rounded-full border border-[rgba(214,155,45,0.28)] bg-[rgba(214,155,45,0.14)] px-3 py-1 text-xs font-black text-[var(--erp-brand-gold-deep)]">Bajo stock</span>}
                  <button
                    className="rounded-xl bg-[var(--erp-foreground)] px-4 py-3 text-sm font-black text-white transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:bg-[rgba(107,101,90,0.40)] disabled:hover:translate-y-0"
                    disabled={!locationId || product.locationId !== locationId || hasNoStock}
                    onClick={() => onAdd(product)}
                    type="button"
                  >
                    Agregar
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

type CartProps = {
  items: CartItem[]
  onRemove: (productId: string) => void
  onQuantityChange: (productId: string, quantityKg: number, quantityPieces: number) => void
}

export function Cart({ items, onQuantityChange, onRemove }: CartProps) {
  return (
    <section className={panelClass}>
      <div className="flex items-center justify-between gap-4"><h2 className="text-2xl font-black tracking-[-0.05em]">Carrito</h2><ShoppingCart className="h-5 w-5 text-[var(--erp-muted-foreground)]" /></div>
      {items.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-[color:var(--erp-border)] p-4 text-sm text-[var(--erp-muted-foreground)]">Agrega productos para iniciar una venta. Los carritos vacíos no se pueden confirmar.</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {items.map((item) => {
            const validation = getQuantityValidationError(item)
            return (
              <article className="rounded-[1.25rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] p-4" key={item.productId}>
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-black">{item.name}</p>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">{item.unit} · {item.locationName ?? item.locationId}</p>
                  </div>
                  <button className="text-sm font-black text-[var(--erp-danger)]" onClick={() => onRemove(item.productId)} type="button">Eliminar</button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {(item.unit === 'KG' || item.unit === 'KG_AND_PIECE') && (
                    <label className="grid gap-1 text-sm font-bold text-[var(--erp-muted-foreground)]">
                      Kilos capturados
                      <input className="rounded-xl border border-[color:var(--erp-border)] bg-white px-3 py-2" min="0" onChange={(event) => onQuantityChange(item.productId, Number(event.target.value), item.quantityPieces)} step="0.01" type="number" value={item.quantityKg || ''} />
                    </label>
                  )}
                  {(item.unit === 'PIECE' || item.unit === 'KG_AND_PIECE') && (
                    <label className="grid gap-1 text-sm font-bold text-[var(--erp-muted-foreground)]">
                      Piezas capturadas
                      <input className="rounded-xl border border-[color:var(--erp-border)] bg-white px-3 py-2" min="0" onChange={(event) => onQuantityChange(item.productId, item.quantityKg, Number(event.target.value))} step="1" type="number" value={item.quantityPieces || ''} />
                    </label>
                  )}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div><dt className="text-[var(--erp-muted-foreground)]">Stock</dt><dd className="font-bold">{item.availableKg} kg · {item.availablePieces} piezas</dd></div>
                  <div><dt className="text-[var(--erp-muted-foreground)]">Vista previa del subtotal</dt><dd className="font-bold">{toMoney(calculateItemSubtotal(item))}</dd></div>
                </dl>
                {validation && <p role="alert" className="mt-3 rounded-xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] p-3 text-sm font-bold text-[var(--erp-danger)]">{validation}</p>}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

type CustomerSelectorProps = {
  customers: CustomerOption[]
  error: unknown
  isLoading: boolean
  onSearchChange: (search: string) => void
  onSelect: (customer: CustomerOption | null) => void
  search: string
  selectedCustomer: CustomerOption | null
}

export function CustomerSelector({ customers, error, isLoading, onSearchChange, onSelect, search, selectedCustomer }: CustomerSelectorProps) {
  return (
    <section className={panelClass}>
      <h2 className="text-lg font-black tracking-[-0.04em]">Cliente</h2>
      <input className={`${inputClass} mt-3 w-full`} onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar cliente registrado" value={search} />
      {isLoading && <p className="mt-3 text-sm font-bold text-[var(--erp-info)]">Cargando clientes...</p>}
      {Boolean(error) && <p role="alert" className="mt-3 text-sm font-bold text-[var(--erp-danger)]">{errorMessage(error, 'La búsqueda de clientes falló.')}</p>}
      {selectedCustomer && (
        <article className="mt-3 rounded-2xl bg-[var(--erp-foreground)] p-4 text-white">
          <div className="flex items-start justify-between gap-3"><div><p className="font-black">{selectedCustomer.name}</p><p className="text-sm text-white/70">{selectedCustomer.customerType} · Estado administrativo {selectedCustomer.creditStatus ?? '—'}</p></div><span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-black">{effectiveCreditLabel(selectedCustomer)}</span></div>
          <div className="mt-3 grid gap-1 text-sm text-white/75"><p>Vencido {toMoney(selectedCustomer.creditSummary?.overdueAmount)}</p><p>{selectedCustomer.creditSummary?.maximumDaysOverdue ?? selectedCustomer.creditSummary?.daysOverdue ?? 0} días de atraso</p><p>{overduePolicyLabel(selectedCustomer)}</p></div>
          <button className="mt-3 text-sm font-black text-[var(--erp-brand-gold)]" onClick={() => onSelect(null)} type="button">Limpiar cliente</button>
        </article>
      )}
      <div className="mt-3 grid max-h-72 gap-2 overflow-auto">
        {customers.map((customer) => (
          <button className="rounded-xl border border-[color:var(--erp-border)] bg-white p-3 text-left transition hover:border-[var(--erp-info)] disabled:opacity-50" disabled={customer.isActive === false || customer.active === false} key={customer.id} onClick={() => onSelect(customer)} type="button">
            <span className="flex items-center justify-between gap-2"><span className="font-black">{customer.name}</span><span className="text-xs font-black text-[var(--erp-muted-foreground)]">{effectiveCreditLabel(customer)}</span></span>
            <span className="text-sm text-[var(--erp-muted-foreground)]">{customer.customerType} · {customer.creditSummary?.availableCredit !== undefined ? `Disponible ${toMoney(customer.creditSummary.availableCredit)}` : customer.creditLimit !== undefined && customer.creditLimit !== null ? `Límite ${toMoney(customer.creditLimit)}` : 'Límite —'}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

type PaymentMethodSelectorProps = {
  initialPaymentAmount: number
  onPaymentMethodChange: (method: PaymentMethod) => void
  onInitialPaymentAmountChange: (amount: number) => void
  onPaymentTypeChange: (type: PaymentType) => void
  paymentMethod: PaymentMethod
  paymentType: PaymentType
}

export function PaymentMethodSelector({
  initialPaymentAmount,
  onInitialPaymentAmountChange,
  onPaymentMethodChange,
  onPaymentTypeChange,
  paymentMethod,
  paymentType,
}: PaymentMethodSelectorProps) {
  return (
    <section className={panelClass}>
      <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black tracking-[-0.04em]">Tipo de venta y pago</h2><AlertTriangle className="h-5 w-5 text-[var(--erp-brand-gold-deep)]" /></div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className={`rounded-xl px-4 py-3 font-black ${paymentType === 'CASH_SALE' ? 'bg-[var(--erp-foreground)] text-white' : 'bg-[var(--erp-surface-muted)] text-[var(--erp-muted-foreground)]'}`} onClick={() => onPaymentTypeChange('CASH_SALE')} type="button">Venta de contado</button>
        <button className={`rounded-xl px-4 py-3 font-black ${paymentType === 'CREDIT_SALE' ? 'bg-[var(--erp-foreground)] text-white' : 'bg-[var(--erp-surface-muted)] text-[var(--erp-muted-foreground)]'}`} onClick={() => onPaymentTypeChange('CREDIT_SALE')} type="button">Venta a crédito</button>
      </div>
      <label className="mt-4 grid gap-2 text-sm font-bold text-[var(--erp-muted-foreground)]">
        Método del pago inicial
        <select className={inputClass} onChange={(event) => onPaymentMethodChange(event.target.value as PaymentMethod)} value={paymentMethod}>
          <option value="">No se recibe dinero ahora</option>
          <option value="CASH">Efectivo</option>
          <option value="CARD">Tarjeta</option>
          <option value="TRANSFER">Transferencia</option>
          <option value="CHECK">Cheque</option>
        </select>
      </label>
      {paymentType === 'CREDIT_SALE' && (
        <label className="mt-4 grid gap-2 text-sm font-bold text-[var(--erp-muted-foreground)]">
          Monto del pago inicial
          <input
            className={inputClass}
            min="0"
            onChange={(event) => onInitialPaymentAmountChange(Number(event.target.value))}
            step="0.01"
            type="number"
            value={initialPaymentAmount}
          />
        </label>
      )}
      {paymentType === 'CREDIT_SALE' && <p className="mt-3 text-sm text-[var(--erp-muted-foreground)]">Las ventas a crédito generan cuentas por cobrar. La cobranza se mantiene en su propio flujo.</p>}
    </section>
  )
}

type BillingRequestPanelProps = {
  hasCustomer: boolean
  notes: string
  onNotesChange: (notes: string) => void
  onReasonChange: (reason: string) => void
  onRequiresAdministrativeInvoiceChange: (requiresAdministrativeInvoice: boolean) => void
  reason: string
  requiresAdministrativeInvoice: boolean
}

export function BillingRequestPanel({
  hasCustomer,
  notes,
  onNotesChange,
  onReasonChange,
  onRequiresAdministrativeInvoiceChange,
  reason,
  requiresAdministrativeInvoice,
}: BillingRequestPanelProps) {
  return (
    <section className={panelClass}>
      <h2 className="text-lg font-black tracking-[-0.04em]">Documento administrativo</h2>
      <div className="mt-3 grid gap-3">
        <label className="flex items-start gap-3 rounded-2xl bg-[var(--erp-surface-muted)] p-3 text-sm font-bold text-[var(--erp-muted-foreground)]">
          <input checked={requiresAdministrativeInvoice} disabled={!hasCustomer} onChange={(event) => onRequiresAdministrativeInvoiceChange(event.target.checked)} type="checkbox" />
          Vincula esta venta con una solicitud administrativa interna.
        </label>
        {!hasCustomer && <p className="text-sm font-semibold text-[var(--erp-danger)]">Selecciona un cliente antes de solicitar seguimiento administrativo.</p>}
        {requiresAdministrativeInvoice && <>
          <label className="grid gap-2 text-sm font-bold text-[var(--erp-muted-foreground)]">Motivo obligatorio<input className={inputClass} onChange={(event) => onReasonChange(event.target.value)} placeholder="Describe por qué requiere seguimiento" required value={reason} /></label>
          <label className="grid gap-2 text-sm font-bold text-[var(--erp-muted-foreground)]">Notas opcionales<textarea className={`${inputClass} min-h-24 resize-y`} onChange={(event) => onNotesChange(event.target.value)} placeholder="Indicaciones para administración" value={notes} /></label>
        </>}
        <p className="rounded-2xl border border-[rgba(47,111,115,0.20)] bg-[rgba(47,111,115,0.08)] p-3 text-sm font-bold text-[var(--erp-info)]">
          Solo relación administrativa interna. Esto no emite CFDI, UUID SAT, timbrado ni ninguna factura fiscal.
        </p>
      </div>
    </section>
  )
}

type SaleSummaryProps = {
  cart: CartItem[]
  creditOptions?: CreditRestrictionOptions
  customer: CustomerOption | null
  paymentType: PaymentType
}

export function SaleSummary({ cart, creditOptions, customer, paymentType }: SaleSummaryProps) {
  const total = calculateCartTotal(cart)
  const creditRestriction = getCreditRestriction(paymentType, customer, total, creditOptions)
  return (
    <section className={panelClass}>
      <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black tracking-[-0.04em]">Resumen de la venta</h2><CheckCircle2 className="h-5 w-5 text-[var(--erp-success)]" /></div>
      <dl className="mt-4 grid gap-3 text-sm">
        <div className="flex justify-between"><dt>Partidas</dt><dd className="font-black">{cart.length}</dd></div>
        <div className="flex justify-between"><dt>Subtotal previo</dt><dd className="font-black">{toMoney(total)}</dd></div>
        <div className="flex justify-between"><dt>Tipo de venta</dt><dd className="font-black">{paymentTypeLabel(paymentType)}</dd></div>
        <div className="flex justify-between"><dt>Límite de crédito</dt><dd className="font-black">{customer ? toMoney(customer.creditSummary?.creditLimit ?? customer.creditLimit) : '—'}</dd></div>
        <div className="flex justify-between"><dt>Crédito disponible</dt><dd className="font-black">{customer?.creditSummary?.availableCredit !== undefined ? toMoney(customer.creditSummary.availableCredit) : '—'}</dd></div>
        <div className="flex justify-between"><dt>Saldo pendiente</dt><dd className="font-black">{customer?.creditSummary?.outstandingAmount !== undefined ? toMoney(customer.creditSummary.outstandingAmount) : '—'}</dd></div>
        <div className="flex justify-between"><dt>Saldo vencido</dt><dd className="font-black text-[var(--erp-danger)]">{customer ? toMoney(customer.creditSummary?.overdueAmount) : '—'}</dd></div>
        <div className="flex justify-between"><dt>Días máximos de atraso</dt><dd className="font-black">{customer?.creditSummary?.maximumDaysOverdue ?? customer?.creditSummary?.daysOverdue ?? '—'}</dd></div>
        <div className="flex justify-between"><dt>Política de mora</dt><dd className="font-black">{customer ? overduePolicyLabel(customer) : '—'}</dd></div>
      </dl>
      {creditRestriction && <p role="alert" className="mt-4 rounded-2xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] p-3 text-sm font-bold text-[var(--erp-danger)]">{creditRestriction}</p>}
      {paymentType === 'CREDIT_SALE' && customer?.creditSummary?.effectiveCreditStatus === 'WARNING' && <p className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-800"><AlertTriangle className="mr-2 inline h-4 w-4" />El cliente tiene saldo vencido. La política permite continuar con advertencia.</p>}
      {creditOptions?.overrideEnabled && !creditRestriction && <p className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-800">La venta continuará con autorización administrativa y motivo auditable.</p>}
      {paymentType === 'CREDIT_SALE' && !creditRestriction && <p className="mt-4 rounded-2xl border border-[rgba(47,111,115,0.20)] bg-[rgba(47,111,115,0.08)] p-3 text-sm font-bold text-[var(--erp-info)]">Esta venta generará una cuenta por cobrar por el saldo pendiente.</p>}
    </section>
  )
}

type ConfirmSaleButtonProps = {
  disabledReason?: string | null
  isSubmitting: boolean
  onConfirm: () => void
}

export function ConfirmSaleButton({ disabledReason, isSubmitting, onConfirm }: ConfirmSaleButtonProps) {
  return (
    <div className="grid gap-2">
      <button className="rounded-[1.25rem] bg-[var(--erp-danger)] px-5 py-4 text-lg font-black text-white shadow-[0_18px_45px_rgba(157,45,36,0.22)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:bg-[rgba(107,101,90,0.40)] disabled:shadow-none disabled:hover:translate-y-0" disabled={Boolean(disabledReason) || isSubmitting} onClick={onConfirm} type="button">
        {isSubmitting ? 'Confirmando venta...' : 'Confirmar venta'}
      </button>
      {disabledReason && <p className="text-sm font-bold text-[var(--erp-danger)]">{disabledReason}</p>}
    </div>
  )
}

type TicketModalProps = {
  fallback?: TicketData | null
  isLoading: boolean
  onClose: () => void
  ticket?: TicketData
}

function receiptDate(value?: string) {
  return value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : 'Generado al confirmar la venta'
}

function receiptNumber(data: TicketData) {
  return data.physicalFolio ?? data.ticketNumber ?? data.saleNumber ?? data.ticketId ?? 'Venta confirmada'
}

function receiptPaid(data: TicketData) {
  return data.payments?.reduce((total, payment) => total + Number(payment.amount ?? 0), 0) ?? 0
}

function ReceiptItems({ data, detailed = false }: { data: TicketData; detailed?: boolean }) {
  return (
    <div className="receipt-items">
      {detailed && <div className="receipt-item receipt-item-header"><span>Cant.</span><span>Unidad</span><span>Descripción</span><span>P. unitario</span><span>Importe</span></div>}
      {data.items?.map((item, index) => {
        const quantity = Number(item.quantityKg ?? item.kilos ?? 0) || Number(item.quantityPieces ?? item.pieces ?? 0)
        return detailed ? (
          <div className="receipt-item" key={`${item.productName ?? item.product ?? 'item'}-${index}`}>
            <span>{quantity.toLocaleString('es-MX', { maximumFractionDigits: 3 })}</span>
            <span>{operationalUnitLabel(item.unit)}</span>
            <strong>{item.productName ?? item.product}</strong>
            <span>{toMoney(item.unitPrice)}</span>
            <span>{toMoney(item.subtotal)}</span>
          </div>
        ) : (
          <article className="receipt-simple-item" key={`${item.productName ?? item.product ?? 'item'}-${index}`}>
            <span>{quantity.toLocaleString('es-MX', { maximumFractionDigits: 3 })}</span>
            <strong>{item.productName ?? item.product}</strong>
            <span>{toMoney(item.subtotal)}</span>
          </article>
        )
      })}
    </div>
  )
}

function ReceiptTotals({ data, includeBalance = false }: { data: TicketData; includeBalance?: boolean }) {
  const paid = receiptPaid(data)
  const balance = Math.max(Number(data.total ?? 0) - paid, 0)
  return (
    <dl className="receipt-totals">
      <div><dt>Subtotal</dt><dd>{toMoney(data.subtotal)}</dd></div>
      <div><dt>Descuento</dt><dd>{toMoney(data.discount)}</dd></div>
      <div className="receipt-grand-total"><dt>TOTAL</dt><dd>{toMoney(data.total)}</dd></div>
      {includeBalance && <><div><dt>Pagado</dt><dd>{toMoney(paid)}</dd></div><div><dt>Saldo</dt><dd>{toMoney(balance)}</dd></div></>}
    </dl>
  )
}

function SimpleNote({ data }: { data: TicketData }) {
  const paid = receiptPaid(data)
  const change = Math.max(paid - Number(data.total ?? 0), 0)
  return (
    <div className="receipt-document receipt-format-simple">
      <header className="receipt-brand receipt-brand-centered"><img alt="El Pollo de Los Pollos" src="/477123481_10232415903693976_8230121272963336539_n.svg" /><strong>El Pollo de Los Pollos</strong><span>{data.locationName ?? data.locationId ?? 'Punto de venta'}</span></header>
      <section className="receipt-section"><h2>NOTA DE VENTA</h2><p><b>Folio:</b> {receiptNumber(data)}</p><p><b>Fecha:</b> {receiptDate(data.createdAt)}</p><p><b>Vendedor:</b> {data.sellerName ?? '—'}</p><p><b>Cliente:</b> {data.customerName ?? 'Público general'}</p></section>
      <div className="receipt-simple-head"><span>CANT.</span><span>PRODUCTO</span><span>IMPORTE</span></div>
      <ReceiptItems data={data} />
      <ReceiptTotals data={data} />
      <dl className="receipt-payment"><div><dt>Pago: {paymentMethodLabel(data.payments?.[0]?.paymentMethod)}</dt><dd>{toMoney(paid)}</dd></div>{change > 0 && <div><dt>Cambio</dt><dd>{toMoney(change)}</dd></div>}</dl>
      <footer className="receipt-footer"><strong>Gracias por su compra</strong><span>No es comprobante fiscal</span></footer>
    </div>
  )
}

function LargeNote({ data }: { data: TicketData }) {
  return (
    <div className="receipt-document receipt-format-large">
      <header className="receipt-brand"><img alt="El Pollo de Los Pollos" src="/477123481_10232415903693976_8230121272963336539_n.svg" /><div><strong>El Pollo de Los Pollos</strong><span>{data.locationName ?? data.locationId ?? 'Punto de venta'}</span></div></header>
      <section className="receipt-title-row"><div><h2>NOTA DE VENTA</h2><p><b>Fecha:</b> {receiptDate(data.createdAt)}</p></div><p><b>Folio:</b> {receiptNumber(data)}</p></section>
      <section className="receipt-section"><h3>DATOS DEL CLIENTE</h3><p><b>Nombre:</b> {data.customerName ?? 'Público general'}</p>{data.customerAddress && <p><b>Dirección:</b> {data.customerAddress}</p>}{data.customerPhone && <p><b>Teléfono:</b> {data.customerPhone}</p>}{data.customerTaxId && <p><b>RFC:</b> {data.customerTaxId}</p>}<p><b>Condición:</b> {data.paymentType === 'CREDIT_SALE' ? `Crédito${data.customerCreditDays ? ` a ${data.customerCreditDays} días` : ''}` : 'Contado'}</p></section>
      <ReceiptItems data={data} detailed />
      <ReceiptTotals data={data} includeBalance />
      <section className="receipt-signatures"><span>Entregó: ______________</span><span>Recibió: ______________</span><span>Firma: ________________</span><span>Firma: _________________</span></section>
      <footer className="receipt-footer">Documento comercial no válido como comprobante fiscal</footer>
    </div>
  )
}

function InternalReceipt({ data }: { data: TicketData }) {
  const paid = receiptPaid(data) || Number(data.total ?? 0)
  return (
    <div className="receipt-document receipt-format-internal">
      <header className="receipt-brand"><img alt="El Pollo de Los Pollos" src="/477123481_10232415903693976_8230121272963336539_n.svg" /><div><strong>El Pollo de Los Pollos</strong><h2>RECIBO INTERNO</h2><span>NO VÁLIDO COMO COMPROBANTE FISCAL</span></div></header>
      <section className="receipt-section"><p><b>Folio:</b> {receiptNumber(data)}</p><p><b>Fecha:</b> {receiptDate(data.createdAt)}</p><p><b>Sucursal:</b> {data.locationName ?? data.locationId ?? '—'}</p></section>
      <section className="receipt-section"><h3>TIPO DE MOVIMIENTO</h3><strong>Registro interno de venta</strong><p><b>Se recibió de:</b> {data.customerName ?? 'Público general'}</p><p className="receipt-amount"><b>Cantidad:</b> {toMoney(paid)}</p><p><b>Concepto:</b> Cobro de venta {data.saleNumber ?? receiptNumber(data)}</p><p><b>Referencia:</b> {receiptNumber(data)}</p></section>
      <section className="receipt-signatures receipt-signatures-three"><span>Entregó: ______________</span><span>Recibió: ______________</span><span>Autorizó: ______________</span></section>
      <footer className="receipt-footer"><strong>DOCUMENTO DE CONTROL INTERNO</strong></footer>
    </div>
  )
}

function ReceiptDocument({ data }: { data: TicketData }) {
  if (data.documentType === 'LARGE_NOTE') return <LargeNote data={data} />
  if (data.documentType === 'INTERNAL_RECEIPT') return <InternalReceipt data={data} />
  return <SimpleNote data={data} />
}

export function TicketModal({ fallback, isLoading, onClose, ticket }: TicketModalProps) {
  const portalReady = useSyncExternalStore(() => () => undefined, () => true, () => false)
  const data = ticket ?? fallback
  if (!data) return null
  const modal = (
    <aside className="ticket-print-root fixed inset-0 z-40 grid place-items-center bg-black/55 p-3 sm:p-6">
      <section className={`ticket-print-content max-h-[94vh] w-full overflow-y-auto bg-white text-[#171717] shadow-2xl sm:rounded-md ${data.documentType === 'SIMPLE_NOTE' ? 'max-w-[25rem]' : 'max-w-[52rem]'}`}>
        <div className="ticket-actions sticky top-0 z-10 flex justify-end gap-5 border-b border-[#ececec] bg-white/95 px-6 py-4 backdrop-blur sm:px-10">
          <button className="text-sm font-bold text-[#292929] transition hover:text-black" onClick={() => window.print()} type="button">Imprimir</button>
          <button className="text-sm font-bold text-[#686868] transition hover:text-black" onClick={onClose} type="button">Cerrar</button>
        </div>
        <div className="p-5 sm:p-8">
          {isLoading && <p className="mb-4 rounded-lg bg-[#f5f3ee] p-3 text-sm font-bold text-[#39798b]">Cargando datos del documento...</p>}
          <ReceiptDocument data={data} />
        </div>
      </section>
    </aside>
  )

  return portalReady ? createPortal(modal, document.body) : modal
}
