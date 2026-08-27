import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type {
  CfdiConceptSnapshot,
  CfdiCreditNoteSnapshot,
  CfdiPaymentTaxSnapshot,
} from './cfdi-document.types';
import { CfdiDomainError } from './cfdi-domain.error';

const ZERO = new Prisma.Decimal(0);
const ONE = new Prisma.Decimal(1);

export type CreditAdjustmentSource =
  'APPROVED_RETURN' | 'BONUS' | 'POST_SALE_DISCOUNT' | 'COMMERCIAL_ADJUSTMENT';

export interface CreditNoteOriginalConcept {
  readonly sourceSaleItemId: string | null;
  readonly productServiceCode: string;
  readonly identificationNumber: string | null;
  readonly description: string;
  readonly quantity: Prisma.Decimal;
  readonly unitCode: string;
  readonly unitValue: Prisma.Decimal;
  readonly amount: Prisma.Decimal;
  readonly discount: Prisma.Decimal;
  readonly taxableBase: Prisma.Decimal;
  readonly taxObjectCode: string;
  readonly taxCode: string | null;
  readonly factorType: string | null;
  readonly rateOrQuota: Prisma.Decimal | null;
  readonly taxAmount: Prisma.Decimal;
  readonly total: Prisma.Decimal;
  readonly taxesSnapshot: unknown;
}

export interface CreditNoteBuildInput {
  readonly creditAdjustmentId: string;
  readonly creditAdjustmentVersion: number;
  readonly issuedAt: Date;
  readonly sourceType: CreditAdjustmentSource;
  readonly currencyCode: string;
  readonly exchangeRate: Prisma.Decimal;
  readonly paymentFormCode: string;
  readonly issuer: CfdiCreditNoteSnapshot['issuer'];
  readonly receiver: Omit<CfdiCreditNoteSnapshot['receiver'], 'fiscalUseCode'>;
  readonly applications: readonly {
    readonly originalInvoiceId: string;
    readonly originalUuid: string;
    readonly relationshipTypeCode: '01' | '03';
    readonly concepts: readonly {
      readonly creditAdjustmentLineId: string;
      readonly originalInvoiceConceptId: string;
      readonly creditTotal: Prisma.Decimal;
      readonly availableTotal: Prisma.Decimal;
      readonly original: CreditNoteOriginalConcept;
    }[];
  }[];
}

export interface CreditNoteLineBuildResult {
  readonly creditAdjustmentLineId: string;
  readonly originalInvoiceConceptId: string;
  readonly requestedCreditTotal: Prisma.Decimal;
  readonly creditSubtotal: Prisma.Decimal;
  readonly creditDiscount: Prisma.Decimal;
  readonly creditTaxableBase: Prisma.Decimal;
  readonly creditTax: Prisma.Decimal;
  readonly creditTotal: Prisma.Decimal;
  readonly taxesSnapshot: readonly CfdiPaymentTaxSnapshot[];
  readonly snapshot: CfdiConceptSnapshot;
}

export interface CreditNoteBuildResult {
  readonly snapshot: CfdiCreditNoteSnapshot;
  readonly lines: readonly CreditNoteLineBuildResult[];
  readonly snapshotHash: string;
}

function money(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function decimal(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP).toFixed(6);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const source = value as Record<string, unknown>;
  return `{${Object.keys(source)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(source[key])}`)
    .join(',')}}`;
}

function hash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function normalizeTaxes(
  value: unknown,
  ratio: Prisma.Decimal,
): readonly CfdiPaymentTaxSnapshot[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const source = entry as Record<string, unknown>;
    const taxCode = source.taxCode ?? source.code;
    const factorType = source.factorType ?? source.type;
    const rateOrQuota = source.rateOrQuota ?? source.rate;
    const base = source.base ?? source.taxableBase;
    const amount = source.amount ?? source.taxAmount;
    if (
      typeof taxCode !== 'string' ||
      typeof factorType !== 'string' ||
      typeof rateOrQuota !== 'string' ||
      (typeof base !== 'string' && typeof base !== 'number') ||
      (typeof amount !== 'string' && typeof amount !== 'number')
    ) {
      return [];
    }
    return [
      {
        taxCode,
        factorType,
        rateOrQuota,
        base: money(new Prisma.Decimal(base).times(ratio)).toFixed(2),
        amount: money(new Prisma.Decimal(amount).times(ratio)).toFixed(2),
        ...(source.isRetention === true ? { isRetention: true } : {}),
      },
    ];
  });
}

export function buildCreditNoteDocument(
  input: CreditNoteBuildInput,
): CreditNoteBuildResult {
  if (!input.applications.length) {
    throw new CfdiDomainError('CREDIT_NOTE_ORIGINAL_INVOICE_NOT_STAMPED');
  }
  if (
    !input.exchangeRate.greaterThan(ZERO) ||
    (input.currencyCode === 'MXN' && !input.exchangeRate.equals(ONE))
  ) {
    throw new CfdiDomainError('INVALID_PAYMENT_CONFIGURATION');
  }

  const expectedRelationship =
    input.sourceType === 'APPROVED_RETURN' ? '03' : '01';
  const applications = [...input.applications].sort((left, right) =>
    left.originalInvoiceId.localeCompare(right.originalInvoiceId),
  );
  const lines: CreditNoteLineBuildResult[] = [];
  for (const application of applications) {
    if (application.relationshipTypeCode !== expectedRelationship) {
      throw new CfdiDomainError('CREDIT_NOTE_MIXED_PARTIES');
    }
    for (const requested of [...application.concepts].sort((left, right) =>
      left.originalInvoiceConceptId.localeCompare(
        right.originalInvoiceConceptId,
      ),
    )) {
      const creditTotal = money(requested.creditTotal);
      const available = money(requested.availableTotal);
      const original = requested.original;
      if (
        !creditTotal.greaterThan(ZERO) ||
        creditTotal.greaterThan(available) ||
        creditTotal.greaterThan(money(original.total)) ||
        !original.total.greaterThan(ZERO)
      ) {
        throw new CfdiDomainError('CREDIT_NOTE_OVER_CREDITED', {
          invoiceConceptId: requested.originalInvoiceConceptId,
        });
      }
      const ratio = creditTotal.dividedBy(original.total);
      const creditDiscount = money(original.discount.times(ratio));
      const creditTaxableBase = money(original.taxableBase.times(ratio));
      const creditTax = money(original.taxAmount.times(ratio));
      // Preserve the requested total exactly after monetary rounding. Any one
      // cent residual belongs in subtotal, never in provider-owned totals.
      const creditSubtotal = money(
        creditTotal.plus(creditDiscount).minus(creditTax),
      );
      const taxesSnapshot = normalizeTaxes(original.taxesSnapshot, ratio);
      if (original.taxObjectCode === '02' && taxesSnapshot.length === 0) {
        throw new CfdiDomainError('CREDIT_NOTE_TAX_SNAPSHOT_MISSING', {
          invoiceConceptId: requested.originalInvoiceConceptId,
        });
      }
      const conceptBase = {
        lineNumber: lines.length + 1,
        sourceBillingRequestItemId: requested.creditAdjustmentLineId,
        sourceSaleItemId: original.sourceSaleItemId ?? '',
        sourceProductId: requested.originalInvoiceConceptId,
        productServiceCode: original.productServiceCode,
        identificationNumber: original.identificationNumber,
        description: original.description,
        quantity: '1.000000',
        unitCode: original.unitCode,
        unitValue: decimal(creditSubtotal),
        amount: creditSubtotal.toFixed(2),
        discount: creditDiscount.toFixed(2),
        taxableBase: creditTaxableBase.toFixed(2),
        taxObjectCode: original.taxObjectCode,
        taxCode: original.taxCode ?? '',
        factorType: original.factorType ?? 'Exento',
        rateOrQuota: original.rateOrQuota
          ? decimal(original.rateOrQuota)
          : '0.000000',
        taxAmount: creditTax.toFixed(2),
        total: creditTotal.toFixed(2),
      };
      const snapshot: CfdiConceptSnapshot = {
        ...conceptBase,
        snapshotHash: hash({
          ...conceptBase,
          originalInvoiceConceptId: requested.originalInvoiceConceptId,
        }),
      };
      lines.push({
        creditAdjustmentLineId: requested.creditAdjustmentLineId,
        originalInvoiceConceptId: requested.originalInvoiceConceptId,
        requestedCreditTotal: creditTotal,
        creditSubtotal,
        creditDiscount,
        creditTaxableBase,
        creditTax,
        creditTotal,
        taxesSnapshot,
        snapshot,
      });
    }
  }
  if (!lines.length) {
    throw new CfdiDomainError('CREDIT_NOTE_CONCEPT_NOT_FOUND');
  }

  const subtotal = money(
    lines.reduce((sum, line) => sum.plus(line.creditSubtotal), ZERO),
  );
  const discount = money(
    lines.reduce((sum, line) => sum.plus(line.creditDiscount), ZERO),
  );
  const taxableBase = money(
    lines.reduce((sum, line) => sum.plus(line.creditTaxableBase), ZERO),
  );
  const tax = money(
    lines.reduce((sum, line) => sum.plus(line.creditTax), ZERO),
  );
  const total = money(
    lines.reduce((sum, line) => sum.plus(line.creditTotal), ZERO),
  );
  const baseSnapshot = {
    cfdiVersion: '4.0' as const,
    cfdiType: 'CREDIT_NOTE' as const,
    creditAdjustmentId: input.creditAdjustmentId,
    creditAdjustmentVersion: input.creditAdjustmentVersion,
    issuedAt: input.issuedAt.toISOString(),
    currencyCode: input.currencyCode,
    exchangeRate: decimal(input.exchangeRate),
    exportCode: '01' as const,
    fiscalUseCode: 'G02' as const,
    paymentFormCode: input.paymentFormCode,
    paymentMethodCode: 'PUE' as const,
    sourceDocumentIds: applications.map(
      (application) => application.originalInvoiceId,
    ),
    issuer: input.issuer,
    receiver: { ...input.receiver, fiscalUseCode: 'G02' as const },
    relationships: applications.map((application) => ({
      typeCode: application.relationshipTypeCode,
      relatedInvoiceId: application.originalInvoiceId,
      relatedUuid: application.originalUuid,
    })),
    concepts: lines.map((line) => line.snapshot),
    totals: {
      subtotal: subtotal.toFixed(2),
      discount: discount.toFixed(2),
      taxableBase: taxableBase.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
    },
  };
  const snapshotHash = hash(baseSnapshot);
  return {
    snapshot: Object.freeze({ ...baseSnapshot, snapshotHash }),
    lines,
    snapshotHash,
  };
}
