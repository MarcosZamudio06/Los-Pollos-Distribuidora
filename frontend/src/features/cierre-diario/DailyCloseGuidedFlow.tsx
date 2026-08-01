import type { ReactNode } from 'react'
import { AlertTriangle, Banknote, ClipboardCheck, FileSignature, PackageCheck, Scale } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DailyCloseDetailTabs, type DailyCloseTab } from './DailyCloseDetailTabs'
import { DailyCloseSignoffSummary } from './DailyCloseSignoffSummary'
import type { DailyClose, DailyCloseInventoryReconciliation, DailyCloseValidationResult } from './types'

export type DailyCloseStepId = 'operations' | 'inventory' | 'scale' | 'cash' | 'differences' | 'signoff'

type Step = { id: DailyCloseStepId; label: string; description: string; icon: LucideIcon }

const steps: Step[] = [
  { id: 'operations', label: 'Verificar operaciones', description: 'Ventas, pagos y notas', icon: ClipboardCheck },
  { id: 'inventory', label: 'Conciliar inventario', description: 'Entradas y conteo físico', icon: PackageCheck },
  { id: 'scale', label: 'Revisar báscula', description: 'Folios y kilos registrados', icon: Scale },
  { id: 'cash', label: 'Contar caja', description: 'Efectivo, gastos y pagos', icon: Banknote },
  { id: 'differences', label: 'Revisar diferencias', description: 'Motivo, evidencia y autorización', icon: AlertTriangle },
  { id: 'signoff', label: 'Firmar y cerrar', description: 'Resumen y snapshot final', icon: FileSignature },
]

const tabForStep: Record<Exclude<DailyCloseStepId, 'signoff'>, DailyCloseTab> = {
  operations: 'sales',
  inventory: 'inventory',
  scale: 'scale',
  cash: 'cash',
  differences: 'differences',
}

type DailyCloseGuidedFlowProps = {
  activeStep: DailyCloseStepId
  canAuthorizeDifferences: boolean
  canClose: boolean
  canEditDifferences: boolean
  canEditInventory: boolean
  canViewFinancials: boolean
  canViewInventory: boolean
  canViewProfit: boolean
  close: DailyClose
  inventoryReconciliation: DailyCloseInventoryReconciliation | null
  onAuthorizeDifference: (differenceId: string) => Promise<void>
  onDeleteInventoryCount: (countId: string) => void
  onJustifyDifference: (differenceId: string, reason: string, evidence: string) => Promise<void>
  onRequestClose: () => void
  onSaveInventoryCount: (countId: string | undefined, productId: string, values: { physicalQuantityKg?: number; physicalQuantityPieces?: number; reason: string }) => void
  onStepChange: (step: DailyCloseStepId) => void
  products: Parameters<typeof DailyCloseDetailTabs>[0]['products']
  validationResult: DailyCloseValidationResult | null
  cashCountForm?: ReactNode
  expenseForm?: ReactNode
  scaleTicketForm?: ReactNode
}

export function DailyCloseGuidedFlow({ activeStep, canAuthorizeDifferences, canClose, canEditDifferences, canEditInventory, canViewFinancials, canViewInventory, canViewProfit, close, inventoryReconciliation, onAuthorizeDifference, onDeleteInventoryCount, onJustifyDifference, onRequestClose, onSaveInventoryCount, onStepChange, products, validationResult, cashCountForm, expenseForm, scaleTicketForm }: DailyCloseGuidedFlowProps) {
  const activeIndex = steps.findIndex((step) => step.id === activeStep)
  const current = steps[activeIndex] ?? steps[0]

  return <section className="space-y-4">
    <nav aria-label="Proceso de cierre diario" className="overflow-hidden rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-3">
      <ol className="grid gap-2 md:grid-cols-6">
        {steps.map((step, index) => {
          const Icon = step.icon
          const completed = index < activeIndex || (step.id === 'signoff' && close.status === 'CLOSED')
          const currentStep = step.id === activeStep
          return <li key={step.id}><button aria-current={currentStep ? 'step' : undefined} className={`group flex h-full w-full gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand-red)] ${currentStep ? 'border-[var(--erp-brand-red)] bg-[rgba(157,45,36,0.08)]' : completed ? 'border-emerald-200 bg-emerald-50/60' : 'border-transparent bg-[var(--erp-surface-muted)]'} disabled:cursor-not-allowed disabled:opacity-60`} disabled={index > activeIndex && close.status !== 'CLOSED'} onClick={() => onStepChange(step.id)} type="button"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${currentStep ? 'bg-[var(--erp-brand-red)] text-white' : completed ? 'bg-emerald-600 text-white' : 'bg-white text-[var(--erp-muted-foreground)]'}`}><Icon size={16} /></span><span className="min-w-0"><span className="block text-sm font-black leading-tight">{step.label}</span><span className="mt-1 block text-xs text-[var(--erp-muted-foreground)]">{step.description}</span></span></button></li>
        })}
      </ol>
    </nav>
    <div className="flex flex-col gap-1 border-l-4 border-[var(--erp-brand-red)] pl-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-red)]">Paso {activeIndex + 1} de {steps.length}</p><h3 className="text-xl font-black">{current.label}</h3><p className="text-sm text-[var(--erp-muted-foreground)]">{current.description}. Completa esta revisión antes de avanzar.</p></div>
     {activeStep === 'signoff' ? <DailyCloseSignoffSummary canClose={canClose} close={close} onClose={onRequestClose} openShiftCount={(close.cashShifts ?? []).filter((shift) => shift.status === 'OPEN').length} /> : <DailyCloseDetailTabs activeTab={tabForStep[activeStep]} canAuthorizeDifferences={canAuthorizeDifferences} canEditDifferences={canEditDifferences} canEditInventory={canEditInventory} canViewFinancials={canViewFinancials} canViewInventory={canViewInventory} canViewProfit={canViewProfit} close={close} expenseForm={expenseForm} includeExpensesInCash={activeStep === 'cash'} inventoryReconciliation={inventoryReconciliation} onAuthorizeDifference={onAuthorizeDifference} onDeleteInventoryCount={onDeleteInventoryCount} onJustifyDifference={onJustifyDifference} onSaveInventoryCount={onSaveInventoryCount} onTabChange={() => undefined} products={products} scaleTicketForm={scaleTicketForm} showNavigation={false} validationResult={validationResult} cashCountForm={cashCountForm} />}
    <div className="flex items-center justify-between gap-3 border-t border-[var(--erp-border)] pt-4"><button className="rounded-xl px-4 py-2 text-sm font-bold text-[var(--erp-muted-foreground)] transition hover:bg-[var(--erp-surface-muted)] disabled:cursor-not-allowed disabled:opacity-40" disabled={activeIndex <= 0} onClick={() => onStepChange(steps[activeIndex - 1].id)} type="button">Paso anterior</button>{activeStep !== 'signoff' && <button className="rounded-xl bg-[var(--erp-brand-red)] px-4 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40" disabled={activeIndex >= steps.length - 1} onClick={() => onStepChange(steps[activeIndex + 1].id)} type="button">Siguiente paso</button>}</div>
  </section>
}
