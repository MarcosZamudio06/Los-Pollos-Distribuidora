import { ConflictException } from '@nestjs/common';
import {
  CfdiDocumentType,
  InvoiceFiscalStatus,
  InvoiceOrigin,
  InvoiceStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';

import { RepIssuanceRepository } from './rep-issuance.repository';

describe('RepIssuanceRepository', () => {
  function transactionFixture() {
    const operations: string[] = [];
    const payment = {
      id: 'payment-1',
      accountReceivableId: 'receivable-1',
      saleId: 'sale-1',
      customerId: 'customer-1',
      amount: new Prisma.Decimal('25.00'),
      currencyCode: 'MXN',
      exchangeRateToMxn: new Prisma.Decimal(1),
      fiscalPaymentFormCode: '03',
      paymentMethod: 'TRANSFER',
      status: PaymentStatus.APPLIED,
      paidAt: new Date('2026-08-27T10:00:00.000Z'),
      version: 2,
      paymentReceiptDetails: [],
    };
    const transaction = {
      $queryRaw: jest.fn(() => {
        operations.push(
          operations.includes('payment-lock') ? 'invoice-lock' : 'payment-lock',
        );
        return Promise.resolve([{ id: 'locked-row' }]);
      }),
      invoice: {
        findUnique: jest.fn(() => {
          operations.push('idempotency-read');
          return Promise.resolve(null);
        }),
        create: jest.fn(() =>
          Promise.resolve({ id: 'rep-invoice-1', version: 1 }),
        ),
        update: jest.fn(() => Promise.resolve()),
      },
      payment: {
        findUnique: jest.fn(() => {
          operations.push('payment-read');
          return Promise.resolve(payment);
        }),
        findMany: jest.fn(() => Promise.resolve([])),
        update: jest.fn(),
      },
      invoiceSaleDocument: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 'invoice-sale-document-1',
              totalApplied: new Prisma.Decimal('100.00'),
              saleDocument: { id: 'sale-document-1', saleId: 'sale-1' },
              invoice: {
                id: 'source-invoice-1',
                legalEntityId: 'legal-entity-1',
                fiscalStatus: InvoiceFiscalStatus.STAMPED,
                cancellationStatus: 'NOT_REQUESTED',
                status: InvoiceStatus.ACTIVE,
                uuid: '11111111-1111-4111-8111-111111111111',
                issuedAt: new Date('2026-08-26T10:00:00.000Z'),
                series: 'A',
                folio: '1',
                origin: InvoiceOrigin.NATIVE_CFDI,
                cfdiType: CfdiDocumentType.INCOME,
                paymentMethodCode: 'PPD',
                currencyCode: 'MXN',
                total: new Prisma.Decimal('100.00'),
                issuerSnapshot: {
                  legalEntityId: 'legal-entity-1',
                  legalName: 'REP TEST ENTITY',
                  taxId: 'REP010101AAA',
                  fiscalPostalCode: '06000',
                  fiscalRegime: '601',
                  series: 'A',
                  certificateSerialNumber: '30001000000500003416',
                  certificateFingerprint: 'a'.repeat(64),
                },
                receiverSnapshot: {
                  customerId: 'customer-1',
                  fiscalName: 'PUBLICO EN GENERAL',
                  taxId: 'XAXX010101000',
                  fiscalPostalCode: '06000',
                  fiscalRegime: '616',
                  billingEmail: 'fixture@example.invalid',
                },
                concepts: [{ taxObjectCode: '01', taxesSnapshot: null }],
                paymentInvoiceApplications: [],
              },
            },
          ]),
        ),
      },
      legalEntity: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            isActive: true,
            cfdiEnabled: true,
            certificateSubject: 'REP TEST ENTITY',
            certificateValidFrom: new Date('2026-01-01T00:00:00.000Z'),
            certificateValidTo: new Date('2027-01-01T00:00:00.000Z'),
          }),
        ),
      },
      fiscalCertificate: {
        upsert: jest.fn(() => Promise.resolve({ id: 'certificate-1' })),
      },
      fiscalFolioSequence: {
        upsert: jest.fn(() => Promise.resolve({ nextValue: 2n })),
      },
      invoiceConcept: { create: jest.fn(() => Promise.resolve()) },
      paymentReceipt: { create: jest.fn(() => Promise.resolve()) },
      paymentReceiptDetail: { create: jest.fn(() => Promise.resolve()) },
      paymentInvoiceApplication: {
        createMany: jest.fn(() => Promise.resolve()),
      },
      fiscalOperationAttempt: {
        create: jest.fn(() =>
          Promise.resolve({ id: 'attempt-1', correlationId: 'correlation-1' }),
        ),
      },
      billingAuditLog: { create: jest.fn(() => Promise.resolve()) },
    };
    const prisma = {
      $transaction: jest.fn(
        async (operation: (tx: typeof transaction) => Promise<unknown>) =>
          operation(transaction),
      ),
    };
    const repository = new RepIssuanceRepository(prisma as never);

    return { operations, payment, prisma, repository, transaction };
  }

  it('locks and validates the expected Payment version without mutating it during a successful prepare', async () => {
    const { operations, payment, prisma, repository, transaction } =
      transactionFixture();

    await expect(
      repository.prepare(
        'payment-1',
        { expectedVersion: 2 },
        { id: 'admin-1', role: 'ADMIN' },
        'rep-success',
        'FAKE',
      ),
    ).resolves.toMatchObject({ replayed: false, paymentId: 'payment-1' });

    expect(operations.slice(0, 3)).toEqual([
      'payment-lock',
      'idempotency-read',
      'payment-read',
    ]);
    expect(transaction.payment.update).not.toHaveBeenCalled();
    expect(payment.version).toBe(2);
    expect(transaction.paymentReceipt.create).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('rejects a stale Payment version without mutating it or creating fiscal state', async () => {
    const { operations, payment, prisma, repository, transaction } =
      transactionFixture();

    await expect(
      repository.prepare(
        'payment-1',
        { expectedVersion: 1 },
        { id: 'admin-1', role: 'ADMIN' },
        'rep-stale-version',
        'FAKE',
      ),
    ).rejects.toEqual(expect.any(ConflictException));

    expect(operations).toEqual([
      'payment-lock',
      'idempotency-read',
      'payment-read',
    ]);
    expect(transaction.payment.update).not.toHaveBeenCalled();
    expect(payment.version).toBe(2);
    expect(transaction.invoice.create).not.toHaveBeenCalled();
    expect(transaction.paymentReceipt.create).not.toHaveBeenCalled();
    expect(transaction.paymentReceiptDetail.create).not.toHaveBeenCalled();
    expect(
      transaction.paymentInvoiceApplication.createMany,
    ).not.toHaveBeenCalled();
    expect(transaction.fiscalOperationAttempt.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });
});
