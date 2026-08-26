import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { CfdiDomainError } from './cfdi-domain.error';
import type {
  CfdiPaymentReceiptApplicationSnapshot,
  CfdiPaymentTaxSnapshot,
  CfdiPaymentReceiptSnapshot,
} from './cfdi-document.types';

const ZERO = new Prisma.Decimal(0);
const ONE = new Prisma.Decimal(1);

export interface RepFiscalPartySnapshot {
  readonly legalEntityId?: string;
  readonly customerId?: string;
  readonly legalName?: string;
  readonly fiscalName?: string;
  readonly taxId: string;
  readonly fiscalPostalCode: string;
  readonly fiscalRegime: string;
  readonly series?: string;
  readonly certificateSerialNumber?: string;
  readonly certificateFingerprint?: string;
  readonly billingEmail?: string;
}

export interface RepSourceDocument {
  readonly id: string;
  readonly saleDocumentId: string;
  readonly saleId: string;
  readonly totalApplied: Prisma.Decimal;
}

export interface RepCandidate {
  readonly invoiceId: string;
  readonly uuid: string;
  readonly issuedAt: Date | null;
  readonly series: string | null;
  readonly folio: string | null;
  readonly currencyCode: string;
  readonly total: Prisma.Decimal;
  readonly effectiveAppliedTotal: Prisma.Decimal;
  readonly effectiveAppliedForSale: Prisma.Decimal;
  readonly maxEffectivePartiality: number;
  readonly taxObjectCode: string;
  readonly issuer: RepFiscalPartySnapshot;
  readonly receiver: RepFiscalPartySnapshot;
  readonly sourceDocuments: readonly RepSourceDocument[];
  readonly taxesSnapshot?: unknown;
}

export interface RepBuildInput {
  readonly paymentId: string;
  readonly paymentReceiptId: string;
  /** CFDI root issue date; the payment node keeps the economic paidAt. */
  readonly issuedAt: Date;
  readonly paidAt: Date;
  readonly amount: Prisma.Decimal;
  readonly currencyCode: string;
  readonly exchangeRateToMxn: Prisma.Decimal;
  readonly paymentFormCode: string;
  readonly candidates: readonly RepCandidate[];
}

export interface RepAllocation {
  readonly candidate: RepCandidate;
  readonly partialityNumber: number;
  readonly previousBalanceAmount: Prisma.Decimal;
  readonly amountPaid: Prisma.Decimal;
  readonly remainingBalance: Prisma.Decimal;
  readonly sourceDocumentIds: readonly string[];
  readonly taxesSnapshot: readonly CfdiPaymentTaxSnapshot[];
}

export interface RepBuildResult {
  readonly snapshot: CfdiPaymentReceiptSnapshot;
  readonly allocations: readonly RepAllocation[];
  readonly totalPaymentsMxn: Prisma.Decimal;
  readonly snapshotHash: string;
}

function money(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function decimal(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP).toFixed(6);
}

function moneyString(value: Prisma.Decimal): string {
  return money(value).toFixed(2);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`;
}

function hash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function sameParty(
  left: RepFiscalPartySnapshot,
  right: RepFiscalPartySnapshot,
): boolean {
  return (
    left.taxId === right.taxId &&
    left.fiscalPostalCode === right.fiscalPostalCode &&
    left.fiscalRegime === right.fiscalRegime &&
    (left.legalEntityId ?? null) === (right.legalEntityId ?? null) &&
    (left.customerId ?? null) === (right.customerId ?? null)
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function decimalValue(value: unknown): Prisma.Decimal | null {
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    !(value instanceof Prisma.Decimal)
  ) {
    return null;
  }
  try {
    return new Prisma.Decimal(value);
  } catch {
    return null;
  }
}

function normalizeTaxSnapshots(value: unknown): CfdiPaymentTaxSnapshot[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.flatMap((entry) => {
    const source = record(entry);
    if (!source) return [];
    const taxCode = text(source.taxCode ?? source.code);
    const factorType = text(source.factorType ?? source.type);
    const rateOrQuota = text(source.rateOrQuota ?? source.rate);
    const base = decimalValue(source.base ?? source.taxableBase);
    const amount = decimalValue(source.amount ?? source.taxAmount);
    if (!taxCode || !factorType || !rateOrQuota || !base || !amount) return [];
    if (base.lessThan(ZERO) || amount.lessThan(ZERO)) return [];
    return [
      {
        taxCode,
        factorType,
        rateOrQuota,
        base: money(base).toFixed(2),
        amount: money(amount).toFixed(2),
        ...(source.isRetention === true ? { isRetention: true } : {}),
      },
    ];
  });
}

function taxSnapshotsForAllocation(
  candidate: RepCandidate,
  amountPaid: Prisma.Decimal,
): readonly CfdiPaymentTaxSnapshot[] {
  if (candidate.taxObjectCode !== '02') return [];
  const source = normalizeTaxSnapshots(candidate.taxesSnapshot);
  if (!source.length) {
    throw new CfdiDomainError('REP_TAX_SNAPSHOT_MISSING', {
      invoiceId: candidate.invoiceId,
    });
  }
  if (!candidate.total.greaterThan(ZERO)) {
    throw new CfdiDomainError('REP_TAX_SNAPSHOT_INVALID', {
      invoiceId: candidate.invoiceId,
    });
  }
  const ratio = amountPaid.dividedBy(candidate.total);
  return source.map((tax) => ({
    ...tax,
    base: money(new Prisma.Decimal(tax.base).times(ratio)).toFixed(2),
    amount: money(new Prisma.Decimal(tax.amount).times(ratio)).toFixed(2),
  }));
}

function aggregateTaxSnapshots(
  allocations: readonly RepAllocation[],
): readonly CfdiPaymentTaxSnapshot[] {
  const grouped = new Map<
    string,
    {
      base: Prisma.Decimal;
      amount: Prisma.Decimal;
      tax: CfdiPaymentTaxSnapshot;
    }
  >();
  for (const allocation of allocations) {
    for (const tax of allocation.taxesSnapshot) {
      const key = `${tax.taxCode}:${tax.factorType}:${tax.rateOrQuota}:${tax.isRetention === true}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.base = existing.base.plus(tax.base);
        existing.amount = existing.amount.plus(tax.amount);
      } else {
        grouped.set(key, {
          base: new Prisma.Decimal(tax.base),
          amount: new Prisma.Decimal(tax.amount),
          tax,
        });
      }
    }
  }
  return [...grouped.values()].map(({ base, amount, tax }) => ({
    ...tax,
    base: money(base).toFixed(2),
    amount: money(amount).toFixed(2),
  }));
}

export function buildRepDocument(input: RepBuildInput): RepBuildResult {
  if (!input.candidates.length) {
    throw new CfdiDomainError('REP_ORIGINAL_INVOICE_NOT_STAMPED');
  }
  const amount = money(input.amount);
  if (!amount.greaterThan(ZERO)) {
    throw new CfdiDomainError('REP_PAYMENT_EXCEEDS_AVAILABLE');
  }
  const exchangeRate = input.exchangeRateToMxn;
  if (
    !exchangeRate.greaterThan(ZERO) ||
    (input.currencyCode === 'MXN' && !exchangeRate.equals(ONE))
  ) {
    throw new CfdiDomainError('INVALID_PAYMENT_CONFIGURATION');
  }

  const sortedCandidates = [...input.candidates].sort((left, right) => {
    const issuedAt =
      (left.issuedAt?.getTime() ?? 0) - (right.issuedAt?.getTime() ?? 0);
    if (issuedAt !== 0) return issuedAt;
    const uuid = left.uuid.localeCompare(right.uuid);
    return uuid !== 0 ? uuid : left.invoiceId.localeCompare(right.invoiceId);
  });
  const first = sortedCandidates[0];
  for (const candidate of sortedCandidates) {
    if (candidate.currencyCode !== input.currencyCode) {
      throw new CfdiDomainError('REP_CURRENCY_MISMATCH');
    }
    if (!sameParty(first.issuer, candidate.issuer)) {
      throw new CfdiDomainError('MIXED_LEGAL_ENTITIES');
    }
    if (!sameParty(first.receiver, candidate.receiver)) {
      throw new CfdiDomainError('MIXED_CUSTOMERS');
    }
  }

  let remainingPayment = amount;
  const allocations: RepAllocation[] = [];
  for (const candidate of sortedCandidates) {
    const invoiceBalance = money(
      candidate.total.minus(candidate.effectiveAppliedTotal),
    );
    const saleCapacity = money(
      candidate.sourceDocuments
        .reduce((sum, document) => sum.plus(document.totalApplied), ZERO)
        .minus(candidate.effectiveAppliedForSale),
    );
    const available = Prisma.Decimal.min(invoiceBalance, saleCapacity);
    if (!available.greaterThan(ZERO) || !remainingPayment.greaterThan(ZERO))
      continue;
    const amountPaid = money(Prisma.Decimal.min(remainingPayment, available));
    if (!amountPaid.greaterThan(ZERO)) continue;
    const previousBalanceAmount = invoiceBalance;
    const remainingBalance = money(previousBalanceAmount.minus(amountPaid));
    const taxesSnapshot = taxSnapshotsForAllocation(candidate, amountPaid);
    allocations.push({
      candidate,
      partialityNumber: candidate.maxEffectivePartiality + 1,
      previousBalanceAmount,
      amountPaid,
      remainingBalance,
      sourceDocumentIds: candidate.sourceDocuments.map(
        (document) => document.saleDocumentId,
      ),
      taxesSnapshot,
    });
    remainingPayment = money(remainingPayment.minus(amountPaid));
  }

  if (remainingPayment.greaterThan(ZERO)) {
    throw new CfdiDomainError('REP_UNALLOCATED_PAYMENT_AMOUNT', {
      remaining: moneyString(remainingPayment),
    });
  }

  const relatedDocuments: CfdiPaymentReceiptApplicationSnapshot[] =
    allocations.map((allocation) => ({
      relatedInvoiceId: allocation.candidate.invoiceId,
      relatedUuid: allocation.candidate.uuid,
      relatedSeries: allocation.candidate.series,
      relatedFolio: allocation.candidate.folio,
      documentCurrencyCode: allocation.candidate.currencyCode,
      equivalenceDr: decimal(ONE),
      paymentMethodDr: 'PPD',
      partialityNumber: allocation.partialityNumber,
      previousBalanceAmount: moneyString(allocation.previousBalanceAmount),
      amountPaid: moneyString(allocation.amountPaid),
      remainingBalance: moneyString(allocation.remainingBalance),
      taxObjectCode: allocation.candidate.taxObjectCode,
      taxesSnapshot:
        allocation.taxesSnapshot.length > 0 ? allocation.taxesSnapshot : null,
    }));

  const baseSnapshot = {
    cfdiVersion: '4.0' as const,
    cfdiType: 'PAYMENT_RECEIPT' as const,
    paymentId: input.paymentId,
    paymentReceiptId: input.paymentReceiptId,
    issuedAt: input.issuedAt.toISOString(),
    currencyCode: 'XXX' as const,
    exchangeRate: '1.000000' as const,
    exportCode: '01' as const,
    paymentFormCode: null,
    paymentMethodCode: null,
    sourceDocumentIds: allocations
      .flatMap((allocation) => allocation.sourceDocumentIds)
      .sort(),
    issuer: {
      legalEntityId: first.issuer.legalEntityId!,
      legalName: first.issuer.legalName!,
      taxId: first.issuer.taxId,
      fiscalPostalCode: first.issuer.fiscalPostalCode,
      fiscalRegime: first.issuer.fiscalRegime,
      series: first.issuer.series!,
      certificateSerialNumber: first.issuer.certificateSerialNumber!,
      certificateFingerprint: first.issuer.certificateFingerprint!,
    },
    receiver: {
      customerId: first.receiver.customerId!,
      fiscalName: first.receiver.fiscalName!,
      taxId: first.receiver.taxId,
      fiscalPostalCode: first.receiver.fiscalPostalCode,
      fiscalRegime: first.receiver.fiscalRegime,
      fiscalUseCode: 'CP01' as const,
      billingEmail: first.receiver.billingEmail ?? '',
    },
    payment: {
      paidAt: input.paidAt.toISOString(),
      paymentFormCode: input.paymentFormCode,
      currencyCode: input.currencyCode,
      exchangeRateToMxn: decimal(exchangeRate),
      amount: moneyString(amount),
      taxes: (() => {
        const taxes = aggregateTaxSnapshots(allocations);
        return taxes.length > 0 ? taxes : undefined;
      })(),
      relatedDocuments,
    },
    concepts: [] as const,
    totals: {
      subtotal: '0.00' as const,
      discount: '0.00' as const,
      taxableBase: '0.00' as const,
      tax: '0.00' as const,
      total: '0.00' as const,
    },
  };
  const snapshotHash = hash(baseSnapshot);
  return {
    snapshot: Object.freeze({ ...baseSnapshot, snapshotHash }),
    allocations,
    totalPaymentsMxn: money(amount.times(exchangeRate)),
    snapshotHash,
  };
}
