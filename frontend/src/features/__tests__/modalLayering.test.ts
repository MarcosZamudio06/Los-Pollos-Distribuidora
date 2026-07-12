import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const modalSources = [
  '../compras/SupplierFormPanel.tsx',
  '../clientes/pages/CustomersPage.tsx',
  '../cobranza/components/CustomerBalanceView.tsx',
]

describe('modal layering', () => {
  it.each(modalSources)('%s stays above the application topbar', (relativePath) => {
    const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')

    expect(source).toMatch(/fixed inset-y-0 right-0 z-50/)
  })
})
