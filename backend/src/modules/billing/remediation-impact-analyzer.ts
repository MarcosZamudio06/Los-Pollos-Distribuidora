import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type DecimalValue = Prisma.Decimal | number | string;

interface PaymentImpact {
  status: string;
  amount: DecimalValue;
  accountReceivableId?: string | null;
}

interface BillingRequestDocumentImpact {
  reversedAt: Date | null;
  billingRequest: { status: string };
  requestedItems: Array<{ reversedAt: Date | null }>;
}

interface InvoiceDocumentImpact {
  reversedAt: Date | null;
  invoice: { status: string };
  itemApplications: Array<{ reversedAt: Date | null }>;
}

interface SaleDocumentImpact {
  status: string;
  customerSnapshot: Prisma.JsonValue | null;
  productSnapshot: Prisma.JsonValue | null;
  priceSnapshot: Prisma.JsonValue | null;
  billingRequestDocuments: BillingRequestDocumentImpact[];
  invoiceDocuments: InvoiceDocumentImpact[];
}

export interface RemediationSaleImpact {
  status: string;
  paymentType: string;
  payments: PaymentImpact[];
  accountReceivable: null | {
    originalAmount: DecimalValue;
    outstandingAmount: DecimalValue;
    payments: PaymentImpact[];
  };
  pointOfSaleDailyClose: null | { status: string };
  cashShift: null | { status: string };
  route: null | { settlement: null | { status: string } };
  documents: SaleDocumentImpact[];
}

export interface RemediationImpactBlocker {
  code: string;
  message: string;
}

const ACTIVE_REQUEST_STATUSES = new Set(['REQUESTED', 'IN_REVIEW', 'APPROVED']);
const RELATED_INVOICE_STATUSES = new Set([
  'ACTIVE',
  'SUBSTITUTED',
  'CANCELLED',
]);

@Injectable()
export class RemediationImpactAnalyzer {
  analyze(
    sale: RemediationSaleImpact,
    proposedTotal: DecimalValue,
  ): RemediationImpactBlocker[] {
    const blockers: RemediationImpactBlocker[] = [];
    const total = new Prisma.Decimal(proposedTotal);
    const salePayments = this.appliedTotal(sale.payments);
    const directSalePayments = this.appliedTotal(
      sale.payments.filter((payment) => !payment.accountReceivableId),
    );

    if (sale.status === 'CANCELLED') {
      blockers.push({
        code: 'SALE_CANCELLED',
        message: 'La venta cancelada no puede modificarse.',
      });
    }
    if (sale.pointOfSaleDailyClose?.status === 'CLOSED') {
      blockers.push({
        code: 'DAILY_CLOSE_CLOSED',
        message:
          'El corte POS está cerrado y requiere reapertura o ajuste explícito.',
      });
    }
    if (sale.cashShift?.status === 'CLOSED') {
      blockers.push({
        code: 'CASH_SHIFT_CLOSED',
        message:
          'El turno de caja está cerrado y requiere un ajuste explícito.',
      });
    }
    if (sale.route?.settlement?.status === 'CLOSED') {
      blockers.push({
        code: 'ROUTE_SETTLEMENT_CLOSED',
        message:
          'La liquidación de ruta está cerrada y requiere reapertura o ajuste explícito.',
      });
    }

    const paymentsAreIncompatible =
      sale.paymentType === 'CASH_SALE'
        ? !salePayments.equals(total)
        : salePayments.greaterThan(total);
    if (paymentsAreIncompatible) {
      blockers.push({
        code: 'APPLIED_PAYMENT_INCOMPATIBLE',
        message: 'Los pagos aplicados contradicen el total propuesto.',
      });
    }

    if (sale.accountReceivable) {
      const receivablePayments = this.appliedTotal(
        sale.accountReceivable.payments,
      );
      const expectedOriginal = total.minus(directSalePayments);
      const expectedOutstanding = new Prisma.Decimal(
        sale.accountReceivable.originalAmount,
      ).minus(receivablePayments);
      if (
        !new Prisma.Decimal(sale.accountReceivable.originalAmount).equals(
          expectedOriginal,
        ) ||
        !new Prisma.Decimal(sale.accountReceivable.outstandingAmount).equals(
          expectedOutstanding,
        )
      ) {
        blockers.push({
          code: 'ACCOUNT_RECEIVABLE_INCOMPATIBLE',
          message:
            'La cuenta por cobrar contradice el total propuesto o sus pagos aplicados.',
        });
      }
    }

    const requestDocuments = sale.documents.flatMap(
      (document) => document.billingRequestDocuments,
    );
    if (
      requestDocuments.some(
        (document) =>
          document.reversedAt === null &&
          ACTIVE_REQUEST_STATUSES.has(document.billingRequest.status),
      )
    ) {
      blockers.push({
        code: 'ACTIVE_BILLING_REQUEST',
        message: 'Existe una solicitud de facturación activa.',
      });
    }
    if (
      requestDocuments.some(
        (document) =>
          document.reversedAt === null ||
          document.requestedItems.some((item) => item.reversedAt === null),
      )
    ) {
      blockers.push({
        code: 'ACTIVE_BILLING_RESERVATION',
        message: 'Existen importes reservados vigentes por solicitud.',
      });
    }

    const invoiceDocuments = sale.documents.flatMap(
      (document) => document.invoiceDocuments,
    );
    if (invoiceDocuments.some((document) => document.reversedAt === null)) {
      blockers.push({
        code: 'ACTIVE_INVOICE_APPLICATION',
        message: 'Existe una aplicación de factura vigente por documento.',
      });
    }
    if (
      invoiceDocuments.some((document) =>
        document.itemApplications.some((item) => item.reversedAt === null),
      )
    ) {
      blockers.push({
        code: 'ACTIVE_INVOICE_ITEM_APPLICATION',
        message: 'Existe una aplicación de factura vigente por partida.',
      });
    }
    if (
      invoiceDocuments.some((document) =>
        RELATED_INVOICE_STATUSES.has(document.invoice.status),
      )
    ) {
      blockers.push({
        code: 'RELATED_INVOICE_IMMUTABLE',
        message:
          'Existe una factura relacionada que debe conservar su historia.',
      });
    }
    if (
      sale.documents.some(
        (document) =>
          ['ISSUED', 'COLLECTED'].includes(document.status) &&
          (document.customerSnapshot !== null ||
            document.productSnapshot !== null ||
            document.priceSnapshot !== null),
      )
    ) {
      blockers.push({
        code: 'PRINTED_DOCUMENT_IMMUTABLE',
        message:
          'Existe un documento emitido o cobrado con snapshots impresos.',
      });
    }

    return blockers;
  }

  private appliedTotal(payments: PaymentImpact[]): Prisma.Decimal {
    return payments
      .filter((payment) => payment.status === 'APPLIED')
      .reduce(
        (total, payment) => total.plus(payment.amount),
        new Prisma.Decimal(0),
      );
  }
}
