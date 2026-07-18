import { LoaderCircle, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

type ConfirmationDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  isLoading?: boolean
  confirmDisabled?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void | Promise<void>
  children?: ReactNode
}

export function ConfirmationDialog({ open, title, description, confirmLabel, cancelLabel = 'Regresar y editar', isLoading = false, confirmDisabled = false, onOpenChange, onConfirm, children }: ConfirmationDialogProps) {
  const submittingRef = useRef(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const loading = isLoading || isConfirming

  async function handleConfirm() {
    if (submittingRef.current || loading) return
    submittingRef.current = true
    setIsConfirming(true)
    try {
      await onConfirm()
    } catch {
      // El flujo propietario muestra el error; la confirmación permanece abierta para reintentar.
    } finally {
      submittingRef.current = false
      setIsConfirming(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!loading) onOpenChange(next) }}>
      <AlertDialogContent onEscapeKeyDown={(event) => { if (loading) event.preventDefault() }}>
        <AlertDialogHeader>
          <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-xl border border-[rgba(214,155,45,0.28)] bg-[rgba(214,155,45,0.12)] text-[var(--erp-brand-gold-deep)]"><ShieldCheck className="h-5 w-5" /></span>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children && <div className="grid gap-2 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] p-4 text-sm">{children}</div>}
        <AlertDialogFooter>
          <Button disabled={loading} onClick={() => onOpenChange(false)} variant="secondary">{cancelLabel}</Button>
          <Button aria-busy={loading} disabled={loading || confirmDisabled} onClick={() => void handleConfirm()}>
            {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}{loading ? 'Guardando...' : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
