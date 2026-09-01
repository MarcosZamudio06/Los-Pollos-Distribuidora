import { FiscalProviderError } from './domain/fiscal-provider.port';
import { CfdiDomainError } from './domain/cfdi-domain.error';
import { FakeFiscalProvider } from './testing/fake-fiscal-provider';
import { CfdiIssuanceService } from './cfdi-issuance.service';

const dto = {
  expectedVersion: 3,
  cfdiUse: 'G03',
  paymentMethod: 'PUE',
  paymentForm: '01',
  exportCode: '01',
};

const snapshot = {
  cfdiVersion: '4.0',
  cfdiType: 'INCOME',
  billingRequestId: 'request-1',
  billingRequestVersion: 3,
  issuedAt: '2026-08-23T18:00:00.000Z',
  currencyCode: 'MXN',
  exchangeRate: '1.000000',
  exportCode: '01',
  paymentFormCode: '01',
  paymentMethodCode: 'PUE',
  sourceDocumentIds: ['document-1'],
  issuer: {
    legalEntityId: 'issuer-1',
    legalName: 'Issuer SA de CV',
    taxId: 'ISS010101AB1',
    fiscalPostalCode: '64000',
    fiscalRegime: '601',
    series: 'A',
    certificateSerialNumber: '30001000000500003416',
    certificateFingerprint: 'a'.repeat(64),
  },
  receiver: {
    customerId: 'customer-1',
    fiscalName: 'Receiver SA de CV',
    taxId: 'REC010101AB1',
    fiscalPostalCode: '64000',
    fiscalRegime: '601',
    fiscalUseCode: 'G03',
    billingEmail: 'billing@example.test',
  },
  concepts: [],
  totals: {
    subtotal: '100.00',
    discount: '0.00',
    taxableBase: '100.00',
    tax: '16.00',
    total: '116.00',
  },
  snapshotHash: 'a'.repeat(64),
} as const;

const prepared = {
  replayed: false,
  billingRequestId: 'request-1',
  invoiceId: 'invoice-1',
  attemptId: 'attempt-1',
  correlationId: 'correlation-1',
  idempotencyKey: 'stamp-1',
  actorUserId: 'admin-1',
  series: 'A',
  folio: '1',
  version: 1,
  fiscalStatus: 'STAMPING',
  operationStatus: 'PROCESSING',
  snapshot,
} as const;

function repository() {
  return {
    prepare: jest.fn().mockResolvedValue(prepared),
    finalizeStamped: jest.fn().mockImplementation((_prepared, response) =>
      Promise.resolve({
        invoiceId: prepared.invoiceId,
        attemptId: prepared.attemptId,
        billingRequestId: prepared.billingRequestId,
        fiscalStatus: 'STAMPED',
        operationStatus: 'SUCCEEDED',
        uuid: response.uuid,
        replayed: false,
      }),
    ),
    finalizeFailure: jest.fn().mockImplementation((_prepared, outcome) =>
      Promise.resolve({
        invoiceId: prepared.invoiceId,
        attemptId: prepared.attemptId,
        billingRequestId: prepared.billingRequestId,
        fiscalStatus: outcome === 'UNKNOWN' ? 'UNKNOWN' : 'FAILED',
        operationStatus: outcome === 'UNKNOWN' ? 'UNKNOWN' : 'TERMINAL_FAILURE',
        uuid: null,
        replayed: false,
      }),
    ),
    markPersistenceUnknown: jest.fn().mockResolvedValue({
      invoiceId: prepared.invoiceId,
      attemptId: prepared.attemptId,
      billingRequestId: prepared.billingRequestId,
      fiscalStatus: 'UNKNOWN',
      operationStatus: 'UNKNOWN',
      uuid: null,
      replayed: false,
    }),
  };
}

describe('CfdiIssuanceService', () => {
  it('does not call the provider when receiver fiscal compatibility fails during preparation', async () => {
    const repo = repository();
    repo.prepare.mockRejectedValue(
      new CfdiDomainError('CFDI_USE_REGIME_INCOMPATIBLE', {
        cfdiUse: 'D01',
        fiscalRegime: '601',
        receiverPersonType: 'moral',
      }),
    );
    const provider = new FakeFiscalProvider();
    const service = new CfdiIssuanceService(repo as never, provider);

    await expect(
      service.issue(
        'request-1',
        { ...dto, cfdiUse: 'D01' },
        { id: 'admin-1', role: 'ADMIN' },
        'stamp-incompatible-1',
      ),
    ).rejects.toMatchObject({ code: 'CFDI_USE_REGIME_INCOMPATIBLE' });
    expect(provider.calls).toHaveLength(0);
    expect(repo.finalizeStamped).not.toHaveBeenCalled();
    expect(repo.finalizeFailure).not.toHaveBeenCalled();
  });

  it('calls the provider only after durable preparation and atomically finalizes success', async () => {
    const calls: string[] = [];
    const repo = repository();
    repo.prepare.mockImplementation(() => {
      calls.push('prepare-committed');
      return Promise.resolve(prepared);
    });
    repo.finalizeStamped.mockImplementation((_prepared, response) => {
      calls.push('finalize');
      return Promise.resolve({
        invoiceId: prepared.invoiceId,
        attemptId: prepared.attemptId,
        billingRequestId: prepared.billingRequestId,
        fiscalStatus: 'STAMPED',
        operationStatus: 'SUCCEEDED',
        uuid: response.uuid,
        replayed: false,
      });
    });
    const provider = new FakeFiscalProvider({
      stamp: async (command) => {
        calls.push('provider');
        return new FakeFiscalProvider().stamp(command);
      },
    });
    const events = { emit: jest.fn() };
    const service = new CfdiIssuanceService(
      repo as never,
      provider,
      undefined,
      events as never,
    );

    const result = await service.issue(
      'request-1',
      dto,
      { id: 'admin-1', role: 'ADMIN' },
      'stamp-1',
    );

    expect(calls).toEqual(['prepare-committed', 'provider', 'finalize']);
    expect(repo.prepare).toHaveBeenCalledWith(
      'request-1',
      dto,
      { id: 'admin-1', role: 'ADMIN' },
      'stamp-1',
      'FAKE',
    );
    expect(result).toMatchObject({ fiscalStatus: 'STAMPED', replayed: false });
    expect(repo.finalizeStamped).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenNthCalledWith(
      1,
      'cfdi.stamp.started',
      expect.objectContaining({ invoiceId: 'invoice-1' }),
    );
    expect(events.emit).toHaveBeenLastCalledWith(
      'cfdi.stamp.completed',
      expect.objectContaining({ state: 'STAMPED' }),
    );
  });

  it('replays the persisted operation without calling the provider again', async () => {
    const repo = repository();
    repo.prepare.mockResolvedValue({
      ...prepared,
      replayed: true,
      fiscalStatus: 'UNKNOWN',
      operationStatus: 'UNKNOWN',
      uuid: null,
    });
    const provider = new FakeFiscalProvider();
    const service = new CfdiIssuanceService(repo as never, provider);

    const result = await service.issue(
      'request-1',
      dto,
      { id: 'admin-1', role: 'ADMIN' },
      'stamp-1',
    );

    expect(result).toMatchObject({ replayed: true, fiscalStatus: 'UNKNOWN' });
    expect(provider.calls).toHaveLength(0);
  });

  it.each([
    ['FISCAL_PROVIDER_VALIDATION', 400],
    ['FISCAL_PROVIDER_AUTHENTICATION', 401],
  ] as const)(
    'persists definitive PAC %s as terminal failure',
    async (code, status) => {
      const repo = repository();
      const provider = new FakeFiscalProvider({
        stamp: () => {
          throw new FiscalProviderError(
            code,
            'STAMP',
            prepared.correlationId,
            status,
            false,
          );
        },
      });
      const service = new CfdiIssuanceService(repo as never, provider);

      const result = await service.issue(
        'request-1',
        dto,
        { id: 'billing-1', role: 'BILLING' },
        'stamp-1',
      );

      expect(repo.finalizeFailure).toHaveBeenCalledWith(
        prepared,
        'TERMINAL_FAILURE',
        expect.objectContaining({ code, statusCode: status }),
      );
      expect(result).toMatchObject({ fiscalStatus: 'FAILED' });
      expect(provider.calls).toHaveLength(1);
    },
  );

  it.each(['before-response', 'after-provider-acceptance'] as const)(
    'treats timeout %s as UNKNOWN because dispatch certainty is unavailable',
    async (phase) => {
      const repo = repository();
      let accepted = false;
      const provider = new FakeFiscalProvider({
        stamp: () => {
          if (phase === 'after-provider-acceptance') accepted = true;
          throw new FiscalProviderError(
            'FISCAL_PROVIDER_TIMEOUT',
            'STAMP',
            prepared.correlationId,
            null,
            true,
          );
        },
      });
      const service = new CfdiIssuanceService(repo as never, provider);

      await expect(
        service.issue(
          'request-1',
          dto,
          { id: 'admin-1', role: 'ADMIN' },
          'stamp-1',
        ),
      ).resolves.toMatchObject({ fiscalStatus: 'UNKNOWN' });
      expect(repo.finalizeFailure).toHaveBeenCalledWith(
        prepared,
        'UNKNOWN',
        expect.any(Object),
      );
      expect(provider.calls).toHaveLength(1);
      expect(accepted).toBe(phase === 'after-provider-acceptance');
    },
  );

  it.each([
    ['FISCAL_PROVIDER_TIMEOUT', null],
    ['FISCAL_PROVIDER_UNAVAILABLE', 503],
    ['FISCAL_PROVIDER_RESPONSE_INVALID', 200],
  ] as const)(
    'keeps ambiguous PAC %s reconcilable without retrying',
    async (code, status) => {
      const repo = repository();
      const provider = new FakeFiscalProvider({
        stamp: () => {
          throw new FiscalProviderError(
            code,
            'STAMP',
            prepared.correlationId,
            status,
            true,
          );
        },
      });
      const service = new CfdiIssuanceService(repo as never, provider);

      const result = await service.issue(
        'request-1',
        dto,
        { id: 'admin-1', role: 'ADMIN' },
        'stamp-1',
      );

      expect(repo.finalizeFailure).toHaveBeenCalledWith(
        prepared,
        'UNKNOWN',
        expect.objectContaining({ code }),
      );
      expect(result).toMatchObject({ fiscalStatus: 'UNKNOWN' });
      expect(provider.calls).toHaveLength(1);
    },
  );

  it('never repeats a successful PAC call when the final DB transaction rolls back', async () => {
    const repo = repository();
    repo.finalizeStamped.mockRejectedValueOnce(new Error('database rollback'));
    const provider = new FakeFiscalProvider();
    const service = new CfdiIssuanceService(repo as never, provider);

    const result = await service.issue(
      'request-1',
      dto,
      { id: 'admin-1', role: 'ADMIN' },
      'stamp-1',
    );

    expect(provider.calls).toHaveLength(1);
    expect(repo.finalizeStamped).toHaveBeenCalledTimes(1);
    expect(repo.markPersistenceUnknown).toHaveBeenCalledWith(
      prepared,
      'STAMP_RESULT_PERSISTENCE_FAILED',
    );
    expect(result).toMatchObject({ fiscalStatus: 'UNKNOWN' });
  });

  it('does not downgrade a stamped invoice when post-stamp artifact storage fails', async () => {
    const repo = repository();
    const artifacts = {
      persistStampedArtifacts: jest
        .fn()
        .mockRejectedValue(new Error('object storage unavailable')),
    };
    const provider = new FakeFiscalProvider();
    const service = new CfdiIssuanceService(
      repo as never,
      provider,
      artifacts as never,
    );

    const result = await service.issue(
      'request-1',
      dto,
      { id: 'admin-1', role: 'ADMIN' },
      'stamp-1',
    );

    expect(result).toMatchObject({ fiscalStatus: 'STAMPED' });
    expect(repo.markPersistenceUnknown).not.toHaveBeenCalled();
  });
});
