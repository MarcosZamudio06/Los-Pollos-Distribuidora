import { Prisma } from '@prisma/client';

export type BillingStatus =
  | 'NOT_BILLABLE'
  | 'BILLABLE'
  | 'PENDING_INFORMATION'
  | 'REQUESTED'
  | 'IN_PROCESS'
  | 'PARTIALLY_INVOICED'
  | 'FULLY_INVOICED'
  | 'BLOCKED'
  | 'CANCELLED';

export type BillingBlockingCode =
  | 'MISSING_TAX_ID'
  | 'MISSING_FISCAL_PROFILE'
  | 'CUSTOMER_INACTIVE'
  | 'SALE_NOT_CONFIRMED'
  | 'SALE_CANCELLED'
  | 'DOCUMENT_CANCELLED'
  | 'DOCUMENT_TYPE_NOT_BILLABLE'
  | 'MISSING_CUSTOMER'
  | 'MISSING_CURRENCY'
  | 'MISSING_LEGAL_ENTITY'
  | 'DELIVERY_PENDING'
  | 'BILLING_DEADLINE_EXPIRED'
  | 'INVALID_TOTAL'
  | 'ZERO_BALANCE'
  | 'OVER_REQUESTED'
  | 'OVER_INVOICED';

type SaleDocumentType = 'SCALE_TICKET' | 'SIMPLE_NOTE' | 'LARGE_NOTE' | 'INTERNAL_RECEIPT';
type BillingRequestStatus = 'REQUESTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface BillabilityInput {
  sale: {
    status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
    total: Prisma.Decimal;
    customerId: string | null;
    currencyCode: string | null;
    legalEntityId: string | null;
    createdAt: Date;
  };
  document: {
    documentType: SaleDocumentType;
    status: 'DRAFT' | 'ISSUED' | 'COLLECTED' | 'CANCELLED';
    issuedAt: Date;
  };
  customer: {
    isActive: boolean;
    taxId: string | null;
    fiscalName: string | null;
    fiscalPostalCode: string | null;
    fiscalRegime: string | null;
    fiscalUseCode: string | null;
    billingEmail: string | null;
  } | null;
  delivery: {
    status: 'PENDING' | 'IN_ROUTE' | 'DELIVERED' | 'NOT_DELIVERED' | 'CANCELLED' | 'PARTIALLY_REJECTED' | 'RETURNED';
    deliveredAt: Date | null;
  } | null;
  policy: {
    billableDocumentTypes: readonly SaleDocumentType[];
    allowInternalReceipt: boolean;
    requireConfirmedDelivery: boolean;
    deadlineDays: number | null;
    deadlineBasis: 'ISSUED_AT' | 'DELIVERED_AT';
    timezone: string;
  };
  requests: readonly {
    status: BillingRequestStatus;
    requestedTotal: Prisma.Decimal;
    reversedAt?: Date | null;
  }[];
  applications: readonly {
    invoiceStatus: 'ACTIVE' | 'CANCELLED' | 'SUBSTITUTED';
    totalApplied: Prisma.Decimal;
    reversedAt?: Date | null;
  }[];
  payments: readonly {
    status: 'REGISTERED' | 'APPLIED' | 'CANCELLED';
    amount: Prisma.Decimal;
  }[];
  evaluatedAt: Date;
}

export interface BillabilityResult {
  status: BillingStatus;
  blockingCodes: BillingBlockingCode[];
  amounts: {
    billable: Prisma.Decimal;
    activeRequested: Prisma.Decimal;
    activeInvoiced: Prisma.Decimal;
    pendingInvoice: Prisma.Decimal;
    activePaid: Prisma.Decimal;
    collectionBalance: Prisma.Decimal;
  };
  deadline: Date | null;
}

export class BillingBalanceError extends Error {
  constructor(
    readonly code: 'INVALID_REQUESTED_AMOUNT' | 'OVER_REQUESTED' | 'INVALID_APPLIED_AMOUNT' | 'OVER_INVOICED',
  ) {
    super(code);
    this.name = 'BillingBalanceError';
  }
}

const ZERO = new Prisma.Decimal(0);
const ACTIVE_REQUEST_STATUSES: readonly BillingRequestStatus[] = ['REQUESTED', 'IN_REVIEW', 'APPROVED'];

const sumDecimals = (values: readonly Prisma.Decimal[]) =>
  values.reduce((total, value) => total.plus(value), ZERO);

const present = (value: string | null | undefined) => Boolean(value?.trim());

const localDateParts = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day') };
};

const calendarKey = (date: Date, timezone: string) => {
  const { year, month, day } = localDateParts(date, timezone);
  return year * 10_000 + month * 100 + day;
};

const addCalendarDays = (date: Date, days: number, timezone: string) => {
  const parts = localDateParts(date, timezone);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
};

export function validateRequestedAmount(amount: Prisma.Decimal, availableBalance: Prisma.Decimal): void {
  if (amount.lessThanOrEqualTo(ZERO)) throw new BillingBalanceError('INVALID_REQUESTED_AMOUNT');
  if (amount.greaterThan(availableBalance)) throw new BillingBalanceError('OVER_REQUESTED');
}

export function validateAppliedAmount(amount: Prisma.Decimal, availableBalance: Prisma.Decimal): void {
  if (amount.lessThanOrEqualTo(ZERO)) throw new BillingBalanceError('INVALID_APPLIED_AMOUNT');
  if (amount.greaterThan(availableBalance)) throw new BillingBalanceError('OVER_INVOICED');
}

export function evaluateBillability(input: BillabilityInput): BillabilityResult {
  const billable = input.sale.total;
  const activeRequests = input.requests.filter(
    (request) => !request.reversedAt && ACTIVE_REQUEST_STATUSES.includes(request.status),
  );
  const activeRequested = sumDecimals(activeRequests.map((request) => request.requestedTotal));
  const activeInvoiced = sumDecimals(
    input.applications
      .filter((application) => !application.reversedAt && application.invoiceStatus === 'ACTIVE')
      .map((application) => application.totalApplied),
  );
  const activePaid = sumDecimals(
    input.payments.filter((payment) => payment.status !== 'CANCELLED').map((payment) => payment.amount),
  );
  const pendingInvoice = Prisma.Decimal.max(ZERO, billable.minus(activeInvoiced));
  const collectionBalance = Prisma.Decimal.max(ZERO, billable.minus(activePaid));
  const blockingCodes: BillingBlockingCode[] = [];

  const result = (status: BillingStatus, deadline: Date | null = null): BillabilityResult => ({
    status,
    blockingCodes,
    amounts: { billable, activeRequested, activeInvoiced, pendingInvoice, activePaid, collectionBalance },
    deadline,
  });

  if (input.sale.status === 'CANCELLED' || input.document.status === 'CANCELLED') {
    blockingCodes.push(input.sale.status === 'CANCELLED' ? 'SALE_CANCELLED' : 'DOCUMENT_CANCELLED');
    return result('CANCELLED');
  }

  if (input.sale.status !== 'CONFIRMED') blockingCodes.push('SALE_NOT_CONFIRMED');
  if (!input.sale.customerId) blockingCodes.push('MISSING_CUSTOMER');
  if (billable.lessThanOrEqualTo(ZERO)) blockingCodes.push(billable.isZero() ? 'ZERO_BALANCE' : 'INVALID_TOTAL');
  const typeAllowed =
    input.policy.billableDocumentTypes.includes(input.document.documentType) &&
    (input.document.documentType !== 'INTERNAL_RECEIPT' || input.policy.allowInternalReceipt);
  if (!typeAllowed) blockingCodes.push('DOCUMENT_TYPE_NOT_BILLABLE');
  if (blockingCodes.length) return result('NOT_BILLABLE');

  if (!input.customer?.isActive) blockingCodes.push('CUSTOMER_INACTIVE');
  if (!present(input.customer?.taxId)) blockingCodes.push('MISSING_TAX_ID');
  if (
    !input.customer ||
    !present(input.customer.fiscalName) ||
    !present(input.customer.fiscalPostalCode) ||
    !present(input.customer.fiscalRegime) ||
    !present(input.customer.fiscalUseCode) ||
    !present(input.customer.billingEmail)
  ) {
    blockingCodes.push('MISSING_FISCAL_PROFILE');
  }
  if (!present(input.sale.currencyCode)) blockingCodes.push('MISSING_CURRENCY');
  if (!input.sale.legalEntityId) blockingCodes.push('MISSING_LEGAL_ENTITY');
  if (input.policy.requireConfirmedDelivery && input.delivery?.status !== 'DELIVERED') {
    blockingCodes.push('DELIVERY_PENDING');
  }
  if (blockingCodes.length) return result('PENDING_INFORMATION');

  const deadlineBase = input.policy.deadlineBasis === 'DELIVERED_AT' ? input.delivery?.deliveredAt : input.document.issuedAt;
  const deadline =
    deadlineBase && input.policy.deadlineDays !== null
      ? addCalendarDays(deadlineBase, input.policy.deadlineDays, input.policy.timezone)
      : null;
  if (deadline && calendarKey(input.evaluatedAt, input.policy.timezone) > calendarKey(deadline, input.policy.timezone)) {
    blockingCodes.push('BILLING_DEADLINE_EXPIRED');
  }
  if (activeInvoiced.greaterThan(billable)) blockingCodes.push('OVER_INVOICED');
  if (activeRequested.greaterThan(pendingInvoice)) blockingCodes.push('OVER_REQUESTED');
  if (blockingCodes.length) return result('BLOCKED', deadline);

  if (activeInvoiced.equals(billable)) return result('FULLY_INVOICED', deadline);
  if (activeInvoiced.greaterThan(ZERO)) return result('PARTIALLY_INVOICED', deadline);
  if (activeRequests.some((request) => request.status === 'IN_REVIEW' || request.status === 'APPROVED')) {
    return result('IN_PROCESS', deadline);
  }
  if (activeRequests.length) return result('REQUESTED', deadline);
  return result('BILLABLE', deadline);
}
