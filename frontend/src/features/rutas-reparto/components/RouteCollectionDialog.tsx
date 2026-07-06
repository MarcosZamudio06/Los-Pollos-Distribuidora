import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useCreateRouteCollection } from '../hooks'
import { money, paymentMethodLabel, shortId } from '../labels'
import type { CollectionPass, DeliveryOrder, PaymentMethod, RouteCollectionResponse } from '../types'
import { Field, PrimaryButton, SecondaryButton, SelectInput, StatusMessage, TextInput } from './RouteUi'

const paymentMethods: PaymentMethod[] = ['CASH', 'TRANSFER', 'CARD', 'DEPOSIT']
const collectionPasses: CollectionPass[] = ['FIRST', 'SECOND']

function nowForInput() {
  return new Date().toISOString().slice(0, 16)
}

function toIsoDateTime(value: string) {
  return new Date(value).toISOString()
}

type SharedCollectionProps = {
  collectionPassMode?: 'editable' | 'second-pass'
  description?: ReactNode
  eyebrow?: string
  onClose: () => void
  onCollected?: (response: RouteCollectionResponse) => void
  order: DeliveryOrder
  routeId: string
  submitLabel?: string
  title?: string
}

function CollectionForm({
  collectionPassMode = 'editable',
  description,
  eyebrow = 'Cobro en ruta',
  onClose,
  onCollected,
  order,
  routeId,
  submitLabel = 'Registrar cobro',
  title = 'Registrar pago',
}: SharedCollectionProps) {
  const outstandingAmount = useMemo(() => Number(order.outstandingAmount ?? 0), [order.outstandingAmount])
  const initialPass = collectionPassMode === 'second-pass' ? 'SECOND' : ((order.collectionPass as CollectionPass | null) ?? 'FIRST')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [reference, setReference] = useState('')
  const [paidAt, setPaidAt] = useState(nowForInput())
  const [collectionPass, setCollectionPass] = useState<CollectionPass>(initialPass)
  const createCollection = useCreateRouteCollection(routeId)
  const numericAmount = Number(amount)
  const hasAccountReceivable = Boolean(order.accountReceivableId)
  const canSubmit = Boolean(hasAccountReceivable && numericAmount > 0 && numericAmount <= outstandingAmount && paidAt)
  const forcedSecondPass = collectionPassMode === 'second-pass'

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit || !order.accountReceivableId) return
    const response = await createCollection.mutateAsync({
      orderId: order.id,
      payload: {
        accountReceivableId: order.accountReceivableId,
        amount: numericAmount,
        collectionPass: forcedSecondPass ? 'SECOND' : collectionPass,
        paidAt: toIsoDateTime(paidAt),
        paymentMethod,
        reference: reference.trim() || undefined,
      },
    })
    onCollected?.(response)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1d2420]/55 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="collection-title">
      <form className="w-full max-w-2xl border border-[#1d2420]/15 bg-white p-6 shadow-[0_30px_90px_rgba(29,36,32,0.30)]" onSubmit={(event) => void handleSubmit(event)}>
        <div className="flex items-start justify-between gap-4 border-b border-[#1d2420]/10 pb-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2f6f73]">{eyebrow}</p>
            <h2 className="mt-1 text-3xl font-black tracking-[-0.05em]" id="collection-title">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#6f786f]">{description ?? 'El cobro se aplica a una sola cuenta por cobrar. No se captura ni se envía routeSettlementId desde esta acción.'}</p>
          </div>
          <SecondaryButton onClick={onClose}>Cerrar</SecondaryButton>
        </div>

        <div className="mt-5 grid gap-3 border border-[#1d2420]/10 bg-[#f7f5ef] p-4 text-sm">
          <p><strong>Cuenta por cobrar:</strong> {order.accountReceivableId ? shortId(order.accountReceivableId) : 'Sin cuenta por cobrar'}</p>
          <p><strong>Saldo visible pendiente:</strong> {money(outstandingAmount)}</p>
          <p><strong>Cobrado derivado de Payment:</strong> {money(order.derivedCollectedAmount)}</p>
          {forcedSecondPass && <p className="border-l-4 border-[#2f6f73] bg-white p-3 font-black text-[#2f6f73]">Este flujo registra la cobranza como segunda vuelta.</p>}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Monto" hint="No puede exceder el saldo pendiente mostrado.">
            <TextInput max={outstandingAmount || undefined} min="0.01" onChange={(event) => setAmount(event.target.value)} required step="0.01" type="number" value={amount} />
          </Field>
          <Field label="Método de pago">
            <SelectInput onChange={(event) => setPaymentMethod(event.target.value)} value={paymentMethod}>
              {paymentMethods.map((method) => <option key={method} value={method}>{paymentMethodLabel(method)}</option>)}
            </SelectInput>
          </Field>
          <Field label="Vuelta de cobranza" hint={forcedSecondPass ? 'Bloqueada para cumplir el flujo de segunda vuelta.' : undefined}>
            {forcedSecondPass ? (
              <div className="border border-[#2f6f73]/25 bg-[#2f6f73]/8 px-3 py-3 text-sm font-black text-[#2f6f73]">Segunda vuelta</div>
            ) : (
              <SelectInput onChange={(event) => setCollectionPass(event.target.value)} value={collectionPass}>
                {collectionPasses.map((item) => <option key={item} value={item}>{item === 'SECOND' ? 'Segunda vuelta' : 'Primera vuelta'}</option>)}
              </SelectInput>
            )}
          </Field>
          <Field label="Fecha de pago">
            <TextInput onChange={(event) => setPaidAt(event.target.value)} required type="datetime-local" value={paidAt} />
          </Field>
          <Field label="Referencia" hint="Opcional: transferencia, depósito o nota de cobro.">
            <TextInput onChange={(event) => setReference(event.target.value)} value={reference} />
          </Field>
        </div>

        {!hasAccountReceivable && <div className="mt-4"><StatusMessage tone="error">Este pedido no muestra cuenta por cobrar. En el MVP no se registra cobro sin accountReceivableId.</StatusMessage></div>}
        {numericAmount > outstandingAmount && <div className="mt-4"><StatusMessage tone="error">El monto no puede superar el saldo pendiente visible.</StatusMessage></div>}
        {createCollection.error && <div className="mt-4"><StatusMessage tone="error">No se pudo registrar el cobro. Revisa saldo, permisos y cuenta por cobrar.</StatusMessage></div>}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton disabled={!canSubmit || createCollection.isPending} type="submit">{createCollection.isPending ? 'Registrando...' : submitLabel}</PrimaryButton>
        </div>
      </form>
    </div>
  )
}

type Props = {
  onClose: () => void
  onCollected?: (response: RouteCollectionResponse) => void
  order: DeliveryOrder
  routeId: string
}

export function RouteCollectionDialog(props: Props) {
  return <CollectionForm {...props} />
}

export function RouteSecondPassCollectionDialog(props: Props) {
  return (
    <CollectionForm
      {...props}
      collectionPassMode="second-pass"
      description="Registra un cobro pendiente de la segunda vuelta. La solicitud envía collectionPass SECOND y no captura ni envía routeSettlementId."
      eyebrow="Segunda vuelta"
      submitLabel="Registrar segunda vuelta"
      title="Registrar cobro de segunda vuelta"
    />
  )
}
