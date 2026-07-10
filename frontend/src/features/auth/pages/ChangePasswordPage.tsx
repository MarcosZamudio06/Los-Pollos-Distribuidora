import { useState, type FormEvent } from 'react'
import { AlertCircle, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Navigate, useLocation } from 'react-router-dom'
import { Alert, Button, Card, CardContent, Input } from '@/components/ui'
import { validateChangePassword } from '../changePasswordValidation'
import { useAuth } from '../useAuth'

type LocationState = {
  from?: { pathname?: string }
}

export function ChangePasswordPage() {
  const { changePassword, error, user } = useAuth()
  const location = useLocation()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const state = location.state as LocationState | null
  const nextPath = state?.from?.pathname && state.from.pathname !== '/change-password'
    ? state.from.pathname
    : '/'

  if (user && !user.mustChangePassword) {
    return <Navigate replace to={nextPath} />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validateChangePassword({
      confirmPassword,
      currentPassword,
      newPassword,
    })

    if (validationError) {
      setFormError(validationError)
      return
    }

    setFormError(null)
    setIsSubmitting(true)

    try {
      await changePassword({ currentPassword, newPassword })
    } catch {
      setFormError('No fue posible actualizar la contraseña. Verifica tu contraseña actual e inténtalo de nuevo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const activeError = formError ?? error

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--erp-background)] px-5 py-10 text-[var(--erp-foreground)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(214,155,45,0.22),transparent_25rem),radial-gradient(circle_at_85%_80%,rgba(182,42,34,0.14),transparent_24rem)]" />
      <Card className="relative w-full max-w-xl overflow-hidden border-[color:var(--erp-border)] bg-white/94 p-0 shadow-[var(--erp-shadow-elevated)] backdrop-blur">
        <div className="h-1.5 bg-[linear-gradient(90deg,var(--erp-brand-red),var(--erp-brand-gold),var(--erp-charcoal))]" />
        <CardContent className="p-6 sm:p-8">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[rgba(214,155,45,0.14)] text-[var(--erp-brand-gold-deep)]">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-[var(--erp-danger)]">Acción obligatoria</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.055em]">Protege tu cuenta</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--erp-muted-foreground)]">
            Debes reemplazar la contraseña temporal antes de acceder a los módulos operativos.
          </p>

          <form className="mt-8 grid gap-5" onSubmit={(event) => void handleSubmit(event)}>
            <label className="grid gap-2 text-sm font-bold" htmlFor="current-password">
              Contraseña actual
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-muted-foreground)]" />
                <Input autoComplete="current-password" className="h-12 pl-10" id="current-password" onChange={(event) => setCurrentPassword(event.target.value)} required type="password" value={currentPassword} />
              </div>
            </label>
            <label className="grid gap-2 text-sm font-bold" htmlFor="new-password">
              Nueva contraseña
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-muted-foreground)]" />
                <Input aria-describedby="password-help" autoComplete="new-password" className="h-12 pl-10" id="new-password" minLength={10} onChange={(event) => setNewPassword(event.target.value)} required type="password" value={newPassword} />
              </div>
              <span className="text-xs font-normal text-[var(--erp-muted-foreground)]" id="password-help">Mínimo 10 caracteres y diferente a la contraseña actual.</span>
            </label>
            <label className="grid gap-2 text-sm font-bold" htmlFor="confirm-password">
              Confirmar nueva contraseña
              <Input autoComplete="new-password" className="h-12" id="confirm-password" minLength={10} onChange={(event) => setConfirmPassword(event.target.value)} required type="password" value={confirmPassword} />
            </label>

            {activeError && (
              <Alert className="flex gap-3 text-sm font-semibold" role="alert" tone="error">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{activeError}</span>
              </Alert>
            )}

            <Button className="mt-2 h-12 w-full rounded-2xl font-black uppercase tracking-[0.12em]" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Actualizando contraseña' : 'Guardar y continuar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
