// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InventoryTransferView } from '../components/InventoryTransferView'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const mutateAsync = vi.fn().mockResolvedValue({ id: 'transfer-1' })

vi.mock('../hooks/useProducts', () => ({
  useInventoryLocations: () => ({ data: [{ id: 'origin-1', name: 'Matriz' }, { id: 'destination-1', name: 'Sucursal' }], error: null, isLoading: false }),
  useInventoryTransfers: () => ({ data: [], error: null, isLoading: false }),
  useInventoryTransferDetail: () => ({ data: null, error: null, isLoading: false }),
  useCreateInventoryTransfer: () => ({ isPending: false, mutateAsync }),
  useConfirmInventoryTransfer: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCancelInventoryTransfer: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))

let root: Root | undefined
afterEach(async () => { if (root) await act(async () => root?.unmount()); document.body.innerHTML = ''; mutateAsync.mockClear(); root = undefined })

function change(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function select(input: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('InventoryTransferView confirmation', () => {
  it('no crea antes de confirmar y crea una sola vez al confirmar', async () => {
    const container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
    await act(async () => root?.render(<InventoryTransferView canManage />))
    const inputs = [...container.querySelectorAll('input')]
    const origin = container.querySelector<HTMLSelectElement>('[aria-label="Ubicación de origen"]')!
    const destination = container.querySelector<HTMLSelectElement>('[aria-label="Ubicación de destino"]')!
    await act(async () => { select(origin, 'origin-1'); select(destination, 'destination-1'); change(inputs[1], 'product-1'); change(inputs[2], '2') })
    const form = container.querySelector('form')
    await act(async () => form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(mutateAsync).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Confirmar traspaso')
    const confirm = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Confirmar registro')
    await act(async () => confirm?.click())
    expect(mutateAsync).toHaveBeenCalledTimes(1)
  })
})
