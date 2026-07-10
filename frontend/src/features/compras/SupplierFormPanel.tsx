import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui'
import {
  createSupplierFormDraft,
  hasSupplierFormErrors,
  normalizeSupplierTextInput,
  toCreateSupplierPayload,
  toUpdateSupplierPayload,
  validateSupplierForm,
  type SupplierFormDraft,
  type SupplierFormField,
} from './supplierFormUtils'
import type { Supplier, UpdateSupplierPayload } from './types'

type SupplierFormPanelProps = {
  isSaving?: boolean
  onClose: () => void
  onCreate: (draft: SupplierFormDraft) => Promise<void> | void
  onUpdate: (supplierId: string, payload: UpdateSupplierPayload) => Promise<void> | void
  supplier?: Supplier | null
}

const fieldClass = 'grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]'

export function SupplierFormPanel({ isSaving = false, onClose, onCreate, onUpdate, supplier }: SupplierFormPanelProps) {
  const originalDraft = useMemo(() => createSupplierFormDraft(supplier), [supplier])
  const [draft, setDraft] = useState<SupplierFormDraft>(originalDraft)
  const [errors, setErrors] = useState(validateSupplierForm(originalDraft))
  const title = supplier ? 'Editar proveedor' : 'Nuevo proveedor'

  function updateField(field: SupplierFormField, value: string) {
    const nextDraft = { ...draft, [field]: field === 'email' ? value : normalizeSupplierTextInput(value) }
    setDraft(nextDraft)
    setErrors(validateSupplierForm(nextDraft))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateSupplierForm(draft)
    setErrors(nextErrors)
    if (hasSupplierFormErrors(nextErrors)) return

    if (supplier) {
      const payload = toUpdateSupplierPayload(draft, originalDraft)
      await onUpdate(supplier.id, payload)
    } else {
      await onCreate(toCreateSupplierPayload(draft))
    }
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-30 w-full overflow-y-auto border-l border-[color:var(--erp-border)] bg-[var(--erp-background)] p-5 shadow-2xl md:w-[32rem] md:p-6">
      <Card className="p-0">
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-[color:var(--erp-border)] p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]">Proveedores</p>
            <CardTitle className="mt-1">{title}</CardTitle>
            <p className="mt-2 text-sm text-[var(--erp-muted-foreground)]">Completa datos fiscales operativos mínimos: nombre, teléfono, email y dirección.</p>
          </div>
          <button aria-label="Cerrar panel de proveedor" className="rounded-xl border border-[color:var(--erp-border)] bg-white p-2 text-[var(--erp-muted-foreground)]" onClick={onClose} type="button">
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent className="p-5">
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <label className={fieldClass}>Nombre del proveedor<Input value={draft.name} onChange={(event) => updateField('name', event.target.value)} />{errors.name && <span className="text-[var(--erp-danger)]">{errors.name}</span>}</label>
            <label className={fieldClass}>Teléfono<Input value={draft.phone} onChange={(event) => updateField('phone', event.target.value)} />{errors.phone && <span className="text-[var(--erp-danger)]">{errors.phone}</span>}</label>
            <label className={fieldClass}>Email<Input value={draft.email} onChange={(event) => updateField('email', event.target.value)} />{errors.email && <span className="text-[var(--erp-danger)]">{errors.email}</span>}</label>
            <label className={fieldClass}>Dirección<Input value={draft.address} onChange={(event) => updateField('address', event.target.value)} />{errors.address && <span className="text-[var(--erp-danger)]">{errors.address}</span>}</label>
            <div className="mt-2 flex justify-end gap-2">
              <Button onClick={onClose} type="button" variant="outline">Cancelar</Button>
              <Button disabled={isSaving || hasSupplierFormErrors(errors)} type="submit">{supplier ? 'Guardar cambios' : 'Crear proveedor'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </aside>
  )
}
