import { FiscalProviderError } from './domain/fiscal-provider.port';
import { CreditAdjustmentService } from './credit-adjustment.service';

const prepared = {
  replayed: false,
  creditAdjustmentId: 'adjustment-1',
  invoiceId: 'expense-invoice-1',
  attemptId: 'attempt-1',
  correlationId: 'correlation-1',
  idempotencyKey: 'test-key',
  actorUserId: 'user-1',
  series: 'E',
  folio: '1',
  fiscalStatus: 'STAMPING',
  operationStatus: 'PROCESSING',
  adjustmentStatus: 'ISSUING',
  snapshot: { cfdiType: 'CREDIT_NOTE' },
};

describe('CreditAdjustmentService', () => {
  const repository = {
    create: jest.fn(),
    findOne: jest.fn(),
    approve: jest.fn(),
    prepareIssuance: jest.fn(),
    finalizeStamped: jest.fn(),
    finalizeFailure: jest.fn(),
    markPersistenceUnknown: jest.fn(),
  };
  const provider = {
    providerKey: 'TEST_PAC',
    capabilities: { providerSideIdempotency: false },
    stamp: jest.fn(),
  };
  const artifacts = { persistStampedArtifacts: jest.fn() };
  const catalogs = { get: jest.fn() };
  const service = new CreditAdjustmentService(
    repository as never,
    provider as never,
    catalogs as never,
    artifacts as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findOne.mockResolvedValue({
      sourceType: 'BONUS',
      paymentFormCode: '03',
    });
    catalogs.get.mockResolvedValue({
      configured: true,
      entries: [{ code: 'catalog-code' }],
    });
    catalogs.get.mockImplementation(
      (_key: string, options: { code: string }) => ({
        configured: true,
        entries: [{ code: options.code }],
      }),
    );
  });

  it('revalidates SAT codes immediately before reserving issuance', async () => {
    repository.prepareIssuance.mockResolvedValue({
      ...prepared,
      replayed: true,
    });

    await service.issue(
      'adjustment-1',
      { expectedVersion: 2 },
      { id: 'user-1', role: 'BILLING' } as never,
      'idempotency-1',
    );

    expect(repository.findOne).toHaveBeenCalledWith('adjustment-1');
    expect(catalogs.get).toHaveBeenCalledWith('c_TipoDeComprobante', {
      code: 'E',
    });
    expect(catalogs.get).toHaveBeenCalledWith('c_TipoRelacion', {
      code: '01',
    });
    expect(catalogs.get).toHaveBeenCalledTimes(5);
    expect(repository.prepareIssuance).toHaveBeenCalledTimes(1);
    expect(repository.prepareIssuance).toHaveBeenCalledWith(
      'adjustment-1',
      { expectedVersion: 2 },
      { id: 'user-1', role: 'BILLING' },
      'idempotency-1',
      'TEST_PAC',
    );
  });

  it('stamps an approved credit exactly once and persists artifacts', async () => {
    repository.prepareIssuance.mockResolvedValue(prepared);
    const stamp = {
      outcome: 'STAMPED',
      correlationId: 'correlation-1',
      provider: 'FACTURAMA',
      providerDocumentId: 'provider-1',
      uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
    };
    provider.stamp.mockResolvedValue(stamp);
    repository.finalizeStamped.mockResolvedValue({
      creditAdjustmentId: 'adjustment-1',
      invoiceId: 'expense-invoice-1',
      attemptId: 'attempt-1',
      fiscalStatus: 'STAMPED',
      operationStatus: 'SUCCEEDED',
      adjustmentStatus: 'ISSUED',
      uuid: stamp.uuid,
      replayed: false,
    });

    await expect(
      service.issue(
        'adjustment-1',
        { expectedVersion: 2 },
        { id: 'user-1', role: 'BILLING' } as never,
        'idempotency-1',
      ),
    ).resolves.toMatchObject({ adjustmentStatus: 'ISSUED' });
    expect(provider.stamp).toHaveBeenCalledTimes(1);
    expect(artifacts.persistStampedArtifacts).toHaveBeenCalledWith(
      'expense-invoice-1',
      stamp,
    );
  });

  it('replays without another provider call', async () => {
    repository.prepareIssuance.mockResolvedValue({
      ...prepared,
      replayed: true,
      snapshot: undefined,
      fiscalStatus: 'STAMPED',
      operationStatus: 'SUCCEEDED',
      adjustmentStatus: 'ISSUED',
      uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
    });

    await service.issue(
      'adjustment-1',
      { expectedVersion: 2 },
      { id: 'user-1', role: 'BILLING' } as never,
      'idempotency-1',
    );
    expect(provider.stamp).not.toHaveBeenCalled();
  });

  it('keeps timeout outcome unknown and reserved', async () => {
    repository.prepareIssuance.mockResolvedValue(prepared);
    provider.stamp.mockRejectedValue(
      new FiscalProviderError(
        'FISCAL_PROVIDER_TIMEOUT',
        'STAMP',
        'correlation-1',
        null,
        true,
      ),
    );
    repository.finalizeFailure.mockResolvedValue({
      adjustmentStatus: 'UNKNOWN',
    });

    await expect(
      service.issue(
        'adjustment-1',
        { expectedVersion: 2 },
        { id: 'user-1', role: 'BILLING' } as never,
        'idempotency-1',
      ),
    ).resolves.toMatchObject({ adjustmentStatus: 'UNKNOWN' });
    expect(repository.finalizeFailure).toHaveBeenCalledWith(
      prepared,
      'UNKNOWN',
      expect.objectContaining({ code: 'FISCAL_PROVIDER_TIMEOUT' }),
    );
  });
});
