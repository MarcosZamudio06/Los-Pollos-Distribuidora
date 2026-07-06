import type { CartItem, CustomerOption, PaymentMethod, PaymentType, ProductOption, TicketData } from './types'
import { calculateCartTotal, calculateItemSubtotal, getCreditRestriction, getQuantityValidationError, toMoney } from './posLogic'
import { documentTypeLabel, operationalUnitLabel, paymentMethodLabel, paymentTypeLabel } from './saleLabels'

type ProductSearchProps = {
  error: unknown
  isLoading: boolean
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

export function ProductSearch({
  error,
  isLoading,
  locationId,
  onAdd,
  onLocationChange,
  onSearchChange,
  products,
  search,
}: ProductSearchProps) {
  return (
    <section className="rounded-[2rem] border border-[#20211f]/10 bg-white p-5 shadow-[0_20px_60px_rgba(32,33,31,0.07)]">
      <div className="grid gap-3 md:grid-cols-[0.9fr_1.1fr]">
        <label className="grid gap-2 text-sm font-bold text-[#68645c]">
          Ubicación operativa
          <input
            className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f]"
            onChange={(event) => onLocationChange(event.target.value)}
            placeholder="ID de la ubicación para descontar inventario"
            value={locationId}
          />
        </label>
        <label className="grid gap-2 text-sm font-bold text-[#68645c]">
          Búsqueda de productos
          <input
            className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f]"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Busca por nombre o SKU"
            value={search}
          />
        </label>
      </div>

      {!locationId && (
        <p className="mt-4 rounded-2xl border border-[#f0b44c]/40 bg-[#f0b44c]/15 p-3 text-sm font-bold text-[#7a4a00]">
          Selecciona una ubicación operativa antes de agregar productos. El inventario del POS nunca es global.
        </p>
      )}
      {isLoading && <p className="mt-4 rounded-2xl bg-[#f5f3ee] p-3 text-sm font-bold text-[#39798b]">Cargando productos...</p>}
      {Boolean(error) && <p role="alert" className="mt-4 rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">{errorMessage(error, 'La búsqueda de productos falló.')}</p>}
      {locationId && !isLoading && !error && products.length === 0 && (
        <p className="mt-4 rounded-2xl border border-dashed border-[#20211f]/20 p-4 text-sm text-[#68645c]">No se encontraron productos para esta ubicación y búsqueda.</p>
      )}
      <div className="mt-5 grid gap-3">
        {products.map((product) => (
          <article className="rounded-[1.5rem] border border-[#20211f]/10 bg-[#f5f3ee] p-4" key={product.id}>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#9d2d24]">{product.presentationType} · {product.unit}</p>
                <h3 className="mt-1 text-xl font-black tracking-[-0.04em]">{product.name}</h3>
                <p className="text-sm text-[#68645c]">SKU {product.sku ?? '—'} · Precio {toMoney(product.salePrice)}</p>
                <p className="mt-2 text-sm font-bold text-[#20211f]">
                  {product.locationName ?? product.locationId}: {product.availableKg} kg · {product.availablePieces} piezas
                </p>
                <p className="text-xs font-bold text-[#68645c]">Equivalencia: {String(product.equivalentPolicyStatus ?? 'No requerida')}</p>
              </div>
              <div className="flex items-center gap-3">
                {product.isLowStock && <span className="rounded-full bg-[#f0b44c]/25 px-3 py-1 text-xs font-black text-[#7a4a00]">Bajo stock</span>}
                <button
                  className="rounded-2xl bg-[#20211f] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-[#68645c]/40"
                  disabled={!locationId || product.locationId !== locationId || (product.availableKg <= 0 && product.availablePieces <= 0)}
                  onClick={() => onAdd(product)}
                  type="button"
                >
                  Agregar
                </button>
              </div>
            </div>
          </article>
        ))}
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
    <section className="rounded-[2rem] border border-[#20211f]/10 bg-white p-5">
      <h2 className="text-2xl font-black tracking-[-0.05em]">Carrito</h2>
      {items.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-[#20211f]/20 p-4 text-sm text-[#68645c]">Agrega productos para iniciar una venta. Los carritos vacíos no se pueden confirmar.</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {items.map((item) => {
            const validation = getQuantityValidationError(item)
            return (
              <article className="rounded-[1.5rem] border border-[#20211f]/10 bg-[#f5f3ee] p-4" key={item.productId}>
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-black">{item.name}</p>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#68645c]">{item.unit} · {item.locationName ?? item.locationId}</p>
                  </div>
                  <button className="text-sm font-black text-[#9d2d24]" onClick={() => onRemove(item.productId)} type="button">Eliminar</button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {(item.unit === 'KG' || item.unit === 'KG_AND_PIECE') && (
                    <label className="grid gap-1 text-sm font-bold text-[#68645c]">
                      Kilos capturados
                      <input className="rounded-xl border px-3 py-2" min="0" onChange={(event) => onQuantityChange(item.productId, Number(event.target.value), item.quantityPieces)} step="0.01" type="number" value={item.quantityKg} />
                    </label>
                  )}
                  {(item.unit === 'PIECE' || item.unit === 'KG_AND_PIECE') && (
                    <label className="grid gap-1 text-sm font-bold text-[#68645c]">
                      Piezas capturadas
                      <input className="rounded-xl border px-3 py-2" min="0" onChange={(event) => onQuantityChange(item.productId, item.quantityKg, Number(event.target.value))} step="1" type="number" value={item.quantityPieces} />
                    </label>
                  )}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div><dt className="text-[#68645c]">Stock</dt><dd className="font-bold">{item.availableKg} kg · {item.availablePieces} piezas</dd></div>
                  <div><dt className="text-[#68645c]">Vista previa del subtotal</dt><dd className="font-bold">{toMoney(calculateItemSubtotal(item))}</dd></div>
                </dl>
                {validation && <p role="alert" className="mt-3 rounded-xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">{validation}</p>}
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
    <section className="rounded-[2rem] border border-[#20211f]/10 bg-white p-5">
      <h2 className="text-xl font-black tracking-[-0.04em]">Cliente</h2>
      <input className="mt-3 w-full rounded-2xl border border-[#20211f]/15 px-4 py-3" onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar cliente registrado" value={search} />
      {isLoading && <p className="mt-3 text-sm font-bold text-[#39798b]">Cargando clientes...</p>}
      {Boolean(error) && <p role="alert" className="mt-3 text-sm font-bold text-[#9d2d24]">{errorMessage(error, 'La búsqueda de clientes falló.')}</p>}
      {selectedCustomer && (
        <article className="mt-3 rounded-2xl bg-[#20211f] p-4 text-white">
          <p className="font-black">{selectedCustomer.name}</p>
          <p className="text-sm text-white/70">{selectedCustomer.customerType} · Crédito {selectedCustomer.creditStatus ?? '—'}</p>
          <button className="mt-3 text-sm font-black text-[#f0b44c]" onClick={() => onSelect(null)} type="button">Limpiar cliente</button>
        </article>
      )}
      <div className="mt-3 grid max-h-72 gap-2 overflow-auto">
        {customers.map((customer) => (
          <button className="rounded-2xl border border-[#20211f]/10 p-3 text-left hover:border-[#39798b] disabled:opacity-50" disabled={customer.isActive === false || customer.active === false} key={customer.id} onClick={() => onSelect(customer)} type="button">
            <span className="block font-black">{customer.name}</span>
            <span className="text-sm text-[#68645c]">{customer.customerType} · {customer.creditSummary?.availableCredit !== undefined ? `Disponible ${toMoney(customer.creditSummary.availableCredit)}` : customer.creditLimit !== undefined && customer.creditLimit !== null ? `Límite ${toMoney(customer.creditLimit)}` : 'Límite —'}</span>
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
    <section className="rounded-[2rem] border border-[#20211f]/10 bg-white p-5">
      <h2 className="text-xl font-black tracking-[-0.04em]">Tipo de venta y pago</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className={`rounded-2xl px-4 py-3 font-black ${paymentType === 'CASH_SALE' ? 'bg-[#20211f] text-white' : 'bg-[#f5f3ee] text-[#68645c]'}`} onClick={() => onPaymentTypeChange('CASH_SALE')} type="button">Venta de contado</button>
        <button className={`rounded-2xl px-4 py-3 font-black ${paymentType === 'CREDIT_SALE' ? 'bg-[#20211f] text-white' : 'bg-[#f5f3ee] text-[#68645c]'}`} onClick={() => onPaymentTypeChange('CREDIT_SALE')} type="button">Venta a crédito</button>
      </div>
      <label className="mt-4 grid gap-2 text-sm font-bold text-[#68645c]">
        Método del pago inicial
        <select className="rounded-2xl border border-[#20211f]/15 px-4 py-3" onChange={(event) => onPaymentMethodChange(event.target.value as PaymentMethod)} value={paymentMethod}>
          <option value="">No se recibe dinero ahora</option>
          <option value="CASH">Efectivo</option>
          <option value="CARD">Tarjeta</option>
          <option value="TRANSFER">Transferencia</option>
          <option value="CHECK">Cheque</option>
        </select>
      </label>
      {paymentType === 'CREDIT_SALE' && (
        <label className="mt-4 grid gap-2 text-sm font-bold text-[#68645c]">
          Monto del pago inicial
          <input
            className="rounded-2xl border border-[#20211f]/15 px-4 py-3"
            min="0"
            onChange={(event) => onInitialPaymentAmountChange(Number(event.target.value))}
            step="0.01"
            type="number"
            value={initialPaymentAmount}
          />
        </label>
      )}
      {paymentType === 'CREDIT_SALE' && <p className="mt-3 text-sm text-[#68645c]">Las ventas a crédito generan cuentas por cobrar. La cobranza se mantiene en su propio flujo.</p>}
    </section>
  )
}

type BillingRequestPanelProps = {
  billingRequestId: string
  onBillingRequestIdChange: (billingRequestId: string) => void
  onRequiresAdministrativeInvoiceChange: (requiresAdministrativeInvoice: boolean) => void
  requiresAdministrativeInvoice: boolean
}

export function BillingRequestPanel({
  billingRequestId,
  onBillingRequestIdChange,
  onRequiresAdministrativeInvoiceChange,
  requiresAdministrativeInvoice,
}: BillingRequestPanelProps) {
  return (
    <section className="rounded-[2rem] border border-[#20211f]/10 bg-white p-5">
      <h2 className="text-xl font-black tracking-[-0.04em]">Solicitud administrativa de facturación</h2>
      <div className="mt-3 grid gap-3">
        <label className="flex items-start gap-3 rounded-2xl bg-[#f5f3ee] p-3 text-sm font-bold text-[#68645c]">
          <input checked={requiresAdministrativeInvoice} onChange={(event) => onRequiresAdministrativeInvoiceChange(event.target.checked)} type="checkbox" />
          Vincula esta venta con una solicitud administrativa interna.
        </label>
        <label className="grid gap-2 text-sm font-bold text-[#68645c]">
          ID de la solicitud administrativa
          <input
            className="rounded-2xl border border-[#20211f]/15 px-4 py-3"
            onChange={(event) => onBillingRequestIdChange(event.target.value)}
            placeholder="billingRequestId"
            value={billingRequestId}
          />
        </label>
        <p className="rounded-2xl border border-[#39798b]/20 bg-[#39798b]/10 p-3 text-sm font-bold text-[#39798b]">
          Solo relación administrativa interna. Esto no emite CFDI, UUID SAT, timbrado ni ninguna factura fiscal.
        </p>
      </div>
    </section>
  )
}

type SaleSummaryProps = {
  cart: CartItem[]
  customer: CustomerOption | null
  paymentType: PaymentType
}

export function SaleSummary({ cart, customer, paymentType }: SaleSummaryProps) {
  const total = calculateCartTotal(cart)
  const creditRestriction = getCreditRestriction(paymentType, customer, total)
  return (
    <section className="rounded-[2rem] border border-[#20211f]/10 bg-white p-5">
      <h2 className="text-xl font-black tracking-[-0.04em]">Resumen de la venta</h2>
      <dl className="mt-4 grid gap-3 text-sm">
        <div className="flex justify-between"><dt>Partidas</dt><dd className="font-black">{cart.length}</dd></div>
        <div className="flex justify-between"><dt>Subtotal previo</dt><dd className="font-black">{toMoney(total)}</dd></div>
        <div className="flex justify-between"><dt>Tipo de venta</dt><dd className="font-black">{paymentTypeLabel(paymentType)}</dd></div>
        <div className="flex justify-between"><dt>Límite de crédito</dt><dd className="font-black">{customer ? toMoney(customer.creditSummary?.creditLimit ?? customer.creditLimit) : '—'}</dd></div>
        <div className="flex justify-between"><dt>Crédito disponible</dt><dd className="font-black">{customer?.creditSummary?.availableCredit !== undefined ? toMoney(customer.creditSummary.availableCredit) : '—'}</dd></div>
        <div className="flex justify-between"><dt>Saldo pendiente</dt><dd className="font-black">{customer?.creditSummary?.outstandingAmount !== undefined ? toMoney(customer.creditSummary.outstandingAmount) : '—'}</dd></div>
      </dl>
      {creditRestriction && <p role="alert" className="mt-4 rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">{creditRestriction}</p>}
      {paymentType === 'CREDIT_SALE' && !creditRestriction && <p className="mt-4 rounded-2xl bg-[#39798b]/10 p-3 text-sm font-bold text-[#39798b]">Esta venta generará una cuenta por cobrar por el saldo pendiente.</p>}
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
      <button className="rounded-[1.5rem] bg-[#9d2d24] px-5 py-4 text-lg font-black text-white disabled:cursor-not-allowed disabled:bg-[#68645c]/40" disabled={Boolean(disabledReason) || isSubmitting} onClick={onConfirm} type="button">
        {isSubmitting ? 'Confirmando venta...' : 'Confirmar venta'}
      </button>
      {disabledReason && <p className="text-sm font-bold text-[#9d2d24]">{disabledReason}</p>}
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
  const data = ticket ?? fallback
  if (!data) return null
  return (
    <aside className="fixed inset-0 z-40 grid place-items-center bg-[#20211f]/60 p-4">
      <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white p-6 text-[#20211f] shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#9d2d24]">Ticket interno</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.05em]">{data.ticketNumber ?? data.saleNumber ?? data.ticketId ?? 'Venta confirmada'}</h2>
            <p className="mt-1 text-sm text-[#68645c]">{data.createdAt ? new Date(data.createdAt).toLocaleString('es-MX') : 'Generado al confirmar la venta'}</p>
          </div>
          <div className="flex gap-3">
            <button className="font-black text-[#9d2d24]" onClick={() => window.print()} type="button">Imprimir</button>
            <button className="font-black text-[#68645c]" onClick={onClose} type="button">Cerrar</button>
          </div>
        </div>
        {isLoading && <p className="mt-4 rounded-2xl bg-[#f5f3ee] p-3 text-sm font-bold text-[#39798b]">Cargando datos del ticket interno...</p>}
        <dl className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-[#68645c]">Cliente</dt><dd className="font-bold">{data.customerName ?? 'Público general'}</dd></div>
          <div><dt className="text-[#68645c]">Ubicación</dt><dd className="font-bold">{data.locationName ?? data.locationId ?? '—'}</dd></div>
          <div><dt className="text-[#68645c]">Documento</dt><dd className="font-bold">{documentTypeLabel(data.documentType)} {data.physicalFolio ? `· ${data.physicalFolio}` : ''}</dd></div>
          <div><dt className="text-[#68645c]">Pago</dt><dd className="font-bold">{paymentTypeLabel(data.paymentType)} · {paymentMethodLabel(data.payments?.[0]?.paymentMethod)}</dd></div>
        </dl>
        <div className="mt-5 grid gap-2">
          {data.items?.map((item, index) => (
            <article className="rounded-2xl bg-[#f5f3ee] p-3 text-sm" key={`${item.productName ?? item.product ?? 'item'}-${index}`}>
              <p className="font-black">{item.productName ?? item.product}</p>
              <p className="text-[#68645c]">{operationalUnitLabel(item.unit)} · {item.quantityKg ?? item.kilos ?? 0} kg · {item.quantityPieces ?? item.pieces ?? 0} piezas · {toMoney(item.subtotal)}</p>
            </article>
          ))}
        </div>
        <p className="mt-5 text-right text-3xl font-black tracking-[-0.05em]">{toMoney(data.total)}</p>
        <p className="mt-5 rounded-2xl border border-[#20211f]/10 bg-[#f5f3ee] p-4 text-sm font-bold text-[#68645c]">Comprobante interno sin validez fiscal. Las solicitudes administrativas son controles internos; este POS no emite CFDI ni comprobantes fiscales.</p>
      </section>
    </aside>
  )
}
