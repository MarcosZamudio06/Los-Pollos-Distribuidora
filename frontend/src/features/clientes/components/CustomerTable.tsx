import { Eye, Pencil, Power, Route, ShieldCheck, UserRound } from 'lucide-react'
import type { Customer } from '../types'
import { TablePagination, useTablePagination } from '../../../components/shared/table-pagination'

function text(value: unknown) { return typeof value === 'string' && value.trim() ? value : '—' }
function money(value: unknown) { return value === undefined || value === null ? '—' : Number(value).toLocaleString('es-MX', { currency: 'MXN', style: 'currency' }) }
function policy(customer: Customer) { return typeof customer.commercialPolicy === 'string' ? customer.commercialPolicy : customer.commercialPolicy?.name ?? customer.commercialPolicyId ?? '—' }
function route(customer: Customer) { return typeof customer.assignedRoute === 'string' ? customer.assignedRoute : customer.assignedRoute?.name ?? customer.assignedRouteId ?? '—' }
function isActive(customer: Customer) { return customer.isActive ?? customer.active ?? true }

const headerCell = 'px-4 py-3 text-left text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]'
const bodyCell = 'px-4 py-4 text-sm text-[var(--erp-foreground)]'
const muted = 'text-[var(--erp-muted-foreground)]'
const actionClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[color:var(--erp-border)] bg-white px-3 text-xs font-semibold transition hover:border-[var(--erp-brand-gold)] hover:bg-[var(--erp-surface-muted)]'

function CustomerBadge({ customer }: { customer: Customer }) {
  if (!isActive(customer)) return <span className="inline-flex rounded-full border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--erp-muted-foreground)]">Inactivo</span>
  if (customer.creditStatus === 'BLOCKED') return <span className="inline-flex rounded-full border border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.10)] px-2.5 py-1 text-xs font-semibold text-[var(--erp-danger)]">Bloqueado</span>
  if (customer.creditStatus === 'ACTIVE') return <span className="inline-flex rounded-full border border-[rgba(63,123,65,0.25)] bg-[rgba(63,123,65,0.10)] px-2.5 py-1 text-xs font-semibold text-[var(--erp-success)]">Crédito activo</span>
  return <span className="inline-flex rounded-full border border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--erp-muted-foreground)]">{text(customer.creditStatus)}</span>
}

export function CustomerTable({ canDeactivate, canManage, customers, onDeactivate, onEdit, onSelect }: { canDeactivate: boolean; canManage: boolean; customers: Customer[]; onDeactivate: (customer: Customer) => void; onEdit: (customer: Customer) => void; onSelect: (customer: Customer) => void }) {
  const pagination = useTablePagination(customers)
  return (
    <section className="overflow-hidden rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white shadow-[var(--erp-shadow)]">
      <div className="flex flex-col gap-2 border-b border-[color:var(--erp-border)] bg-[color-mix(in_srgb,var(--erp-surface)_70%,white)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--erp-muted-foreground)]">Directorio operativo</p>
          <h2 className="mt-1 text-lg font-bold">Tabla de clientes</h2>
        </div>
        <span className="rounded-full border border-[color:var(--erp-border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--erp-muted-foreground)]">{customers.length} registros</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1180px] w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-[var(--erp-surface)]">
            <tr><th className={headerCell}>Número</th><th className={headerCell}>Cliente</th><th className={headerCell}>Contacto</th><th className={headerCell}>Tipo</th><th className={headerCell}>Crédito</th><th className={`${headerCell} text-right`}>Saldo global</th><th className={`${headerCell} text-right`}>Vencido</th><th className={`${headerCell} text-right`}>Disponible</th><th className={headerCell}>Política</th><th className={headerCell}>Ruta</th><th className={headerCell}>Estado</th><th className={headerCell}>Acciones</th></tr>
          </thead>
          <tbody>
            {pagination.pageItems.map((customer) => (
              <tr key={customer.id} className="border-t border-[color:var(--erp-border)] align-top transition hover:bg-[var(--erp-surface)]/70">
                <td className={`${bodyCell} font-semibold`}>{text(customer.customerNumber)}</td>
                <td className={bodyCell}><div className="flex min-w-56 gap-3"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--erp-surface-muted)] text-[var(--erp-muted-foreground)]"><UserRound className="h-4 w-4" /></span><div><p className="font-black tracking-[-0.02em]">{customer.name}</p><p className={`mt-1 ${muted}`}>{text(customer.commercialName)}</p></div></div></td>
                <td className={bodyCell}><p>{text(customer.phone)}</p><p className={`mt-1 ${muted}`}>{text(customer.email)}</p><p className={`mt-1 ${muted}`}>{text(customer.billingEmail)}</p></td>
                <td className={bodyCell}>{customer.customerType}</td>
                <td className={bodyCell}><CustomerBadge customer={customer} /></td>
                <td className={`${bodyCell} text-right font-semibold tabular-nums`}>{money(customer.creditSummary?.globalBalance)}</td>
                <td className={`${bodyCell} text-right font-semibold tabular-nums text-[var(--erp-danger)]`}>{money(customer.creditSummary?.overdueAmount)}</td>
                <td className={`${bodyCell} text-right font-semibold tabular-nums`}>{customer.creditSummary?.availableCredit == null ? '—' : money(customer.creditSummary.availableCredit)}</td>
                <td className={bodyCell}><span className="inline-flex max-w-40 items-center gap-2 truncate"><ShieldCheck className="h-4 w-4 shrink-0 text-[var(--erp-muted-foreground)]" /> {policy(customer)}</span></td>
                <td className={bodyCell}><span className="inline-flex max-w-36 items-center gap-2 truncate"><Route className="h-4 w-4 shrink-0 text-[var(--erp-muted-foreground)]" /> {route(customer)}</span></td>
                <td className={bodyCell}>{isActive(customer) ? 'Activo' : 'Inactivo'}</td>
                <td className={bodyCell}><div className="flex flex-wrap gap-2"><button className={actionClass} onClick={() => onSelect(customer)} type="button"><Eye className="h-4 w-4" /> Resumen</button>{canManage && <button className={`${actionClass} text-[var(--erp-danger)]`} onClick={() => onEdit(customer)} type="button"><Pencil className="h-4 w-4" /> Editar</button>}{canDeactivate && isActive(customer) && <button className={actionClass} onClick={() => onDeactivate(customer)} type="button"><Power className="h-4 w-4" /> Desactivar</button>}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination {...pagination} total={customers.length} onPageChange={pagination.setPage} />
    </section>
  )
}
