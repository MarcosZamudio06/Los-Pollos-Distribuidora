import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type DecimalValue = Prisma.Decimal | number | string;
type Payment = {
  status: string;
  amount: DecimalValue;
  accountReceivableId?: string | null;
};
type SaleItem = {
  id: string;
  subtotal: DecimalValue;
  discount: DecimalValue;
  taxableBase: DecimalValue;
  tax: DecimalValue;
  total: DecimalValue;
};

interface RequestDocument {
  reversedAt: Date | null;
  requestedSubtotal: DecimalValue;
  requestedTax: DecimalValue;
  requestedTotal: DecimalValue;
  billingRequest: { status: string };
  requestedItems: Array<{
    saleItemId: string;
    reversedAt: Date | null;
    requestedSubtotal: DecimalValue;
    requestedTax: DecimalValue;
    requestedTotal: DecimalValue;
  }>;
}

interface InvoiceDocument {
  reversedAt: Date | null;
  subtotalApplied: DecimalValue;
  taxApplied: DecimalValue;
  totalApplied: DecimalValue;
  invoice: { status: string };
  itemApplications: Array<{
    saleItemId: string;
    reversedAt: Date | null;
    subtotalApplied: DecimalValue;
    taxApplied: DecimalValue;
    totalApplied: DecimalValue;
  }>;
}

export interface SaleConsistencyInput {
  subtotal: DecimalValue;
  discount: DecimalValue;
  discountPercentage: DecimalValue;
  tax: DecimalValue;
  total: DecimalValue;
  discountAuthorizationId: string | null;
  discountAuthorization: null | { maximumPercentage: DecimalValue };
  paymentType: string;
  items: SaleItem[];
  payments: Payment[];
  accountReceivable: null | {
    originalAmount: DecimalValue;
    outstandingAmount: DecimalValue;
    payments: Payment[];
  };
  documents: Array<{
    billingRequestDocuments: RequestDocument[];
    invoiceDocuments: InvoiceDocument[];
  }>;
}

export interface SaleConsistencyFinding {
  code: string;
  message: string;
}

const ACTIVE_REQUEST_STATUSES = new Set(['REQUESTED', 'IN_REVIEW', 'APPROVED']);

@Injectable()
export class SaleConsistencyValidator {
  validate(sale: SaleConsistencyInput): SaleConsistencyFinding[] {
    const findings = new Map<string, SaleConsistencyFinding>();
    const add = (code: string, message: string) =>
      findings.set(code, { code, message });
    const subtotal = this.decimal(sale.subtotal);
    const discount = this.decimal(sale.discount);
    const tax = this.decimal(sale.tax);
    const total = this.decimal(sale.total);

    if (
      subtotal.isNegative() ||
      discount.isNegative() ||
      tax.isNegative() ||
      total.lte(0) ||
      !subtotal.minus(discount).plus(tax).equals(total)
    ) {
      add(
        'INVALID_SALE_EQUATION',
        'La ecuación monetaria de la cabecera es inválida.',
      );
    }

    if (!sale.items.length)
      add('ITEM_TOTALS_MISMATCH', 'La venta no tiene partidas para conciliar.');
    const sums = sale.items.reduce((acc, item) => {
      const itemSubtotal = this.decimal(item.subtotal);
      const itemDiscount = this.decimal(item.discount);
      const itemBase = this.decimal(item.taxableBase);
      const itemTax = this.decimal(item.tax);
      const itemTotal = this.decimal(item.total);
      if (
        [itemSubtotal, itemDiscount, itemBase, itemTax, itemTotal].some(
          (value) => value.isNegative(),
        ) ||
        !itemSubtotal.minus(itemDiscount).equals(itemBase) ||
        !itemBase.plus(itemTax).equals(itemTotal)
      ) {
        add(
          'INVALID_ITEM_EQUATION',
          'Al menos una partida incumple su ecuación monetaria o contiene importes negativos.',
        );
      }
      return {
        subtotal: acc.subtotal.plus(itemSubtotal),
        discount: acc.discount.plus(itemDiscount),
        taxableBase: acc.taxableBase.plus(itemBase),
        tax: acc.tax.plus(itemTax),
        total: acc.total.plus(itemTotal),
      };
    }, this.zeroAmounts());

    if (
      !sums.subtotal.equals(subtotal) ||
      !sums.discount.equals(discount) ||
      !sums.total.equals(total)
    ) {
      add(
        'ITEM_TOTALS_MISMATCH',
        'Las sumas de partidas no coinciden con la cabecera de la venta.',
      );
    }
    if (!sums.taxableBase.equals(subtotal.minus(discount))) {
      add(
        'TAXABLE_BASE_MISMATCH',
        'La base gravable de las partidas no coincide con la cabecera.',
      );
    }
    if (!sums.tax.equals(tax))
      add(
        'TAX_AMOUNTS_MISMATCH',
        'Los impuestos de las partidas no coinciden con la cabecera.',
      );

    const discountPercentage = this.decimal(sale.discountPercentage);
    const authorizedPercentage = sale.discountAuthorization
      ? this.decimal(sale.discountAuthorization.maximumPercentage)
      : null;
    const expectedDiscount = subtotal
      .times(discountPercentage)
      .dividedBy(100)
      .toDecimalPlaces(2);
    if (
      (discount.gt(0) || discountPercentage.gt(0)) &&
      (!sale.discountAuthorizationId ||
        !authorizedPercentage ||
        discountPercentage.gt(authorizedPercentage) ||
        !discount.equals(expectedDiscount))
    ) {
      add(
        'UNAUTHORIZED_DISCOUNT',
        'El descuento no coincide con una autorización vigente y su porcentaje permitido.',
      );
    }

    const allSalePayments = this.appliedTotal(sale.payments);
    const directPayments = this.appliedTotal(
      sale.payments.filter((payment) => !payment.accountReceivableId),
    );
    if (
      (sale.paymentType === 'CASH_SALE' && !allSalePayments.equals(total)) ||
      (sale.paymentType === 'CREDIT_SALE' && allSalePayments.gt(total))
    ) {
      add(
        'APPLIED_PAYMENTS_MISMATCH',
        'Los pagos aplicados no son compatibles con el total de la venta.',
      );
    }
    const expectedReceivable = total.minus(directPayments);
    if (sale.accountReceivable) {
      const receivablePayments = this.appliedTotal(
        sale.accountReceivable.payments,
      );
      const original = this.decimal(sale.accountReceivable.originalAmount);
      const outstanding = this.decimal(
        sale.accountReceivable.outstandingAmount,
      );
      if (
        !original.equals(expectedReceivable) ||
        !outstanding.equals(original.minus(receivablePayments)) ||
        outstanding.isNegative()
      ) {
        add(
          'RECEIVABLE_BALANCE_MISMATCH',
          'La cuenta por cobrar no coincide con la venta y sus pagos aplicados.',
        );
      }
    } else if (sale.paymentType === 'CREDIT_SALE' && expectedReceivable.gt(0)) {
      add(
        'RECEIVABLE_BALANCE_MISMATCH',
        'La venta a crédito tiene saldo pendiente sin cuenta por cobrar.',
      );
    }

    if (!this.requestedAmountsAreConsistent(sale)) {
      add(
        'REQUESTED_AMOUNTS_MISMATCH',
        'Los importes solicitados por documento o partida contradicen la venta.',
      );
    }
    if (!this.invoicedAmountsAreConsistent(sale)) {
      add(
        'INVOICED_AMOUNTS_MISMATCH',
        'Los importes facturados por documento o partida contradicen la venta.',
      );
    }
    return [...findings.values()];
  }

  private requestedAmountsAreConsistent(sale: SaleConsistencyInput): boolean {
    const documents = sale.documents
      .flatMap((document) => document.billingRequestDocuments)
      .filter(
        (document) =>
          document.reversedAt === null &&
          ACTIVE_REQUEST_STATUSES.has(document.billingRequest.status),
      );
    const aggregate = this.zeroApplicationAmounts();
    for (const document of documents) {
      const items = document.requestedItems.filter(
        (item) => item.reversedAt === null,
      );
      const sums = items.reduce(
        (acc, item) =>
          this.addApplication(
            acc,
            item.requestedSubtotal,
            item.requestedTax,
            item.requestedTotal,
          ),
        this.zeroApplicationAmounts(),
      );
      if (
        !this.applicationEquals(
          sums,
          document.requestedSubtotal,
          document.requestedTax,
          document.requestedTotal,
        ) ||
        items.some(
          (item) =>
            !this.applicationFitsItem(
              sale.items,
              item.saleItemId,
              item.requestedSubtotal,
              item.requestedTax,
              item.requestedTotal,
            ),
        )
      )
        return false;
      this.addApplicationInPlace(
        aggregate,
        document.requestedSubtotal,
        document.requestedTax,
        document.requestedTotal,
      );
    }
    return this.applicationFitsSale(sale, aggregate);
  }

  private invoicedAmountsAreConsistent(sale: SaleConsistencyInput): boolean {
    const documents = sale.documents
      .flatMap((document) => document.invoiceDocuments)
      .filter(
        (document) =>
          document.reversedAt === null && document.invoice.status === 'ACTIVE',
      );
    const aggregate = this.zeroApplicationAmounts();
    for (const document of documents) {
      const items = document.itemApplications.filter(
        (item) => item.reversedAt === null,
      );
      const sums = items.reduce(
        (acc, item) =>
          this.addApplication(
            acc,
            item.subtotalApplied,
            item.taxApplied,
            item.totalApplied,
          ),
        this.zeroApplicationAmounts(),
      );
      if (
        !this.applicationEquals(
          sums,
          document.subtotalApplied,
          document.taxApplied,
          document.totalApplied,
        ) ||
        items.some(
          (item) =>
            !this.applicationFitsItem(
              sale.items,
              item.saleItemId,
              item.subtotalApplied,
              item.taxApplied,
              item.totalApplied,
            ),
        )
      )
        return false;
      this.addApplicationInPlace(
        aggregate,
        document.subtotalApplied,
        document.taxApplied,
        document.totalApplied,
      );
    }
    return this.applicationFitsSale(sale, aggregate);
  }

  private applicationFitsItem(
    items: SaleItem[],
    itemId: string,
    subtotal: DecimalValue,
    tax: DecimalValue,
    total: DecimalValue,
  ): boolean {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) return false;
    const appliedSubtotal = this.decimal(subtotal);
    const appliedTax = this.decimal(tax);
    const appliedTotal = this.decimal(total);
    return (
      !appliedSubtotal.isNegative() &&
      !appliedTax.isNegative() &&
      appliedSubtotal.plus(appliedTax).equals(appliedTotal) &&
      appliedSubtotal.lte(this.decimal(item.taxableBase)) &&
      appliedTax.lte(this.decimal(item.tax)) &&
      appliedTotal.lte(this.decimal(item.total))
    );
  }

  private applicationFitsSale(
    sale: SaleConsistencyInput,
    amounts: ReturnType<SaleConsistencyValidator['zeroApplicationAmounts']>,
  ): boolean {
    return (
      amounts.subtotal.lte(this.decimal(sale.subtotal).minus(sale.discount)) &&
      amounts.tax.lte(this.decimal(sale.tax)) &&
      amounts.total.lte(this.decimal(sale.total))
    );
  }

  private applicationEquals(
    amounts: ReturnType<SaleConsistencyValidator['zeroApplicationAmounts']>,
    subtotal: DecimalValue,
    tax: DecimalValue,
    total: DecimalValue,
  ): boolean {
    return (
      amounts.subtotal.equals(subtotal) &&
      amounts.tax.equals(tax) &&
      amounts.total.equals(total) &&
      this.decimal(subtotal).plus(tax).equals(total)
    );
  }

  private addApplication(
    amounts: ReturnType<SaleConsistencyValidator['zeroApplicationAmounts']>,
    subtotal: DecimalValue,
    tax: DecimalValue,
    total: DecimalValue,
  ) {
    return {
      subtotal: amounts.subtotal.plus(subtotal),
      tax: amounts.tax.plus(tax),
      total: amounts.total.plus(total),
    };
  }

  private addApplicationInPlace(
    amounts: ReturnType<SaleConsistencyValidator['zeroApplicationAmounts']>,
    subtotal: DecimalValue,
    tax: DecimalValue,
    total: DecimalValue,
  ): void {
    amounts.subtotal = amounts.subtotal.plus(subtotal);
    amounts.tax = amounts.tax.plus(tax);
    amounts.total = amounts.total.plus(total);
  }

  private appliedTotal(payments: Payment[]): Prisma.Decimal {
    return payments
      .filter((payment) => payment.status === 'APPLIED')
      .reduce(
        (sum, payment) => sum.plus(payment.amount),
        new Prisma.Decimal(0),
      );
  }

  private decimal(value: DecimalValue): Prisma.Decimal {
    return new Prisma.Decimal(value).toDecimalPlaces(2);
  }
  private zeroApplicationAmounts() {
    return {
      subtotal: new Prisma.Decimal(0),
      tax: new Prisma.Decimal(0),
      total: new Prisma.Decimal(0),
    };
  }
  private zeroAmounts() {
    return {
      ...this.zeroApplicationAmounts(),
      discount: new Prisma.Decimal(0),
      taxableBase: new Prisma.Decimal(0),
    };
  }
}
