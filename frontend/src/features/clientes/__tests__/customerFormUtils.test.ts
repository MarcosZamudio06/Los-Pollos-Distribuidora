import { describe, expect, it } from 'vitest'
import {
  cleanCustomerNumber,
  cleanEmail,
  cleanTaxId,
  formatCurrencyDisplay,
  formatMexicanPhone,
  parseCurrencyValue,
  toCustomerFormValues,
  validateCustomerField,
  validateCustomerForm,
  type CustomerFormDraft,
} from '../customerFormUtils'

const draft: CustomerFormDraft = {
  address: 'Av. Independencia #245, Col. Centro, Veracruz, Ver.',
  assignedRouteId: 'route-1',
  billingEmail: 'facturacion@empresa.com.mx',
  commercialName: 'Pollería Los Hermanos',
  commercialPolicyId: 'policy-1',
  creditDays: '30',
  creditLimit: '25000',
  creditStatus: 'ACTIVE',
  customerNumber: 'CLI-000123',
  customerType: 'RETAIL',
  deliveryAddress: 'Av. Independencia #245, Col. Centro, Veracruz, Ver.',
  email: 'cliente@empresa.com.mx',
  fiscalAddress: 'Av. Independencia #245, Col. Centro, Veracruz, Ver.',
  fiscalName: 'Comercializadora del Golfo S.A. de C.V.',
  name: 'Pollería Los Hermanos',
  phone: '2291234567',
  priceListId: 'PL-MAYOREO-01',
  requiresBilling: true,
  taxId: 'ABC010203AB9',
}

describe('customer form utilities', () => {
  it('normaliza teléfonos, RFC, emails y montos para captura mexicana', () => {
    expect(cleanCustomerNumber(' cli-000123$ ')).toBe('CLI-000123')
    expect(cleanEmail(' Cliente@Empresa.com.mx ')).toBe('cliente@empresa.com.mx')
    expect(cleanTaxId(' abc010203ab9 ')).toBe('ABC010203AB9')
    expect(formatMexicanPhone('2291234567')).toBe('229 123 4567')
    expect(formatCurrencyDisplay('25000')).toBe('25,000.00')
    expect(parseCurrencyValue('25,000.00')).toBe(25000)
  })

  it('acepta los campos válidos del formulario de cliente', () => {
    const catalogs = { commercialPolicyIds: new Set(['policy-1']), deliveryRouteIds: new Set(['route-1']) }
    expect(validateCustomerField('taxId', draft, catalogs, true)).toBeNull()
    expect(validateCustomerField('phone', draft, catalogs, true)).toBeNull()
    expect(validateCustomerField('assignedRouteId', draft, catalogs, true)).toBeNull()
    expect(validateCustomerField('commercialPolicyId', draft, catalogs, true)).toBeNull()
    expect(validateCustomerForm(draft, catalogs, true)).toEqual({})
    expect(toCustomerFormValues(draft).creditLimit).toBe(25000)
  })
})
