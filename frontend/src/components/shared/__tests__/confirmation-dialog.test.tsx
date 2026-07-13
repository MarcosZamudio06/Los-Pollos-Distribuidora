// @vitest-environment jsdom
import { act } from 'react'
import type { ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmationDialog } from '../confirmation-dialog'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | undefined

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  document.body.innerHTML = ''
  root = undefined
})

async function renderDialog(props?: Partial<ComponentProps<typeof ConfirmationDialog>>) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root?.render(<ConfirmationDialog confirmLabel="Confirmar registro" description="Verifique los datos." onConfirm={() => undefined} onOpenChange={() => undefined} open title="Confirmar registro" {...props}><p>Cliente: Demo</p></ConfirmationDialog>))
}

describe('ConfirmationDialog', () => {
  it('muestra resumen y bloquea el doble envío mientras la promesa está pendiente', async () => {
    let resolve!: () => void
    const pending = new Promise<void>((done) => { resolve = done })
    const onConfirm = vi.fn(() => pending)
    await renderDialog({ onConfirm })
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Confirmar registro')
    expect(document.body.textContent).toContain('Cliente: Demo')
    act(() => { button?.click(); button?.click() })
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(button?.disabled).toBe(true)
    await act(async () => resolve())
  })

  it('bloquea ambas acciones mientras guarda', async () => {
    await renderDialog({ isLoading: true })
    const buttons = [...document.querySelectorAll('button')]
    expect(buttons).toHaveLength(2)
    expect(buttons.every((button) => button.disabled)).toBe(true)
    expect(document.body.textContent).toContain('Guardando...')
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })))
    expect(document.body.textContent).toContain('Confirmar registro')
  })

  it('mantiene el diálogo disponible después de un rechazo', async () => {
    await renderDialog({ onConfirm: () => Promise.reject(new Error('falló')) })
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Confirmar registro')
    await act(async () => button?.click())
    expect(document.body.textContent).toContain('Confirmar registro')
    expect(button?.disabled).toBe(false)
  })
})
