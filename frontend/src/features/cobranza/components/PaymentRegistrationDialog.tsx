import { useState, type FormEvent } from 'react'
import { useRegisterReceivablePayment } from '../hooks/useAccountsReceivable'
import { formatMoney, toNumber } from './formatters'
import type { AccountReceivable, PaymentMethod } from '../types'

type PaymentRegistrationDialogProps = {
  account: AccountReceivable
  onClose: () => void
}

const paymentMethods: PaymentMethod[] = ['CASH', 'TRANSFER', 'DEPOSIT', 'CARD', 'CHECK']

export function PaymentRegistrationDialog({ account, onClose }: PaymentRegistrationDialogProps) {
  const outstandingAmount = toNumber(account.outstandingAmount)
  const [amount, setAmount] = useState(String(outstandingAmount))
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [bankName, setBankName] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [appliedDocumentId, setAppliedDocumentId] = useState('')
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10))
  const [collectionPass, setCollectionPass] = useState('')
  const registerPayment = useRegisterReceivablePayment(account.id)
  const numericAmount = Number(amount)
  const amountError = !Number.isFinite(numericAmount) || numericAmount <= 0
    ? 'El monto debe ser mayor a cero.'
    : numericAmount > outstandingAmount
      ? 'El monto no puede exceder el saldo pendiente mostrado.'
      : null
  const cannotPay = account.status === 'PAID' || account.status === 'CANCELLED'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (amountError || cannotPay) return
    await registerPayment.mutateAsync({
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
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-[#20211f]/50 p-4">
      <form className="w-full max-w-xl rounded-[2rem] bg-white p-6 shadow-2xl" onSubmit={(event) => void handleSubmit(event)}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#39798b]">Registro de pago</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.05em]">{account.customerName ?? account.customerId}</h2>
            <p className="mt-2 text-sm text-[#68645c]">Saldo pendiente: {formatMoney(account.outstandingAmount)}</p>
          </div>
          <button className="font-bold text-[#68645c]" onClick={onClose} type="button">Cerrar</button>
        </div>
        {cannotPay && <p role="alert" className="mt-4 rounded-2xl bg-[#d43f2f]/10 p-4 text-sm font-bold text-[#9d2d24]">No se pueden registrar pagos sobre cuentas pagadas o canceladas.</p>}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold">Monto<input className="rounded-xl border border-[#20211f]/15 p-3" min="0.01" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          <label className="grid gap-2 text-sm font-bold">Método<select className="rounded-xl border border-[#20211f]/15 p-3" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>{paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-bold">Banco<input className="rounded-xl border border-[#20211f]/15 p-3" value={bankName} onChange={(event) => setBankName(event.target.value)} /></label>
          <label className="grid gap-2 text-sm font-bold">Referencia<input className="rounded-xl border border-[#20211f]/15 p-3" value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} /></label>
          <label className="grid gap-2 text-sm font-bold">Documento aplicado<input className="rounded-xl border border-[#20211f]/15 p-3" value={appliedDocumentId} onChange={(event) => setAppliedDocumentId(event.target.value)} /></label>
          <label className="grid gap-2 text-sm font-bold">Fecha de pago<input className="rounded-xl border border-[#20211f]/15 p-3" type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} /></label>
          <label className="grid gap-2 text-sm font-bold sm:col-span-2">Vuelta de cobranza<input className="rounded-xl border border-[#20211f]/15 p-3" min="1" type="number" value={collectionPass} onChange={(event) => setCollectionPass(event.target.value)} /></label>
        </div>
        {amountError && <p role="alert" className="mt-4 text-sm font-bold text-[#9d2d24]">{amountError}</p>}
        {registerPayment.error && <p role="alert" className="mt-4 text-sm font-bold text-[#9d2d24]">{registerPayment.error instanceof Error ? registerPayment.error.message : 'No se pudo registrar el pago.'}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button className="rounded-2xl border border-[#20211f]/15 px-5 py-3 font-bold" onClick={onClose} type="button">Cancelar</button>
          <button className="rounded-2xl bg-[#20211f] px-5 py-3 font-black text-white disabled:opacity-50" disabled={Boolean(amountError) || cannotPay || registerPayment.isPending} type="submit">{registerPayment.isPending ? 'Registrando...' : 'Registrar pago'}</button>
        </div>
      </form>
    </div>
  )
}
