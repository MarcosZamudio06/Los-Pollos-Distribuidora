import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  FiscalOperationStatus,
  FiscalOperationType,
  InvoiceStatus,
} from '@prisma/client';
import { InvoiceCancellationService } from './invoice-cancellation.service';
import type { FiscalCancellationResponse } from '../cfdi/domain/fiscal-provider.port';
import type { CancelInvoiceDto } from './dto/cancel-invoice.dto';

const actor = { id: 'billing-1', role: 'BILLING' as const };
const originalUuid = '215CEC43-7E57-44AC-9D63-B54BBC4745BD';
const replacementUuid = '315CEC43-7E57-44AC-9D63-B54BBC4745BD';

type InvoiceState = Record<string, unknown> & {
  id: string;
  legalEntityId: string;
  status: string;
  fiscalStatus: string;
  cancellationStatus: string;
  uuid: string;
  version: number;
  documents: Array<{
    id: string;
    reversedAt: Date | null;
    itemApplications: Array<{ id: string; reversedAt: Date | null }>;
  }>;
};

function cancellationDto(
  overrides: Partial<CancelInvoiceDto> = {},
): CancelInvoiceDto {
  return {
    expectedVersion: 3,
    cancellationMotiveCode: '02',
    internalReason: 'Customer correction',
    ...overrides,
  };
}

function harness(options: { provider?: Record<string, jest.Mock> } = {}) {
  let invoiceState: InvoiceState = {
    id: 'invoice-1',
    legalEntityId: 'legal-entity-1',
    status: InvoiceStatus.ACTIVE,
    fiscalStatus: 'STAMPED',
    cancellationStatus: 'NOT_REQUESTED',
    uuid: originalUuid,
    version: 3,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    internalReason: null,
    cancellationMotiveCode: null,
    cancellationIdempotencyKey: null,
    cancellationPayloadHash: null,
    replacementInvoiceId: null,
    replacementUuid: null,
    substitutedByInvoiceId: null,
    substitutes: null,
    documents: [
      {
        id: 'application-1',
        reversedAt: null,
        itemApplications: [{ id: 'item-application-1', reversedAt: null }],
      },
    ],
    paymentReceipt: {
      id: 'payment-receipt-1',
      details: [
        {
          id: 'payment-detail-1',
          applications: [{ id: 'payment-application-1', status: 'EFFECTIVE' }],
        },
      ],
    },
  };
  const stampAttempt = {
    id: 'stamp-attempt-1',
    providerReference: 'facturama-document-1',
    providerKey: 'FACTURAMA',
    status: 'SUCCEEDED',
    attemptNumber: 1,
  };
  const replacement = {
    id: 'replacement-1',
    legalEntityId: 'legal-entity-1',
    status: InvoiceStatus.ACTIVE,
    fiscalStatus: 'STAMPED',
    uuid: replacementUuid,
    stampedAt: new Date('2026-08-23T12:00:00.000Z'),
    issuedAt: new Date('2026-08-23T11:59:00.000Z'),
  };
  const cancelAttempt = {
    id: 'cancel-attempt-1',
    correlationId: 'cancel-correlation-1',
    attemptNumber: 1,
    providerReference: 'facturama-document-1',
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    invoice: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest
        .fn()
        .mockImplementation((args: { where?: { id?: string } }) => {
          const { where } = args;
          if (where?.id === 'replacement-1') return replacement;
          return invoiceState;
        }),
      update: jest.fn().mockImplementation(
        (args: {
          data: Record<string, unknown> & {
            version?: { increment?: number };
          };
        }) => {
          const { data } = args;
          invoiceState = {
            ...invoiceState,
            ...data,
            version:
              data.version?.increment !== undefined
                ? invoiceState.version + data.version.increment
                : invoiceState.version,
          } as InvoiceState;
          return invoiceState;
        },
      ),
    },
    fiscalOperationAttempt: {
      findFirst: jest.fn().mockResolvedValue(stampAttempt),
      create: jest.fn().mockResolvedValue(cancelAttempt),
      update: jest.fn().mockResolvedValue(cancelAttempt),
    },
    invoiceSaleDocument: { updateMany: jest.fn() },
    invoiceSaleItemApplication: { updateMany: jest.fn() },
    paymentInvoiceApplication: { updateMany: jest.fn() },
    billingAuditLog: { create: jest.fn() },
    billingDataRemediation: { upsert: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
    invoice: { findFirst: jest.fn() },
  };
  const provider = {
    providerKey: 'FACTURAMA',
    capabilities: { providerSideIdempotency: false },
    cancel: jest.fn().mockResolvedValue({
      correlationId: 'cancel-correlation-1',
      provider: 'FACTURAMA',
      providerDocumentId: 'facturama-document-1',
      status: 'CANCELLED',
      uuid: originalUuid,
      requestedAt: '2026-08-23T12:01:00.000Z',
      cancelledAt: '2026-08-23T12:01:01.000Z',
    }),
    ...options.provider,
  };
  const events = { emit: jest.fn() };
  const service = new InvoiceCancellationService(
    prisma as never,
    provider as never,
    undefined,
    undefined,
    events as never,
  );
  return {
    service,
    tx,
    prisma,
    provider,
    events,
    getInvoice: () => invoiceState,
  };
}

function reconciliationHarness(
  providerResponse: FiscalCancellationResponse | Error = {
    correlationId: 'cancel-correlation-1',
    provider: 'FACTURAMA',
    providerDocumentId: 'facturama-document-1',
    status: 'CANCELLED',
    uuid: originalUuid,
    requestedAt: '2026-08-23T12:01:00.000Z',
    cancelledAt: '2026-08-23T12:01:01.000Z',
  },
) {
  const invoice = {
    id: 'invoice-1',
    legalEntityId: 'legal-entity-1',
    status: InvoiceStatus.ACTIVE,
    fiscalStatus: 'STAMPED',
    cancellationStatus: 'PENDING',
    uuid: originalUuid,
    version: 4,
    createdByUserId: 'billing-1',
    cancellationMotiveCode: '02',
    internalReason: 'Customer correction',
    cancellationReason: 'Customer correction',
    cancellationIdempotencyKey: 'cancel-key-1',
    cancellationPayloadHash: 'b'.repeat(64),
    replacementInvoiceId: null,
    replacementUuid: null,
    cancelledAt: null,
    cancelledByUserId: null,
    documents: [
      {
        id: 'application-1',
        reversedAt: null,
        itemApplications: [{ id: 'item-1', reversedAt: null }],
      },
    ],
    substitutes: null,
    replacementInvoice: null,
  };
  const cancelAttempt = {
    id: 'cancel-attempt-1',
    operation: FiscalOperationType.CANCEL,
    providerReference: 'facturama-document-1',
    correlationId: 'cancel-correlation-1',
    idempotencyKey: 'cancel:cancel-key-1',
    requestHash: 'b'.repeat(64),
    providerKey: 'FACTURAMA',
  };
  const statusAttempt = {
    id: 'status-attempt-1',
    attemptNumber: 1,
    status: FiscalOperationStatus.PROCESSING,
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    invoice: {
      findUnique: jest.fn().mockResolvedValue(invoice),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
          ...invoice,
          ...data,
          version: invoice.version + 1,
        })),
    },
    fiscalOperationAttempt: {
      update: jest.fn().mockResolvedValue(cancelAttempt),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    invoiceSaleDocument: { updateMany: jest.fn() },
    invoiceSaleItemApplication: { updateMany: jest.fn() },
    billingAuditLog: { create: jest.fn() },
  };
  const prisma = {
    invoice: { findUnique: jest.fn().mockResolvedValue(invoice) },
    fiscalOperationAttempt: {
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) =>
          where.id === cancelAttempt.id ? cancelAttempt : statusAttempt,
        ),
      update: jest.fn().mockResolvedValue(cancelAttempt),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const provider = {
    providerKey: 'FACTURAMA',
    capabilities: { providerSideIdempotency: false },
    getCancellationStatus:
      providerResponse instanceof Error
        ? jest.fn().mockRejectedValue(providerResponse)
        : jest.fn().mockResolvedValue(providerResponse),
  };
  const artifacts = {
    persistCancellationAcknowledgment: jest.fn().mockResolvedValue('AVAILABLE'),
  };
  const config = { get: jest.fn().mockReturnValue(3) };
  const service = new InvoiceCancellationService(
    prisma as never,
    provider as never,
    artifacts as never,
    config as never,
  );
  return { service, prisma, tx, provider, artifacts, invoice };
}

describe('InvoiceCancellationService', () => {
  it('reconciles a confirmed cancellation without issuing a second cancel request', async () => {
    const ack = {
      correlationId: 'cancel-correlation-1',
      provider: 'FACTURAMA' as const,
      providerDocumentId: 'facturama-document-1',
      artifactType: 'CANCELLATION_ACK' as const,
      contentType: 'application/xml',
      content: new Uint8Array(Buffer.from('<Acuse />')),
      sha256: 'c'.repeat(64),
    };
    const { service, provider, artifacts, tx, prisma } = reconciliationHarness({
      correlationId: 'cancel-correlation-1',
      provider: 'FACTURAMA',
      providerDocumentId: 'facturama-document-1',
      status: 'CANCELLED',
      uuid: originalUuid,
      requestedAt: null,
      cancelledAt: '2026-08-23T12:01:01.000Z',
      acknowledgment: ack,
    });

    const result = await service.reconcileCancellationStatus(
      'invoice-1',
      'cancel-attempt-1',
      'status-attempt-1',
      new Date('2026-08-23T12:02:00.000Z'),
    );

    expect(provider.getCancellationStatus).toHaveBeenCalledTimes(1);
    expect(provider.getCancellationStatus).toHaveBeenCalledWith(
      expect.objectContaining({ providerKey: 'FACTURAMA' }),
    );
    expect(result).toMatchObject({
      state: 'CANCELLED',
      invoiceId: 'invoice-1',
      acknowledgmentPersisted: true,
    });
    expect(tx.invoiceSaleDocument.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.invoiceSaleItemApplication.updateMany).toHaveBeenCalledTimes(1);
    expect(artifacts.persistCancellationAcknowledgment).toHaveBeenCalledWith(
      'invoice-1',
      expect.objectContaining({ status: 'CANCELLED' }),
    );
    expect(prisma.fiscalOperationAttempt.updateMany).toHaveBeenCalled();
  });

  it('keeps a pending cancellation pending and schedules the next status check', async () => {
    const { service, provider, tx } = reconciliationHarness({
      correlationId: 'cancel-correlation-1',
      provider: 'FACTURAMA',
      providerDocumentId: 'facturama-document-1',
      status: 'PENDING',
      uuid: originalUuid,
      requestedAt: null,
      cancelledAt: null,
    });

    const now = new Date('2026-08-23T12:02:00.000Z');
    const result = await service.reconcileCancellationStatus(
      'invoice-1',
      'cancel-attempt-1',
      'status-attempt-1',
      now,
    );

    expect(result.state).toBe('PENDING');
    expect(result.nextRetryAt).toEqual(new Date('2026-08-23T12:03:00.000Z'));
    expect(tx.invoiceSaleDocument.updateMany).not.toHaveBeenCalled();
    expect(provider.getCancellationStatus).toHaveBeenCalledTimes(1);
  });

  it('retries a transient provider timeout with backoff and never reverses applications', async () => {
    const { service, tx, provider } = reconciliationHarness(
      Object.assign(new Error('timeout'), { code: 'FISCAL_PROVIDER_TIMEOUT' }),
    );
    const now = new Date('2026-08-23T12:02:00.000Z');

    const result = await service.reconcileCancellationStatus(
      'invoice-1',
      'cancel-attempt-1',
      'status-attempt-1',
      now,
    );

    expect(result).toMatchObject({
      state: 'PENDING',
      nextRetryAt: new Date('2026-08-23T12:03:00.000Z'),
    });
    expect(provider.getCancellationStatus).toHaveBeenCalledTimes(1);
    expect(tx.invoiceSaleDocument.updateMany).not.toHaveBeenCalled();
    expect(tx.invoiceSaleItemApplication.updateMany).not.toHaveBeenCalled();
    expect(tx.billingAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CFDI_CANCELLATION_PENDING' }),
      }),
    );
  });

  it('reverses applications only after the provider confirms cancellation', async () => {
    const { service, tx, provider, events, getInvoice } = harness();

    const result = await service.cancel(
      'invoice-1',
      cancellationDto(),
      actor,
      'cancel-key-1',
    );

    expect(provider.cancel).toHaveBeenCalledWith(
      expect.objectContaining({
        providerDocumentId: 'facturama-document-1',
        uuid: originalUuid,
        motive: '02',
      }),
    );
    expect(tx.invoiceSaleItemApplication.updateMany).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      'cfdi.cancel.started',
      expect.objectContaining({ invoiceId: 'invoice-1' }),
    );
    expect(events.emit).toHaveBeenLastCalledWith(
      'cfdi.cancel.completed',
      expect.objectContaining({ state: 'CANCELLED' }),
    );
    expect(tx.invoiceSaleDocument.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.paymentInvoiceApplication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['payment-application-1'] },
        }),
        data: expect.objectContaining({ status: 'REVERSED' }),
      }),
    );
    expect(result).toMatchObject({
      status: InvoiceStatus.CANCELLED,
      cancellationStatus: 'ACCEPTED',
      cancellationMotiveCode: '02',
      internalReason: 'Customer correction',
    });
    expect(getInvoice()).toMatchObject({
      status: InvoiceStatus.CANCELLED,
      cancellationStatus: 'ACCEPTED',
    });
  });

  it('keeps applications and billable balance untouched while cancellation is pending', async () => {
    const { service, tx, provider, getInvoice } = harness({
      provider: {
        cancel: jest.fn().mockResolvedValue({
          correlationId: 'cancel-correlation-1',
          provider: 'FACTURAMA',
          providerDocumentId: 'facturama-document-1',
          status: 'PENDING',
          uuid: originalUuid,
          requestedAt: '2026-08-23T12:01:00.000Z',
          cancelledAt: null,
        }),
      },
    });

    const result = await service.cancel(
      'invoice-1',
      cancellationDto(),
      actor,
      'cancel-key-pending',
    );

    expect(result).toMatchObject({
      status: InvoiceStatus.ACTIVE,
      cancellationStatus: 'PENDING',
    });
    expect(tx.invoiceSaleItemApplication.updateMany).not.toHaveBeenCalled();
    expect(tx.invoiceSaleDocument.updateMany).not.toHaveBeenCalled();
    expect(tx.paymentInvoiceApplication.updateMany).not.toHaveBeenCalled();
    expect(getInvoice()).toMatchObject({
      status: InvoiceStatus.ACTIVE,
      cancellationStatus: 'PENDING',
    });
    expect(provider.cancel).toHaveBeenCalledTimes(1);
  });

  it('does not release balance when the provider rejects the fiscal cancellation', async () => {
    const { service, tx } = harness({
      provider: {
        cancel: jest.fn().mockResolvedValue({
          correlationId: 'cancel-correlation-1',
          provider: 'FACTURAMA',
          providerDocumentId: 'facturama-document-1',
          status: 'REJECTED',
          uuid: originalUuid,
          requestedAt: '2026-08-23T12:01:00.000Z',
          cancelledAt: null,
        }),
      },
    });

    const result = await service.cancel(
      'invoice-1',
      cancellationDto(),
      actor,
      'cancel-key-rejected',
    );

    expect(result).toMatchObject({
      status: InvoiceStatus.ACTIVE,
      cancellationStatus: 'REJECTED',
    });
    expect(tx.invoiceSaleItemApplication.updateMany).not.toHaveBeenCalled();
    expect(tx.invoiceSaleDocument.updateMany).not.toHaveBeenCalled();
    expect(tx.paymentInvoiceApplication.updateMany).not.toHaveBeenCalled();
  });

  it('keeps the invoice active and unreversed after a provider timeout', async () => {
    const { service, tx, provider } = harness({
      provider: {
        cancel: jest.fn().mockRejectedValue({
          code: 'FISCAL_PROVIDER_TIMEOUT',
          retryable: true,
        }),
      },
    });

    const result = await service.cancel(
      'invoice-1',
      cancellationDto(),
      actor,
      'cancel-key-timeout',
    );

    expect(provider.cancel).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: InvoiceStatus.ACTIVE,
      cancellationStatus: 'UNKNOWN',
    });
    expect(tx.invoiceSaleItemApplication.updateMany).not.toHaveBeenCalled();
    expect(tx.invoiceSaleDocument.updateMany).not.toHaveBeenCalled();
  });

  it('replays the same idempotency key without a second provider request', async () => {
    const { service, tx, provider, getInvoice } = harness();
    const first = await service.cancel(
      'invoice-1',
      cancellationDto(),
      actor,
      'cancel-key-replay',
    );
    tx.invoice.findFirst.mockResolvedValueOnce({
      ...getInvoice(),
      cancellationPayloadHash: (
        service as unknown as { hashPayload: (payload: object) => string }
      ).hashPayload({
        invoiceId: 'invoice-1',
        expectedVersion: 3,
        cancellationMotiveCode: '02',
        internalReason: 'Customer correction',
        replacementInvoiceId: null,
        actorUserId: actor.id,
      }),
    });
    const second = await service.cancel(
      'invoice-1',
      cancellationDto(),
      actor,
      'cancel-key-replay',
    );

    expect(provider.cancel).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({
      status: first.status,
      cancellationStatus: first.cancellationStatus,
    });
  });

  it('allows at most one effective provider request for concurrent keys', async () => {
    let release!: (value: FiscalCancellationResponse) => void;
    const providerCancel = jest.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { service, provider } = harness({
      provider: { cancel: providerCancel },
    });

    const first = service.cancel(
      'invoice-1',
      cancellationDto(),
      actor,
      'cancel-key-concurrent-a',
    );
    while (providerCancel.mock.calls.length === 0) await Promise.resolve();

    await expect(
      service.cancel(
        'invoice-1',
        cancellationDto(),
        actor,
        'cancel-key-concurrent-b',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    release({
      correlationId: 'cancel-correlation-1',
      provider: 'FACTURAMA',
      providerDocumentId: 'facturama-document-1',
      status: 'CANCELLED',
      uuid: originalUuid,
      requestedAt: '2026-08-23T12:01:00.000Z',
      cancelledAt: '2026-08-23T12:01:01.000Z',
    });
    await expect(first).resolves.toMatchObject({
      cancellationStatus: 'ACCEPTED',
    });
    expect(provider.cancel).toHaveBeenCalledTimes(1);
  });

  it('rejects a replacement motive without a valid stamped substitute', async () => {
    const { service, tx } = harness();

    await expect(
      service.cancel(
        'invoice-1',
        cancellationDto({ cancellationMotiveCode: '01' }),
        actor,
        'cancel-key-missing-replacement',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.fiscalOperationAttempt.create).not.toHaveBeenCalled();
  });

  it('persists the server-resolved replacement UUID for motive 01', async () => {
    const { service, provider, getInvoice } = harness();

    const result = await service.cancel(
      'invoice-1',
      cancellationDto({
        cancellationMotiveCode: '01',
        replacementInvoiceId: 'replacement-1',
      }),
      actor,
      'cancel-key-replacement',
    );

    expect(provider.cancel).toHaveBeenCalledWith(
      expect.objectContaining({
        motive: '01',
        replacementUuid,
      }),
    );
    expect(result).toMatchObject({
      replacementInvoiceId: 'replacement-1',
      replacementUuid,
    });
    expect(getInvoice()).toMatchObject({
      replacementInvoiceId: 'replacement-1',
      replacementUuid,
    });
  });

  it('fails closed when no fiscal provider is configured', async () => {
    const service = new InvoiceCancellationService({} as never);

    await expect(
      service.cancel('invoice-1', cancellationDto(), actor, 'cancel-key-none'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects a stale version before reserving a cancellation attempt', async () => {
    const { service, tx, getInvoice } = harness();
    tx.invoice.findUnique.mockResolvedValueOnce({
      ...getInvoice(),
      version: 4,
    });

    await expect(
      service.cancel('invoice-1', cancellationDto(), actor, 'cancel-key-stale'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.fiscalOperationAttempt.create).not.toHaveBeenCalled();
  });
});
