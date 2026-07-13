import { useMemo, useState } from 'react'
import { Building2, FilterX, Pencil, Plus, ShieldAlert, SlidersHorizontal, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Select, Table, Td, Th } from '@/components/ui'
import type { BadgeTone } from '@/components/ui'
import { toast } from 'sonner'
import { useAuth } from '../auth'
import { SupplierFormPanel } from './SupplierFormPanel'
import { useCreateSupplier, useDeactivateSupplier, useSuppliers, useUpdateSupplier } from './hooks'
import type { Supplier, SupplierListFilters } from './types'
import { TablePagination, useTablePagination } from '@/components/shared/table-pagination'

const filterLabelClass = 'grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]'

function supplierStatusTone(isActive?: boolean): BadgeTone {
  return isActive === false ? 'slate' : 'green'
}

export function SuppliersPage() {
  const { user } = useAuth()
  const [filters, setFilters] = useState<SupplierListFilters>({ isActive: '', limit: 50, page: 1, search: '' })
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>()
  const [pendingDeactivation, setPendingDeactivation] = useState<Supplier | null>(null)
  const [deactivationError, setDeactivationError] = useState<string | null>(null)
  const suppliers = useSuppliers(filters)
  const createSupplier = useCreateSupplier()
  const updateSupplier = useUpdateSupplier(editingSupplier?.id ?? '')
  const deactivateSupplier = useDeactivateSupplier()
  const items = suppliers.data ?? []
  const pagination = useTablePagination(items)
  const isAdmin = user?.role === 'ADMIN'
  const isSaving = createSupplier.isPending || updateSupplier.isPending
  const activeCount = useMemo(() => items.filter((supplier) => supplier.isActive !== false).length, [items])
  const hasFilters = Boolean(filters.search || filters.isActive !== '')

  async function confirmDeactivation() {
    if (!pendingDeactivation || deactivateSupplier.isPending) return
    setDeactivationError(null)
    try {
      await deactivateSupplier.mutateAsync(pendingDeactivation.id)
      toast.success('Proveedor desactivado correctamente.')
      setPendingDeactivation(null)
    } catch (error) {
      setDeactivationError(error instanceof Error ? error.message : 'No se pudo desactivar el proveedor.')
    }
  }

  return (
    <main className="min-h-screen bg-[var(--erp-background)] px-4 py-6 text-[var(--erp-foreground)] sm:px-6 lg:px-8">
      <section className="mx-auto grid max-w-7xl gap-5">
        <PageHeader
          eyebrow="Proveedores"
          title="Alta y mantenimiento de proveedores"
          description="Administra proveedores autorizados para compras y recepción de mercancía. La desactivación conserva trazabilidad histórica."
          actions={<Button onClick={() => setEditingSupplier(null)}><Plus className="h-4 w-4" /> Nuevo proveedor</Button>}
        />

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">Registros visibles</p><p className="mt-3 text-2xl font-black">{items.length}</p></Card>
          <Card className="p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">Activos</p><p className="mt-3 text-2xl font-black">{activeCount}</p></Card>
          <Card className="p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">Acceso</p><p className="mt-3 flex items-center gap-2 text-sm font-bold"><ShieldAlert className="h-4 w-4 text-[var(--erp-brand-gold-deep)]" /> {isAdmin ? 'ADMIN con desactivación' : 'WAREHOUSE sin desactivación'}</p></Card>
        </div>

        <Card className="p-5">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-info)]"><SlidersHorizontal className="h-4 w-4" /> Filtros operativos</p><p className="mt-2 text-sm text-[var(--erp-muted-foreground)]">Buscar proveedor por nombre, teléfono o email y filtrar por estado.</p></div>
            <Button disabled={!hasFilters} onClick={() => setFilters({ isActive: '', limit: 50, page: 1, search: '' })} variant="outline"><FilterX className="h-4 w-4" /> Limpiar filtros</Button>
          </CardHeader>
          <CardContent className="mt-5 grid gap-3 md:grid-cols-[1fr_14rem]">
            <label className={filterLabelClass}>Buscar proveedor<Input placeholder="Nombre, teléfono o email" value={filters.search ?? ''} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label>
            <label className={filterLabelClass}>Activo/inactivo<Select value={String(filters.isActive ?? '')} onChange={(event) => setFilters({ ...filters, isActive: event.target.value })}><option value="">Todos</option><option value="true">Activo</option><option value="false">Inactivo</option></Select></label>
          </CardContent>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="flex flex-col gap-3 border-b border-[color:var(--erp-border)] bg-white/70 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]">Directorio</p><CardTitle className="mt-1">Proveedores registrados</CardTitle></div>
            <Badge tone={hasFilters ? 'blue' : 'slate'}>{hasFilters ? 'Filtros activos' : 'Sin filtros'}</Badge>
          </div>
          <div className="p-5">
            {suppliers.isLoading && <p className="rounded-2xl border border-[rgba(47,111,115,0.20)] bg-[rgba(47,111,115,0.08)] p-4 text-sm font-bold text-[var(--erp-info)]">Cargando proveedores...</p>}
            {suppliers.error && <p role="alert" className="rounded-2xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] p-4 text-sm font-bold text-[var(--erp-danger)]">No se pudieron cargar los proveedores.</p>}
            {!suppliers.isLoading && !suppliers.error && items.length === 0 && <p className="rounded-2xl border border-dashed border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-6 text-sm text-[var(--erp-muted-foreground)]">No hay proveedores para estos filtros.</p>}
            {items.length > 0 && <><div className="overflow-x-auto rounded-[1.2rem] border border-[color:var(--erp-border)]"><Table className="min-w-[900px]"><thead><tr><Th>Proveedor</Th><Th>Contacto</Th><Th>Dirección</Th><Th>Estado</Th><Th className="text-right">Acciones</Th></tr></thead><tbody>{pagination.pageItems.map((supplier) => <tr className="transition hover:bg-[var(--erp-surface)]" key={supplier.id}><Td><p className="flex items-center gap-2 font-black"><Building2 className="h-4 w-4 text-[var(--erp-brand-gold-deep)]" />{supplier.name}</p></Td><Td><p>{supplier.phone ?? '—'}</p><p className="text-sm text-[var(--erp-muted-foreground)]">{supplier.email ?? '—'}</p></Td><Td>{supplier.address ?? '—'}</Td><Td><Badge tone={supplierStatusTone(supplier.isActive)}>{supplier.isActive === false ? 'Inactivo' : 'Activo'}</Badge></Td><Td className="text-right"><div className="flex justify-end gap-2"><Button onClick={() => setEditingSupplier(supplier)} size="sm" variant="outline"><Pencil className="h-4 w-4" /> Editar</Button>{isAdmin && supplier.isActive !== false && <Button onClick={() => { setDeactivationError(null); setPendingDeactivation(supplier) }} size="sm" variant="outline"><Trash2 className="h-4 w-4" /> Desactivar</Button>}</div></Td></tr>)}</tbody></Table></div><TablePagination {...pagination} total={items.length} onPageChange={pagination.setPage} /></>}
          </div>
        </Card>
      </section>
      {editingSupplier !== undefined && <SupplierFormPanel isSaving={isSaving} supplier={editingSupplier} onClose={() => setEditingSupplier(undefined)} onCreate={async (payload) => { await createSupplier.mutateAsync(payload); setEditingSupplier(undefined) }} onUpdate={async (_supplierId, draft) => { await updateSupplier.mutateAsync(draft); setEditingSupplier(undefined) }} />}
      <ConfirmationDialog cancelLabel="Regresar" confirmLabel="Confirmar desactivación" description="Revise el proveedor antes de retirarlo de las operaciones activas." isLoading={deactivateSupplier.isPending} onConfirm={confirmDeactivation} onOpenChange={(open) => { if (!open) { setPendingDeactivation(null); setDeactivationError(null) } }} open={Boolean(pendingDeactivation)} title="Desactivar proveedor">
        <p><strong>Proveedor:</strong> {pendingDeactivation?.name}</p>
        <p><strong>Contacto:</strong> {pendingDeactivation?.phone ?? pendingDeactivation?.email ?? 'Sin contacto registrado'}</p>
        <p className="text-[var(--erp-muted-foreground)]">El proveedor dejará de estar disponible para nuevas compras. Su historial permanecerá intacto.</p>
        {deactivationError && <p className="font-semibold text-[var(--erp-danger)]" role="alert">{deactivationError}</p>}
      </ConfirmationDialog>
    </main>
  )
}
