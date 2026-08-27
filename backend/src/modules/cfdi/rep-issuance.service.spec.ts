import { ConflictException } from '@nestjs/common';
import { FiscalProviderError } from './domain/fiscal-provider.port';
import { FakeFiscalProvider } from './testing/fake-fiscal-provider';
import { RepIssuanceService } from './rep-issuance.service';

const prepared = {
  replayed: false,
  paymentId: 'payment-1',
  invoiceId: 'invoice-rep-1',
  paymentReceiptId: 'receipt-1',
  paymentReceiptDetailId: 'detail-1',
  attemptId: 'attempt-1',
  correlationId: 'corr-rep-1',
  idempotencyKey: 'rep-key-1',
  actorUserId: 'admin-1',
  series: 'P',
  folio: '1',
  fiscalStatus: 'STAMPING',
  operationStatus: 'PROCESSING',
  snapshot: {
    cfdiVersion: '4.0' as const,
    cfdiType: 'PAYMENT_RECEIPT' as const,
    paymentId: 'payment-1',
    paymentReceiptId: 'receipt-1',
    issuedAt: '2026-08-23T10:00:00.000Z',
    currencyCode: 'XXX' as const,
    exchangeRate: '1.000000' as const,
    exportCode: '01' as const,
    paymentFormCode: null,
    paymentMethodCode: null,
    sourceDocumentIds: ['sale-document-1'],
    issuer: {
      legalEntityId: 'legal-1',
      legalName: 'EMISOR',
      taxId: 'AAA010101AAA',
      fiscalPostalCode: '64000',
      fiscalRegime: '601',
      series: 'P',
      certificateSerialNumber: 'CERT-1',
      certificateFingerprint: 'f'.repeat(64),
    },
    receiver: {
      customerId: 'customer-1',
      fiscalName: 'CLIENTE',
      taxId: 'BBB010101BBB',
      fiscalPostalCode: '64000',
      fiscalRegime: '601',
      fiscalUseCode: 'CP01' as const,
      billingEmail: 'billing@example.test',
    },
    payment: {
      paidAt: '2026-08-23T10:00:00.000Z',
      paymentFormCode: '03',
      currencyCode: 'MXN',
      exchangeRateToMxn: '1.000000',
      amount: '100.00',
      relatedDocuments: [],
    },
    concepts: [] as const,
    totals: {
      subtotal: '0.00' as const,
      discount: '0.00' as const,
      taxableBase: '0.00' as const,
      tax: '0.00' as const,
      total: '0.00' as const,
    },
    snapshotHash: 'a'.repeat(64),
  },
} as const;

function repository() {
  return {
    prepare: jest.fn().mockResolvedValue(prepared),
    finalizeStamped: jest.fn().mockResolvedValue({
      paymentId: prepared.paymentId,
      invoiceId: prepared.invoiceId,
      paymentReceiptId: prepared.paymentReceiptId,
      paymentReceiptDetailId: prepared.paymentReceiptDetailId,
      attemptId: prepared.attemptId,
      fiscalStatus: 'STAMPED',
      operationStatus: 'SUCCEEDED',
      uuid: '00000000-0000-4000-8000-000000000001',
      replayed: false,
    }),
    finalizeFailure: jest.fn().mockResolvedValue({
      paymentId: prepared.paymentId,
      invoiceId: prepared.invoiceId,
      paymentReceiptId: prepared.paymentReceiptId,
      paymentReceiptDetailId: prepared.paymentReceiptDetailId,
      attemptId: prepared.attemptId,
      fiscalStatus: 'UNKNOWN',
      operationStatus: 'UNKNOWN',
      uuid: null,
      replayed: false,
    }),
    markPersistenceUnknown: jest.fn(),
  };
}

describe('RepIssuanceService', () => {
  it('stamps one Payment Receipt only after durable preparation', async () => {
    const repo = repository();
    const provider = new FakeFiscalProvider();
    const events = { emit: jest.fn() };
    const service = new RepIssuanceService(
      repo as never,
      provider,
      undefined,
      events as never,
    );

    const result = await service.issue(
      'payment-1',
      { expectedVersion: 2 },
      { id: 'admin-1', role: 'ADMIN' },
      'rep-key-1',
    );

    expect(result).toMatchObject({ fiscalStatus: 'STAMPED', replayed: false });
    expect(repo.prepare).toHaveBeenCalledWith(
      'payment-1',
      { expectedVersion: 2 },
      { id: 'admin-1', role: 'ADMIN' },
      'rep-key-1',
      'FAKE',
    );
    expect(provider.calls).toHaveLength(1);
    expect(
      (provider.calls[0].command as { snapshot: typeof prepared.snapshot })
        .snapshot.cfdiType,
    ).toBe('PAYMENT_RECEIPT');
    expect(repo.finalizeStamped).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenNthCalledWith(
      1,
      'cfdi.rep.started',
      expect.objectContaining({ paymentId: 'payment-1' }),
    );
    expect(events.emit).toHaveBeenLastCalledWith(
      'cfdi.rep.completed',
      expect.objectContaining({ state: 'STAMPED' }),
    );
  });

  it('replays the same idempotency key without a second PAC stamp', async () => {
    const repo = repository();
    repo.prepare.mockResolvedValue({
      ...prepared,
      replayed: true,
      fiscalStatus: 'STAMPED',
      operationStatus: 'SUCCEEDED',
      uuid: '00000000-0000-4000-8000-000000000001',
    });
    const provider = new FakeFiscalProvider();
    const service = new RepIssuanceService(repo as never, provider);

    await expect(
      service.issue(
        'payment-1',
        { expectedVersion: 2 },
        { id: 'admin-1', role: 'ADMIN' },
        'rep-key-1',
      ),
    ).resolves.toMatchObject({ replayed: true, fiscalStatus: 'STAMPED' });
    expect(provider.calls).toHaveLength(0);
  });

  it('keeps a PAC timeout UNKNOWN and reconciliable instead of retrying', async () => {
    const repo = repository();
    const provider = new FakeFiscalProvider({
      stamp: () => {
        throw new FiscalProviderError(
          'FISCAL_PROVIDER_TIMEOUT',
          'STAMP',
          prepared.correlationId,
          null,
          true,
        );
      },
    });
    const service = new RepIssuanceService(repo as never, provider);

    await expect(
      service.issue(
        'payment-1',
        { expectedVersion: 2 },
        { id: 'admin-1', role: 'BILLING' },
        'rep-key-1',
      ),
    ).resolves.toMatchObject({ fiscalStatus: 'UNKNOWN' });
    expect(repo.finalizeFailure).toHaveBeenCalledWith(
      prepared,
      'UNKNOWN',
      expect.objectContaining({ code: 'FISCAL_PROVIDER_TIMEOUT' }),
    );
    expect(provider.calls).toHaveLength(1);
  });

  it('allows at most one effective provider call for concurrent idempotency keys', async () => {
    const repo = repository();
    let firstReservation = true;
    repo.prepare.mockImplementation(() => {
      if (firstReservation) {
        firstReservation = false;
        return prepared;
      }
      throw new ConflictException('REP_CONCURRENCY_CONFLICT');
    });
    const provider = new FakeFiscalProvider();
    const service = new RepIssuanceService(repo as never, provider);

    const results = await Promise.allSettled([
      service.issue(
        'payment-1',
        { expectedVersion: 2 },
        { id: 'admin-1', role: 'ADMIN' },
        'rep-key-a',
      ),
      service.issue(
        'payment-1',
        { expectedVersion: 2 },
        { id: 'admin-1', role: 'ADMIN' },
        'rep-key-b',
      ),
    ]);

    expect(provider.calls).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
  });
});
