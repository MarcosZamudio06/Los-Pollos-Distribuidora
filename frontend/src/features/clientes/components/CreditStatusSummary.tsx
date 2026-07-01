import type { Customer } from '../types'

function toMoney(value: string | number | null | undefined) {
  if (value === undefined || value === null) return '—'
  const amount = Number(value)
  return amount.toLocaleString('es-MX', { currency: 'MXN', style: 'currency' })
}

function sumKnown(values: Array<string | number | null | undefined>) {
  const knownValues = values.filter((value): value is string | number => value !== undefined && value !== null)
  if (knownValues.length === 0) return null
  return knownValues.reduce<number>((total, value) => total + Number(value), 0)
}

export function CreditStatusSummary({ customers }: { customers: Customer[] }) {
  const active = customers.filter((customer) => customer.creditStatus === 'ACTIVE').length
  const blocked = customers.filter((customer) => customer.creditStatus === 'BLOCKED').length
  const suspended = customers.filter((customer) => customer.creditStatus === 'SUSPENDED').length
  const globalBalance = sumKnown(customers.map((customer) => customer.creditSummary?.globalBalance))
  const overdueBalance = sumKnown(customers.map((customer) => customer.creditSummary?.overdueAmount))

  return (
    <section className="grid gap-4 md:grid-cols-5">
      <article className="rounded-[1.5rem] bg-[#20211f] p-5 text-white"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#f0b44c]">Activos</p><strong className="mt-3 block text-3xl">{active}</strong></article>
      <article className="rounded-[1.5rem] border border-[#d43f2f]/20 bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9d2d24]">Bloqueados</p><strong className="mt-3 block text-3xl">{blocked}</strong></article>
      <article className="rounded-[1.5rem] border border-[#20211f]/10 bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#68645c]">Suspendidos</p><strong className="mt-3 block text-3xl">{suspended}</strong></article>
      <article className="rounded-[1.5rem] border border-[#20211f]/10 bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#39798b]">Saldo global</p><strong className="mt-3 block text-2xl">{toMoney(globalBalance)}</strong></article>
      <article className="rounded-[1.5rem] border border-[#d43f2f]/20 bg-[#d43f2f]/5 p-5"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9d2d24]">Vencido</p><strong className="mt-3 block text-2xl">{toMoney(overdueBalance)}</strong></article>
    </section>
  )
}
