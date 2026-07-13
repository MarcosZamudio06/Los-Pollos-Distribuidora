import { useState, type FormEvent } from 'react'
import { CircleDollarSign, X } from 'lucide-react'
import { useRegisterReceivablePayment } from '../hooks/useAccountsReceivable'
import { formatMoney, toNumber } from './formatters'
import type { AccountReceivable, PaymentMethod } from '../types'
import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { toast } from 'sonner'

type PaymentRegistrationDialogProps = {
  account: AccountReceivable
  onClose: () => void
}

const paymentMethods: PaymentMethod[] = ['CASH', 'TRANSFER', 'DEPOSIT', 'CARD', 'CHECK']
const fieldClass = 'h-11 rounded-xl border border-[color:var(--erp-border)] bg-white px-3.5 text-sm text-[var(--erp-foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition placeholder:text-[var(--erp-muted-foreground)]/70 focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)] disabled:cursor-not-allowed disabled:bg-[var(--erp-surface-muted)] disabled:opacity-70'

export function PaymentRegistrationDialog({ account, onClose }: PaymentRegistrationDialogProps) {
  const outstandingAmount = toNumber(account.outstandingAmount)
  const registerPayment = useRegisterReceivablePayment(account.id)
  const [amount, setAmount] = useState(String(outstandingAmount))
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [bankName, setBankName] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [appliedDocumentId, setAppliedDocumentId] = useState('')
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10))
  const [collectionPass, setCollectionPass] = useState('')
  const [pendingPayment, setPendingPayment] = useState<Parameters<typeof registerPayment.mutateAsync>[0] | null>(null)
  const numericAmount = Number(amount)
  const amountError = !Number.isFinite(numericAmount) || numericAmount <= 0
    ? 'El monto debe ser mayor a cero.'
    : numericAmount > outstandingAmount
      ? 'El monto no puede exceder el saldo pendiente mostrado.'
      : null
  const cannotPay = account.status === 'PAID' || account.status === 'CANCELLED'

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (amountError || cannotPay) return
    setPendingPayment({
      accountReceivableId: account.id,
      amount: numericAmount,
      paymentMethod,
      bankName,
      referenceNumber,
      appliedDocumentId,
      appliedDocumentType: appliedDocumentId ? 'INTERNAL_DOCUMENT' : undefined,
      collectionPass: collectionPass ? Number(collectionPass) : undefined,
      paidAt: paidAt ? new Date(`${paidAt}T00:00:00`).toISOString() : undefined,
    })
  }

  async function confirmRegistration() {
    if (!pendingPayment || registerPayment.isPending) return
    try {
      await registerPayment.mutateAsync(pendingPayment)
      toast.success('Pago registrado correctamente.')
      setPendingPayment(null)
      onClose()
    } catch {
      // TanStack Query expone el error existente; el modal y la captura permanecen abiertos.
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-[rgba(17,24,21,0.58)] p-4 backdrop-blur-sm">
      <form className="w-full max-w-2xl overflow-hidden rounded-[1.6rem] border border-[color:var(--erp-border)] bg-white shadow-2xl" onSubmit={(event) => void handleSubmit(event)}>
        <div className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--erp-info)]"><CircleDollarSign className="h-4 w-4" /> Registro de pago</p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.05em]">{account.customerName ?? account.customerId}</h2>
              <p className="mt-2 text-sm text-[var(--erp-muted-foreground)]">Saldo pendiente: <strong className="text-[var(--erp-danger)]">{formatMoney(account.outstandingAmount)}</strong></p>
            </div>
            <button className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--erp-border)] bg-white text-[var(--erp-muted-foreground)] transition hover:border-[var(--erp-brand-gold)] hover:text-[var(--erp-foreground)]" onClick={onClose} type="button" aria-label="Cerrar"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="p-6">
          {cannotPay && <p role="alert" className="mb-4 rounded-2xl bg-[rgba(157,45,36,0.10)] p-4 text-sm font-semibold text-[var(--erp-danger)]">No se pueden registrar pagos sobre cuentas pagadas o canceladas.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold">Monto<input className={fieldClass} min="0.01" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
            <label className="grid gap-2 text-sm font-semibold">Método<select className={fieldClass} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>{paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></label>
            <label className="grid gap-2 text-sm font-semibold">Banco<input className={fieldClass} value={bankName} onChange={(event) => setBankName(event.target.value)} /></label>
            <label className="grid gap-2 text-sm font-semibold">Referencia<input className={fieldClass} value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} /></label>
            <label className="grid gap-2 text-sm font-semibold">Documento aplicado<input className={fieldClass} value={appliedDocumentId} onChange={(event) => setAppliedDocumentId(event.target.value)} /></label>
            <label className="grid gap-2 text-sm font-semibold">Fecha de pago<input className={fieldClass} type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} /></label>
            <label className="grid gap-2 text-sm font-semibold sm:col-span-2">Vuelta de cobranza<input className={fieldClass} min="1" type="number" value={collectionPass} onChange={(event) => setCollectionPass(event.target.value)} /></label>
          </div>
          {amountError && <p role="alert" className="mt-4 text-sm font-semibold text-[var(--erp-danger)]">{amountError}</p>}
          {registerPayment.error && <p role="alert" className="mt-4 text-sm font-semibold text-[var(--erp-danger)]">{registerPayment.error instanceof Error ? registerPayment.error.message : 'No se pudo registrar el pago.'}</p>}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button className="inline-flex h-11 items-center justify-center rounded-xl border border-[color:var(--erp-border)] bg-white px-5 text-sm font-semibold transition hover:border-[var(--erp-brand-gold)] hover:bg-[var(--erp-surface-muted)]" onClick={onClose} type="button">Cancelar</button>
            <button className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--erp-charcoal)] px-5 text-sm font-black text-white transition hover:bg-[var(--erp-graphite)] disabled:opacity-50" disabled={Boolean(amountError) || cannotPay || registerPayment.isPending} type="submit">{registerPayment.isPending ? 'Registrando...' : 'Registrar pago'}</button>
          </div>
        </div>
      </form>
      <ConfirmationDialog confirmLabel="Confirmar registro" description="Verifique el pago antes de aplicarlo a la cuenta por cobrar." isLoading={registerPayment.isPending} onConfirm={confirmRegistration} onOpenChange={(open) => { if (!open) setPendingPayment(null) }} open={Boolean(pendingPayment)} title="Confirmar registro de pago">
        <p><strong>Cliente:</strong> {account.customerName ?? account.customerId}</p><p><strong>Monto:</strong> {formatMoney(pendingPayment?.amount ?? 0)}</p><p><strong>Forma de pago:</strong> {pendingPayment?.paymentMethod}</p><p><strong>Fecha:</strong> {pendingPayment?.paidAt ? new Date(pendingPayment.paidAt).toLocaleDateString('es-MX') : '—'}</p>
        {registerPayment.error && <p className="font-semibold text-[var(--erp-danger)]" role="alert">{registerPayment.error instanceof Error ? registerPayment.error.message : 'No se pudo registrar el pago.'}</p>}
      </ConfirmationDialog>
    </div>
  )
}
