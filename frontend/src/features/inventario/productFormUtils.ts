import type {
  EquivalentPolicyStatus,
  OperationalUnit,
  Product,
  ProductFormValues,
  ProductPresentation,
} from './types'

export type ProductFormDraft = Omit<
  ProductFormValues,
  'presentationType' | 'salePrice' | 'purchaseCost' | 'minStock' | 'unit' | 'pieceWeightEquivalent' | 'equivalentPolicyStatus'
> & {
  presentationType: ProductPresentation | ''
  salePrice: string
  purchaseCost: string
  minStock: string
  unit: OperationalUnit | ''
  pieceWeightEquivalent: string
  equivalentPolicyStatus: EquivalentPolicyStatus | ''
}

export type ProductFormField =
  | 'name'
  | 'sku'
  | 'description'
  | 'categoryId'
  | 'presentationType'
  | 'salePrice'
  | 'purchaseCost'
  | 'minStock'
  | 'unit'
  | 'pieceWeightEquivalent'
  | 'equivalentPolicyStatus'

export type ProductFormErrors = Partial<Record<ProductFormField, string>>

const MULTIPLE_SPACES = /\s+/g
const SKU_ALLOWED = /[^A-Z0-9-]/g
const PRODUCT_PRESENTATIONS = new Set<ProductPresentation>(['KG', 'WHOLE', 'CUT'])
const OPERATIONAL_UNITS = new Set<OperationalUnit>(['KG', 'PIECE', 'KG_AND_PIECE'])
const EQUIVALENT_POLICY_STATUSES = new Set<EquivalentPolicyStatus>(['DRAFT', 'ACTIVE', 'INACTIVE'])

export function collapseSpaces(value: string) {
  return value.replace(MULTIPLE_SPACES, ' ').trim()
}

export function cleanSku(value: string) {
  return value.toUpperCase().replace(SKU_ALLOWED, '')
}

export function normalizeDecimalInput(value: string, maxDecimals: number) {
  const safeMaxDecimals = Math.max(0, maxDecimals)
  const cleaned = value.replace(/[^\d.,-]/g, '').replace(/,/g, '')
  if (!cleaned) return ''

  const hasDecimalPoint = cleaned.includes('.')
  const [wholePart, ...fractionalParts] = cleaned.split('.')
  const safeWhole = wholePart.replace(/-/g, '').replace(/^0+(?=\d)/, '') || '0'
  const safeFraction = fractionalParts.join('').replace(/\D/g, '').slice(0, safeMaxDecimals)

  if (safeMaxDecimals === 0) return safeWhole
  if (hasDecimalPoint && safeFraction === '') return `${safeWhole}.`
  return safeFraction ? `${safeWhole}.${safeFraction}` : safeWhole
}

export function formatDecimalDisplay(value: string, maxDecimals: number) {
  const normalized = normalizeDecimalInput(value, maxDecimals)
  if (!normalized || normalized === '0.') return normalized === '0.' ? '0' : ''

  const amount = Number(normalized)
  if (!Number.isFinite(amount)) return ''

  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: maxDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(amount)
}

export function parseDecimalValue(value: string, maxDecimals: number) {
  const normalized = normalizeDecimalInput(value, maxDecimals)
  if (!normalized || normalized.endsWith('.')) return null

  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : null
}

export function normalizeCurrencyInput(value: string) {
  return normalizeDecimalInput(value, 2)
}

export function formatCurrencyDisplay(value: string) {
  return formatDecimalDisplay(value, 2)
}

export function parseCurrencyValue(value: string) {
  return parseDecimalValue(value, 2)
}

function equivalentPolicyStatus(product?: Product | null): EquivalentPolicyStatus {
  const value = product?.equivalentPolicyStatus ?? product?.equivalencePolicyStatus ?? 'DRAFT'
  return value === 'ACTIVE' || value === 'INACTIVE' || value === 'DRAFT' ? value : 'DRAFT'
}

function normalizeProductPresentation(value?: ProductPresentation | null): ProductPresentation {
  return value && PRODUCT_PRESENTATIONS.has(value) ? value : 'KG'
}

function normalizeOperationalUnit(value?: OperationalUnit | null): OperationalUnit {
  return value && OPERATIONAL_UNITS.has(value) ? value : 'KG'
}

function numericDraftValue(value: number | null | undefined, maxDecimals: number) {
  return value == null ? '' : normalizeDecimalInput(String(value), maxDecimals)
}

export function toProductFormDraft(product?: Product | null): ProductFormDraft {
  return {
    name: collapseSpaces(product?.name ?? ''),
    sku: cleanSku(product?.sku ?? ''),
    description: collapseSpaces(product?.description ?? ''),
    categoryId: collapseSpaces(product?.categoryId ?? ''),
    presentationType: normalizeProductPresentation(product?.presentationType ?? product?.presentation),
    salePrice: numericDraftValue(product?.salePrice ?? 0, 2),
    purchaseCost: numericDraftValue(product?.purchaseCost ?? product?.cost ?? 0, 2),
    minStock: numericDraftValue(product?.minStock ?? 0, 2),
    unit: normalizeOperationalUnit(product?.unit ?? product?.operationalUnit),
    pieceWeightEquivalent: numericDraftValue(product?.pieceWeightEquivalent ?? product?.equivalentWeightKg, 3),
    equivalentPolicyStatus: equivalentPolicyStatus(product),
  }
}

export function toProductFormValues(draft: ProductFormDraft): ProductFormValues {
  return {
    name: collapseSpaces(draft.name),
    sku: cleanSku(draft.sku).trim(),
    description: collapseSpaces(draft.description),
    categoryId: collapseSpaces(draft.categoryId),
    presentationType: draft.presentationType || 'KG',
    salePrice: parseCurrencyValue(draft.salePrice) ?? 0,
    purchaseCost: parseCurrencyValue(draft.purchaseCost) ?? 0,
    minStock: parseDecimalValue(draft.minStock, draft.unit === 'PIECE' ? 0 : 2) ?? 0,
    unit: draft.unit || 'KG',
    pieceWeightEquivalent: parseDecimalValue(draft.pieceWeightEquivalent, 3),
    equivalentPolicyStatus: draft.equivalentPolicyStatus || 'DRAFT',
  }
}

function hasValidDecimalPrecision(value: string, maxDecimals: number) {
  const normalized = normalizeDecimalInput(value, maxDecimals)
  if (!normalized) return false
  const [, fraction = ''] = normalized.split('.')
  return fraction.length <= maxDecimals
}

function isIntegerDecimal(value: number) {
  return Number.isInteger(value)
}

export function validateProductField(field: ProductFormField, draft: ProductFormDraft) {
  switch (field) {
    case 'name': {
      const value = collapseSpaces(draft.name)
      if (!value) return 'El nombre del producto es obligatorio.'
      if (value.length < 3 || value.length > 120) return 'El nombre del producto debe tener entre 3 y 120 caracteres.'
      return null
    }
    case 'sku': {
      const value = cleanSku(draft.sku).trim()
      if (!value) return null
      if (value.length > 40) return 'El SKU no debe exceder 40 caracteres.'
      return /^[-A-Z0-9]+$/.test(value) ? null : 'El SKU solo permite letras, números y guiones.'
    }
    case 'description': {
      const value = collapseSpaces(draft.description)
      return value.length > 500 ? 'La descripción no debe exceder 500 caracteres.' : null
    }
    case 'categoryId':
      return collapseSpaces(draft.categoryId).length > 120 ? 'El ID de categoría no debe exceder 120 caracteres.' : null
    case 'presentationType':
      return draft.presentationType && PRODUCT_PRESENTATIONS.has(draft.presentationType) ? null : 'Selecciona una presentación válida.'
    case 'salePrice': {
      const value = parseCurrencyValue(draft.salePrice)
      if (value === null) return 'El precio de venta es obligatorio.'
      if (!hasValidDecimalPrecision(draft.salePrice, 2)) return 'El precio de venta permite hasta 2 decimales.'
      return value > 0 ? null : 'El precio de venta debe ser mayor que cero.'
    }
    case 'purchaseCost': {
      const value = parseCurrencyValue(draft.purchaseCost)
      if (value === null) return 'El costo de compra es obligatorio.'
      if (!hasValidDecimalPrecision(draft.purchaseCost, 2)) return 'El costo de compra permite hasta 2 decimales.'
      return value >= 0 ? null : 'El costo de compra no puede ser negativo.'
    }
    case 'unit':
      return draft.unit && OPERATIONAL_UNITS.has(draft.unit) ? null : 'Selecciona una unidad operativa válida.'
    case 'minStock': {
      const maxDecimals = draft.unit === 'PIECE' ? 0 : 2
      const value = parseDecimalValue(draft.minStock, maxDecimals)
      if (value === null) return 'El mínimo comercial es obligatorio.'
      if (value < 0) return 'El mínimo comercial no puede ser negativo.'
      if (draft.unit === 'PIECE' && !isIntegerDecimal(value)) return 'El mínimo comercial debe ser entero cuando la unidad es pieza.'
      return null
    }
    case 'pieceWeightEquivalent': {
      if (!draft.pieceWeightEquivalent) return null
      const value = parseDecimalValue(draft.pieceWeightEquivalent, 3)
      if (value === null) return 'La equivalencia kg por pieza debe ser numérica.'
      if (!hasValidDecimalPrecision(draft.pieceWeightEquivalent, 3)) return 'La equivalencia permite hasta 3 decimales.'
      return value > 0 ? null : 'La equivalencia de kg por pieza debe ser mayor que cero cuando se captura.'
    }
    case 'equivalentPolicyStatus':
      return draft.equivalentPolicyStatus && EQUIVALENT_POLICY_STATUSES.has(draft.equivalentPolicyStatus)
        ? null
        : 'Selecciona una política de equivalencia válida.'
    default:
      return null
  }
}

export function validateProductForm(draft: ProductFormDraft) {
  const fields: ProductFormField[] = [
    'name',
    'sku',
    'description',
    'categoryId',
    'presentationType',
    'salePrice',
    'purchaseCost',
    'minStock',
    'unit',
    'pieceWeightEquivalent',
    'equivalentPolicyStatus',
  ]

  return fields.reduce<ProductFormErrors>((accumulator, field) => {
    const error = validateProductField(field, draft)
    if (error) accumulator[field] = error
    return accumulator
  }, {})
}

export function hasProductFormErrors(errors: ProductFormErrors) {
  return Object.values(errors).some(Boolean)
}

export function firstProductFormErrorField(errors: ProductFormErrors) {
  return (Object.keys(errors) as ProductFormField[]).find((field) => Boolean(errors[field]))
}
