import type { Customer } from '../types'

function text(value: unknown) { return typeof value === 'string' && value.trim() ? value : '—' }
function money(value: unknown) { return value === undefined || value === null ? '—' : Number(value).toLocaleString('es-MX', { currency: 'MXN', style: 'currency' }) }
function policy(customer: Customer) { return typeof customer.commercialPolicy === 'string' ? customer.commercialPolicy : customer.commercialPolicy?.name ?? customer.commercialPolicyId ?? '—' }
function route(customer: Customer) { return typeof customer.assignedRoute === 'string' ? customer.assignedRoute : customer.assignedRoute?.name ?? customer.assignedRouteId ?? '—' }
function isActive(customer: Customer) { return customer.isActive ?? customer.active ?? true }

function CustomerBadge({ customer }: { customer: Customer }) {
  if (!isActive(customer)) return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">Inactivo</span>
  if (customer.creditStatus === 'BLOCKED') return <span className="rounded-full bg-[#f9d8d4] px-3 py-1 text-xs font-bold text-[#9d2d24]">Bloqueado</span>
  if (customer.creditStatus === 'ACTIVE') return <span className="rounded-full bg-[#dbeee8] px-3 py-1 text-xs font-bold text-[#2d6b4f]">Crédito activo</span>
  return <span className="rounded-full bg-[#f5f3ee] px-3 py-1 text-xs font-bold text-[#68645c]">{text(customer.creditStatus)}</span>
}

export function CustomerTable({ canDeactivate, canManage, customers, onDeactivate, onEdit, onSelect }: { canDeactivate: boolean; canManage: boolean; customers: Customer[]; onDeactivate: (customer: Customer) => void; onEdit: (customer: Customer) => void; onSelect: (customer: Customer) => void }) {
  return (
    <div className="overflow-x-auto rounded-[1.75rem] border border-[#20211f]/10 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[#20211f] text-xs uppercase tracking-[0.16em] text-white"><tr><th className="p-4">Número</th><th className="p-4">Nombre</th><th className="p-4">Comercial</th><th className="p-4">Teléfono</th><th className="p-4">Email</th><th className="p-4">Email facturación</th><th className="p-4">Tipo</th><th className="p-4">Crédito</th><th className="p-4">Saldo global</th><th className="p-4">Vencido</th><th className="p-4">Disponible</th><th className="p-4">Política</th><th className="p-4">Ruta</th><th className="p-4">Estado</th><th className="p-4">Acciones</th></tr></thead>
        <tbody>{customers.map((customer) => <tr key={customer.id} className="border-t align-top"><td className="p-4 font-bold">{text(customer.customerNumber)}</td><td className="p-4 font-black">{customer.name}</td><td className="p-4">{text(customer.commercialName)}</td><td className="p-4">{text(customer.phone)}</td><td className="p-4">{text(customer.email)}</td><td className="p-4">{text(customer.billingEmail)}</td><td className="p-4">{customer.customerType}</td><td className="p-4"><CustomerBadge customer={customer} /></td><td className="p-4">{money(customer.creditSummary?.globalBalance)}</td><td className="p-4">{money(customer.creditSummary?.overdueAmount)}</td><td className="p-4">{customer.creditSummary?.availableCredit == null ? '—' : money(customer.creditSummary.availableCredit)}</td><td className="p-4">{policy(customer)}</td><td className="p-4">{route(customer)}</td><td className="p-4">{isActive(customer) ? 'Activo' : 'Inactivo'}</td><td className="p-4"><div className="flex flex-wrap gap-3"><button className="font-bold text-[#39798b]" onClick={() => onSelect(customer)} type="button">Resumen</button>{canManage && <button className="font-bold text-[#9d2d24]" onClick={() => onEdit(customer)} type="button">Editar</button>}{canDeactivate && isActive(customer) && <button className="font-bold text-[#68645c]" onClick={() => onDeactivate(customer)} type="button">Desactivar</button>}</div></td></tr>)}</tbody>
      </table>
    </div>
  )
}
