import { AlertTriangle, CheckCircle2, PackageSearch, Search, ShoppingCart } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { OperationalLocation } from '../compras/types'
import type { CartItem, CustomerOption, PaymentMethod, PaymentType, ProductOption, TicketData } from './types'
import { calculateCartTotal, calculateItemSubtotal, getCreditRestriction, getQuantityValidationError, toMoney, type CreditRestrictionOptions } from './posLogic'
import { documentTypeLabel, operationalUnitLabel, paymentMethodLabel, paymentTypeLabel } from './saleLabels'

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

export function TicketModal({ fallback, isLoading, onClose, ticket }: TicketModalProps) {
  const portalReady = useSyncExternalStore(() => () => undefined, () => true, () => false)
  const data = ticket ?? fallback
  if (!data) return null
  const modal = (
    <aside className="ticket-print-root fixed inset-0 z-40 grid place-items-center bg-black/55 p-3 sm:p-6">
      <section className="ticket-print-content max-h-[94vh] w-full max-w-[42rem] overflow-y-auto bg-white text-[#171717] shadow-2xl sm:rounded-md">
        <div className="ticket-actions sticky top-0 z-10 flex justify-end gap-5 border-b border-[#ececec] bg-white/95 px-6 py-4 backdrop-blur sm:px-10">
          <button className="text-sm font-bold text-[#292929] transition hover:text-black" onClick={() => window.print()} type="button">Imprimir</button>
          <button className="text-sm font-bold text-[#686868] transition hover:text-black" onClick={onClose} type="button">Cerrar</button>
        </div>
        <div className="px-6 py-9 sm:px-12 sm:py-12">
          <header>
            <img alt="" aria-hidden="true" className="h-16 w-auto max-w-[11rem] object-contain object-left" src="/477123481_10232415903693976_8230121272963336539_n.svg" />
            <h2 className="mt-9 text-[2rem] font-black leading-[1.08] tracking-[-0.04em] sm:text-[2.4rem]">Comprobante de venta</h2>
            <p className="mt-3 text-base leading-relaxed text-[#696969] sm:text-lg">{data.createdAt ? new Date(data.createdAt).toLocaleString('es-MX') : 'Generado al confirmar la venta'}</p>
          </header>
        {isLoading && <p className="mt-4 rounded-2xl bg-[#f5f3ee] p-3 text-sm font-bold text-[#39798b]">Cargando datos del ticket interno...</p>}
        <dl className="mt-10 grid gap-7 text-sm sm:text-base">
          <div className="ticket-data-row"><dt>Ticket interno</dt><dd>{data.ticketNumber ?? data.saleNumber ?? data.ticketId ?? 'Venta confirmada'}</dd></div>
          <div className="ticket-data-row"><dt>Cliente</dt><dd>{data.customerName ?? 'Público general'}</dd></div>
          <div className="ticket-data-row"><dt>Ubicación</dt><dd>{data.locationName ?? data.locationId ?? '—'}</dd></div>
          <div className="ticket-data-row"><dt>Documento</dt><dd>{documentTypeLabel(data.documentType)} {data.physicalFolio ? `· ${data.physicalFolio}` : ''}</dd></div>
          <div className="ticket-data-row"><dt>Pago</dt><dd>{paymentTypeLabel(data.paymentType)} · {paymentMethodLabel(data.payments?.[0]?.paymentMethod)}</dd></div>
          {data.billingRequest?.id && <div className="ticket-data-row"><dt>Solicitud administrativa</dt><dd>{data.billingRequest.id} · {data.billingRequest.status ?? 'REQUESTED'}</dd></div>}
        </dl>
        <section className="mt-10 border-t border-[#e8e8e8] pt-8">
          <p className="mb-7 text-sm font-semibold text-[#737373]">Detalle de venta</p>
          <div className="grid gap-7">
          {data.items?.map((item, index) => (
            <article className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-5 gap-y-2 text-sm sm:text-base" key={`${item.productName ?? item.product ?? 'item'}-${index}`}>
              <p className="min-w-0 break-words font-bold leading-snug">{item.productName ?? item.product}</p>
              <p className="text-right font-semibold text-[#555]">{toMoney(item.subtotal)}</p>
              <p className="col-span-2 break-words leading-relaxed text-[#6b6b6b]">{operationalUnitLabel(item.unit)} · {item.quantityKg ?? item.kilos ?? 0} kg · {item.quantityPieces ?? item.pieces ?? 0} piezas</p>
            </article>
          ))}
          </div>
        </section>
        <div className="ticket-total-row mt-10 border-t border-[#e8e8e8] pt-8"><span>Total</span><strong>{toMoney(data.total)}</strong></div>
        <p className="mt-10 border-t border-[#e8e8e8] pt-8 text-sm font-semibold leading-relaxed text-[#686868]">Comprobante interno sin validez fiscal. Las solicitudes administrativas son controles internos; este POS no emite CFDI ni comprobantes fiscales.</p>
        </div>
      </section>
    </aside>
  )

  return portalReady ? createPortal(modal, document.body) : modal
}
