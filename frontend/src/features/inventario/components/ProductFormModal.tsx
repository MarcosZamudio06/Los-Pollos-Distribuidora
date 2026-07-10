import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { Input, Select } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useSaveProduct } from '../hooks/useProducts'
import type { OperationalUnit, Product, ProductFormValues } from '../types'
import {
  cleanSku,
  collapseSpaces,
  firstProductFormErrorField,
  formatCurrencyDisplay,
  formatDecimalDisplay,
  hasProductFormErrors,
  normalizeCurrencyInput,
  normalizeDecimalInput,
  toProductFormDraft,
  toProductFormValues,
  validateProductField,
  validateProductForm,
  type ProductFormDraft,
  type ProductFormErrors,
  type ProductFormField,
} from '../productFormUtils'

type Props = { product?: Product | null; onClose: () => void }
const fieldBaseClass =
  'h-11 w-full rounded-xl border border-[color:var(--erp-border)] bg-white px-3.5 text-sm text-[var(--erp-foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition placeholder:text-[var(--erp-muted-foreground)]/70 focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)] disabled:cursor-not-allowed disabled:bg-[var(--erp-surface-muted)] disabled:opacity-70'
const validFieldClass = 'border-[rgba(33,150,83,0.42)] focus:border-[rgba(33,150,83,0.42)] focus:ring-[rgba(33,150,83,0.10)]'
const invalidFieldClass = 'border-[rgba(157,45,36,0.50)] focus:border-[rgba(157,45,36,0.60)] focus:ring-[rgba(157,45,36,0.12)]'
const textareaClass = cn(fieldBaseClass, 'h-auto min-h-24 py-3')

const presentationTypeOptions: Array<{ value: ProductFormValues['presentationType']; label: string }> = [
  { value: 'KG', label: 'Kilo' },
  { value: 'WHOLE', label: 'Unidad entera' },
  { value: 'CUT', label: 'Corte' },
]

const unitOptions: Array<{ value: ProductFormValues['unit']; label: string }> = [
  { value: 'KG', label: 'Kilo' },
  { value: 'PIECE', label: 'Pieza' },
  { value: 'KG_AND_PIECE', label: 'Kilo y pieza' },
]

const equivalentPolicyOptions: Array<{ value: NonNullable<ProductFormValues['equivalentPolicyStatus']>; label: string }> = [
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'ACTIVE', label: 'Activo' },
  { value: 'INACTIVE', label: 'Inactivo' },
]

type NumericField = 'salePrice' | 'purchaseCost' | 'minStock' | 'pieceWeightEquivalent'

function inputClass(hasError: boolean, isValid: boolean) {
  return cn(fieldBaseClass, hasError ? invalidFieldClass : isValid ? validFieldClass : null)
}

function textareaFieldClass(hasError: boolean, isValid: boolean) {
  return cn(textareaClass, hasError ? invalidFieldClass : isValid ? validFieldClass : null)
}

function getFieldId(field: ProductFormField) {
  return `product-form-${field}`
}

function getErrorId(field: ProductFormField) {
  return `${getFieldId(field)}-error`
}

function getHelpId(field: ProductFormField) {
  return `${getFieldId(field)}-help`
}

function mergeDescribedBy(field: ProductFormField, hasError: boolean, hasHelp: boolean) {
  return [hasError ? getErrorId(field) : null, hasHelp ? getHelpId(field) : null].filter(Boolean).join(' ') || undefined
}

function sanitizeText(value: string) {
  return collapseSpaces(value)
}

function numericMaxDecimals(field: NumericField, unit: OperationalUnit | '') {
  if (field === 'pieceWeightEquivalent') return 3
  if (field === 'minStock') return unit === 'PIECE' ? 0 : 2
  return 2
}

function normalizeNumericValue(field: NumericField, value: string, unit: OperationalUnit | '') {
  return field === 'pieceWeightEquivalent' || field === 'minStock'
    ? normalizeDecimalInput(value, numericMaxDecimals(field, unit))
    : normalizeCurrencyInput(value)
}

function formatNumericDisplay(field: NumericField, value: string, unit: OperationalUnit | '') {
  return field === 'pieceWeightEquivalent' || field === 'minStock'
    ? formatDecimalDisplay(value, numericMaxDecimals(field, unit))
    : formatCurrencyDisplay(value)
}

export function ProductFormModal({ product, onClose }: Props) {
  const [draft, setDraft] = useState<ProductFormDraft>(() => toProductFormDraft(product))
  const [errors, setErrors] = useState<ProductFormErrors>({})
  const [touched, setTouched] = useState<Partial<Record<ProductFormField, boolean>>>({})
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [focusedNumeric, setFocusedNumeric] = useState<Partial<Record<NumericField, boolean>>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const saveProduct = useSaveProduct(product?.id)
  const activeError = submitError ?? (hasProductFormErrors(errors) ? 'Corrige los campos marcados antes de guardar.' : null)

  function setDraftField(field: ProductFormField, nextValue: string, transform?: (value: string) => string) {
    const normalizedValue = transform ? transform(nextValue) : nextValue
    const nextDraft = { ...draft, [field]: normalizedValue } as ProductFormDraft

    const unitChangedByPresentation = field === 'presentationType' && normalizedValue === 'KG' && nextDraft.unit !== 'KG'
    if (unitChangedByPresentation) {
      nextDraft.unit = 'KG'
    }

    setDraft(nextDraft)
    if (touched[field] || isSubmitted) {
      const nextError = validateProductField(field, nextDraft)
      setErrors((current) => ({ ...current, [field]: nextError ?? undefined }))
    }
    if ((field === 'unit' || unitChangedByPresentation) && (touched.minStock || isSubmitted)) {
      const nextMinStockError = validateProductField('minStock', nextDraft)
      setErrors((current) => ({ ...current, minStock: nextMinStockError ?? undefined }))
    }
    setSubmitError(null)
  }

  function setNumericField(field: NumericField, rawValue: string) {
    const nextDraft = { ...draft, [field]: normalizeNumericValue(field, rawValue, draft.unit) } as ProductFormDraft
    setDraft(nextDraft)
    if (touched[field] || isSubmitted) {
      const nextError = validateProductField(field, nextDraft)
      setErrors((current) => ({ ...current, [field]: nextError ?? undefined }))
    }
    setSubmitError(null)
  }

  function markTouched(field: ProductFormField, nextDraft = draft) {
    setTouched((current) => ({ ...current, [field]: true }))
    const nextError = validateProductField(field, nextDraft)
    setErrors((current) => ({ ...current, [field]: nextError ?? undefined }))
  }

  function blurTextField(field: Extract<ProductFormField, 'name' | 'description' | 'categoryId'>) {
    const nextDraft = { ...draft, [field]: sanitizeText(draft[field]) } as ProductFormDraft
    setDraft(nextDraft)
    markTouched(field, nextDraft)
  }

  function blurSkuField() {
    const nextDraft = { ...draft, sku: cleanSku(draft.sku).trim() } as ProductFormDraft
    setDraft(nextDraft)
    markTouched('sku', nextDraft)
  }

  function focusNumericField(field: NumericField) {
    setFocusedNumeric((current) => ({ ...current, [field]: true }))
    setDraft((current) => ({ ...current, [field]: normalizeNumericValue(field, current[field], current.unit) }))
  }

  function blurNumericField(field: NumericField) {
    setFocusedNumeric((current) => ({ ...current, [field]: false }))
    const nextDraft = { ...draft, [field]: formatNumericDisplay(field, draft[field], draft.unit) || draft[field] } as ProductFormDraft
    setDraft(nextDraft)
    markTouched(field, nextDraft)
  }

  function validateCurrentForm(nextDraft: ProductFormDraft) {
    const nextErrors = validateProductForm(nextDraft)
    setErrors(nextErrors)
    setTouched({
      name: true,
      sku: true,
      description: true,
      categoryId: true,
      presentationType: true,
      salePrice: true,
      purchaseCost: true,
      minStock: true,
      unit: true,
      pieceWeightEquivalent: true,
      equivalentPolicyStatus: true,
    })
    return nextErrors
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitted(true)
    setSubmitError(null)

    const nextDraft: ProductFormDraft = {
      ...draft,
      name: sanitizeText(draft.name),
      sku: cleanSku(draft.sku).trim(),
      description: sanitizeText(draft.description),
      categoryId: sanitizeText(draft.categoryId),
      salePrice: normalizeCurrencyInput(draft.salePrice),
      purchaseCost: normalizeCurrencyInput(draft.purchaseCost),
      minStock: normalizeDecimalInput(draft.minStock, draft.unit === 'PIECE' ? 0 : 2),
      pieceWeightEquivalent: normalizeDecimalInput(draft.pieceWeightEquivalent, 3),
    }
    setDraft(nextDraft)

    const nextErrors = validateCurrentForm(nextDraft)
    if (hasProductFormErrors(nextErrors)) {
      const firstField = firstProductFormErrorField(nextErrors)
      if (firstField) document.getElementById(getFieldId(firstField))?.focus()
      return
    }

    try {
      await saveProduct.mutateAsync(toProductFormValues(nextDraft))
      onClose()
    } catch (caughtError) {
      setSubmitError(caughtError instanceof Error ? caughtError.message : 'No se pudo guardar el producto.')
    }
  }

  function numericDisplay(field: NumericField) {
    return focusedNumeric[field] ? draft[field] : formatNumericDisplay(field, draft[field], draft.unit)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[rgba(16,24,32,0.56)] px-4 py-8 backdrop-blur-sm">
      <form
        className="mx-auto grid max-w-5xl gap-5 overflow-hidden rounded-[1.6rem] border border-[color:var(--erp-border)] bg-white p-6 shadow-2xl"
        noValidate
        onSubmit={handleSubmit}
      >
        <header className="flex justify-between gap-4 border-b border-[color:var(--erp-border)] pb-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--erp-danger)]">Catálogo de productos</p>
            <h2 className="text-3xl font-black tracking-[-0.05em] text-[var(--erp-foreground)]">{product ? 'Editar producto' : 'Nuevo producto'}</h2>
            <p className="mt-2 text-sm text-[var(--erp-muted-foreground)]">Solo campos de catálogo. El stock se controla mediante movimientos por ubicación.</p>
          </div>
          <button
            aria-label="Cerrar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--erp-border)] bg-white text-[var(--erp-muted-foreground)] transition hover:border-[var(--erp-brand-gold)] hover:text-[var(--erp-foreground)]"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {activeError && (
          <p className="rounded-2xl bg-[rgba(157,45,36,0.10)] p-3 text-sm font-semibold text-[var(--erp-danger)]" role="alert">
            {activeError}
          </p>
        )}

        <fieldset className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm font-semibold md:col-span-2" htmlFor={getFieldId('name')}>
              Nombre
              <Input
                aria-describedby={mergeDescribedBy('name', Boolean(errors.name), false)}
                aria-invalid={Boolean(errors.name)}
                autoComplete="off"
                className={inputClass(Boolean(errors.name), Boolean(touched.name && draft.name && !errors.name))}
                id={getFieldId('name')}
                onBlur={() => blurTextField('name')}
                onChange={(event) => setDraftField('name', event.target.value)}
                placeholder="Pierna de pollo fresca"
                required
                value={draft.name}
              />
              {errors.name && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('name')}>{errors.name}</span>}
            </label>

            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('sku')}>
              SKU
              <Input
                aria-describedby={mergeDescribedBy('sku', Boolean(errors.sku), false)}
                aria-invalid={Boolean(errors.sku)}
                autoComplete="off"
                className={inputClass(Boolean(errors.sku), Boolean(touched.sku && draft.sku && !errors.sku))}
                id={getFieldId('sku')}
                onBlur={blurSkuField}
                onChange={(event) => setDraftField('sku', event.target.value, cleanSku)}
                placeholder="POL-000123"
                value={draft.sku}
              />
              {errors.sku && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('sku')}>{errors.sku}</span>}
            </label>
          </div>

          {product ? (
            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('categoryId')}>
              ID de categoría
              <Input
                aria-describedby={mergeDescribedBy('categoryId', Boolean(errors.categoryId), false)}
                aria-invalid={Boolean(errors.categoryId)}
                autoComplete="off"
                className={inputClass(Boolean(errors.categoryId), Boolean(touched.categoryId && draft.categoryId && !errors.categoryId))}
                id={getFieldId('categoryId')}
                onBlur={() => blurTextField('categoryId')}
                onChange={(event) => setDraftField('categoryId', event.target.value)}
                value={draft.categoryId}
              />
              {errors.categoryId && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('categoryId')}>{errors.categoryId}</span>}
            </label>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('salePrice')}>
              Precio de venta
              <Input
                aria-describedby={mergeDescribedBy('salePrice', Boolean(errors.salePrice), true)}
                aria-invalid={Boolean(errors.salePrice)}
                className={inputClass(Boolean(errors.salePrice), Boolean(touched.salePrice && draft.salePrice && !errors.salePrice))}
                id={getFieldId('salePrice')}
                inputMode="decimal"
                onBlur={() => blurNumericField('salePrice')}
                onChange={(event) => setNumericField('salePrice', event.target.value)}
                onFocus={() => focusNumericField('salePrice')}
                placeholder="185.50"
                required
                value={numericDisplay('salePrice')}
              />
              <span className="text-xs text-[var(--erp-muted-foreground)]" id={getHelpId('salePrice')}>Se guarda como monto numérico y se muestra con dos decimales al salir del campo.</span>
              {errors.salePrice && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('salePrice')}>{errors.salePrice}</span>}
            </label>

            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('purchaseCost')}>
              Costo de compra
              <Input
                aria-describedby={mergeDescribedBy('purchaseCost', Boolean(errors.purchaseCost), true)}
                aria-invalid={Boolean(errors.purchaseCost)}
                className={inputClass(Boolean(errors.purchaseCost), Boolean(touched.purchaseCost && draft.purchaseCost && !errors.purchaseCost))}
                id={getFieldId('purchaseCost')}
                inputMode="decimal"
                onBlur={() => blurNumericField('purchaseCost')}
                onChange={(event) => setNumericField('purchaseCost', event.target.value)}
                onFocus={() => focusNumericField('purchaseCost')}
                placeholder="142.80"
                value={numericDisplay('purchaseCost')}
              />
              <span className="text-xs text-[var(--erp-muted-foreground)]" id={getHelpId('purchaseCost')}>Permite cero cuando no hay costo registrado.</span>
              {errors.purchaseCost && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('purchaseCost')}>{errors.purchaseCost}</span>}
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('presentationType')}>
              Presentación
              <Select
                aria-describedby={mergeDescribedBy('presentationType', Boolean(errors.presentationType), false)}
                aria-invalid={Boolean(errors.presentationType)}
                className={inputClass(Boolean(errors.presentationType), Boolean(touched.presentationType && draft.presentationType && !errors.presentationType))}
                id={getFieldId('presentationType')}
                onBlur={() => markTouched('presentationType')}
                onChange={(event) => setDraftField('presentationType', event.target.value)}
                value={draft.presentationType}
              >
                <option value="">Selecciona una presentación</option>
                {presentationTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
              {errors.presentationType && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('presentationType')}>{errors.presentationType}</span>}
            </label>

            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('unit')}>
              Unidad operativa
              <Select
                aria-describedby={mergeDescribedBy('unit', Boolean(errors.unit), false)}
                aria-invalid={Boolean(errors.unit)}
                className={inputClass(Boolean(errors.unit), Boolean(touched.unit && draft.unit && !errors.unit))}
                id={getFieldId('unit')}
                onBlur={() => markTouched('unit')}
                onChange={(event) => setDraftField('unit', event.target.value)}
                value={draft.unit}
              >
                <option value="">Selecciona una unidad</option>
                {unitOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
              {errors.unit && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('unit')}>{errors.unit}</span>}
            </label>

            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('minStock')}>
              Mínimo comercial
              <Input
                aria-describedby={mergeDescribedBy('minStock', Boolean(errors.minStock), true)}
                aria-invalid={Boolean(errors.minStock)}
                className={inputClass(Boolean(errors.minStock), Boolean(touched.minStock && draft.minStock && !errors.minStock))}
                id={getFieldId('minStock')}
                inputMode="decimal"
                onBlur={() => blurNumericField('minStock')}
                onChange={(event) => setNumericField('minStock', event.target.value)}
                onFocus={() => focusNumericField('minStock')}
                placeholder="5"
                value={numericDisplay('minStock')}
              />
              <span className="text-xs text-[var(--erp-muted-foreground)]" id={getHelpId('minStock')}>Pieza requiere enteros; kilo permite decimales.</span>
              {errors.minStock && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('minStock')}>{errors.minStock}</span>}
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('pieceWeightEquivalent')}>
              Equivalencia kg por pieza
              <Input
                aria-describedby={mergeDescribedBy('pieceWeightEquivalent', Boolean(errors.pieceWeightEquivalent), true)}
                aria-invalid={Boolean(errors.pieceWeightEquivalent)}
                className={inputClass(Boolean(errors.pieceWeightEquivalent), Boolean(touched.pieceWeightEquivalent && draft.pieceWeightEquivalent && !errors.pieceWeightEquivalent))}
                id={getFieldId('pieceWeightEquivalent')}
                inputMode="decimal"
                onBlur={() => blurNumericField('pieceWeightEquivalent')}
                onChange={(event) => setNumericField('pieceWeightEquivalent', event.target.value)}
                onFocus={() => focusNumericField('pieceWeightEquivalent')}
                placeholder="1.250"
                value={numericDisplay('pieceWeightEquivalent')}
              />
              <span className="text-xs text-[var(--erp-muted-foreground)]" id={getHelpId('pieceWeightEquivalent')}>Opcional. Cuando se captura, debe ser mayor que cero y permite hasta 3 decimales.</span>
              {errors.pieceWeightEquivalent && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('pieceWeightEquivalent')}>{errors.pieceWeightEquivalent}</span>}
            </label>

            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('equivalentPolicyStatus')}>
              Política de equivalencia
              <Select
                aria-describedby={mergeDescribedBy('equivalentPolicyStatus', Boolean(errors.equivalentPolicyStatus), false)}
                aria-invalid={Boolean(errors.equivalentPolicyStatus)}
                className={inputClass(Boolean(errors.equivalentPolicyStatus), Boolean(touched.equivalentPolicyStatus && draft.equivalentPolicyStatus && !errors.equivalentPolicyStatus))}
                id={getFieldId('equivalentPolicyStatus')}
                onBlur={() => markTouched('equivalentPolicyStatus')}
                onChange={(event) => setDraftField('equivalentPolicyStatus', event.target.value)}
                value={draft.equivalentPolicyStatus}
              >
                <option value="">Selecciona una política</option>
                {equivalentPolicyOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
              {errors.equivalentPolicyStatus && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('equivalentPolicyStatus')}>{errors.equivalentPolicyStatus}</span>}
            </label>
          </div>

          {draft.unit === 'KG_AND_PIECE' && (
            <p className="rounded-xl border border-[rgba(214,155,45,0.30)] bg-[rgba(214,155,45,0.12)] p-3 text-sm text-[var(--erp-brand-gold-deep)]">
              La equivalencia oficial se gestiona en el flujo autorizado de equivalencias; este formulario no modifica saldos operativos.
            </p>
          )}

          <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('description')}>
            Descripción
            <textarea
              aria-describedby={mergeDescribedBy('description', Boolean(errors.description), true)}
              aria-invalid={Boolean(errors.description)}
              className={textareaFieldClass(Boolean(errors.description), Boolean(touched.description && draft.description && !errors.description))}
              id={getFieldId('description')}
              onBlur={() => blurTextField('description')}
              onChange={(event) => setDraftField('description', event.target.value)}
              placeholder="Producto fresco refrigerado para venta al menudeo."
              value={draft.description}
            />
            <span className="text-xs text-[var(--erp-muted-foreground)]" id={getHelpId('description')}>Opcional. Máximo 500 caracteres.</span>
            {errors.description && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('description')}>{errors.description}</span>}
          </label>
        </fieldset>

        <div className="flex flex-col items-end gap-3 sm:flex-row sm:justify-between">
          <div className="text-xs text-[var(--erp-muted-foreground)]">Todos los campos relevantes se validan al escribir, al salir del campo y antes de guardar.</div>
          <button
            className="justify-self-end rounded-xl bg-[var(--erp-brand-red)] px-5 py-3 font-black text-white transition hover:bg-[var(--erp-brand-red-strong)] disabled:opacity-60"
            disabled={saveProduct.isPending}
            type="submit"
          >
            {saveProduct.isPending ? 'Guardando...' : 'Guardar producto'}
          </button>
        </div>
      </form>
    </div>
  )
}
