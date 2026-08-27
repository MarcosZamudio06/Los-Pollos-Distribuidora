import { createHash } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FiscalArtifactService } from './fiscal-artifact.service';
import type {
  FiscalArtifactContent,
  FiscalStampResponse,
} from './domain/fiscal-provider.port';

const uuid = 'A8098C1A-F86E-11DA-BD1A-00112444BE1E';

function artifact(
  artifactType: FiscalArtifactContent['artifactType'],
  content: string,
  contentType: string,
  providerDocumentId = 'provider-document-1',
): FiscalArtifactContent {
  const bytes = Buffer.from(content, 'utf8');
  return {
    correlationId: 'correlation-1',
    provider: 'FACTURAMA',
    providerDocumentId,
    artifactType,
    contentType,
    content: bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function stampResponse(): FiscalStampResponse {
  return {
    correlationId: 'correlation-1',
    provider: 'FACTURAMA',
    providerDocumentId: 'provider-document-1',
    outcome: 'STAMPED',
    uuid,
    issuedAt: '2026-08-23T18:00:00.000Z',
    stampedAt: '2026-08-23T18:00:00.000Z',
    tfd: {
      uuid,
      stampedAt: '2026-08-23T18:00:00.000Z',
      cfdiSeal: 'cfdi-seal',
      satSeal: 'sat-seal',
      satCertificateNumber: 'sat-certificate',
      providerCertificateRfc: 'PAC010101AAA',
    },
    xmlReference: {
      artifactType: 'XML',
      providerDocumentId: 'provider-document-1',
    },
    pdfReference: {
      artifactType: 'PDF',
      providerDocumentId: 'provider-document-1',
    },
  };
}

function harness(
  options: {
    xml?: FiscalArtifactContent;
    pdf?: FiscalArtifactContent;
    putObject?: jest.Mock;
    getDownloadUrl?: jest.Mock;
    artifactRows?: unknown[];
    signedUrlTtlSeconds?: number;
  } = {},
) {
  const invoice = {
    id: 'invoice-1',
    uuid,
    legalEntityId: 'legal-entity-1',
    fiscalStatus: 'STAMPED',
    stampedAt: new Date('2026-08-23T18:00:00.000Z'),
    createdByUserId: 'admin-1',
    sourceBillingRequest: {
      requestedByUserId: 'seller-1',
      accountReceivables: [],
    },
    documents: [
      {
        saleDocument: {
          sale: {
            userId: 'seller-1',
            accountReceivable: { id: 'ar-1' },
          },
        },
      },
    ],
    fiscalArtifacts: options.artifactRows ?? [
      {
        id: 'artifact-xml',
        type: 'XML',
        status: 'PENDING',
        version: 1,
        storageKey: 'fiscal/invoice-1/xml/v1.xml',
        mimeType: 'application/xml',
        byteSize: null,
        sha256: null,
        providerHash: null,
        metadata: { providerDocumentId: 'provider-document-1' },
      },
      {
        id: 'artifact-pdf',
        type: 'PDF',
        status: 'PENDING',
        version: 1,
        storageKey: 'fiscal/invoice-1/pdf/v1.pdf',
        mimeType: 'application/pdf',
        byteSize: null,
        sha256: null,
        providerHash: null,
        metadata: { providerDocumentId: 'provider-document-1' },
      },
    ],
    fiscalOperationAttempts: [{ providerKey: 'FACTURAMA' }],
  };
  const tx = {
    fiscalArtifact: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
    billingAuditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    invoice: { findUnique: jest.fn().mockResolvedValue(invoice) },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const storage = {
    isConfigured: jest.fn().mockReturnValue(true),
    putObject: options.putObject ?? jest.fn().mockResolvedValue(undefined),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    getDownloadUrl:
      options.getDownloadUrl ??
      jest.fn().mockResolvedValue('https://objects.example.test/signed'),
  };
  const provider = {
    getXml: jest
      .fn()
      .mockResolvedValue(
        options.xml ??
          artifact(
            'XML',
            `<tfd:TimbreFiscalDigital UUID="${uuid}" />`,
            'application/xml',
          ),
      ),
    getPdf: jest
      .fn()
      .mockResolvedValue(
        options.pdf ?? artifact('PDF', '%PDF-1.7', 'application/pdf'),
      ),
  };
  const events = { emit: jest.fn() };
  const service = new FiscalArtifactService(
    prisma as never,
    storage as never,
    provider as never,
    options.signedUrlTtlSeconds === undefined
      ? undefined
      : ({
          get: jest.fn().mockReturnValue(options.signedUrlTtlSeconds),
        } as never),
    events as never,
  );
  return { service, prisma, tx, storage, provider, invoice, events };
}

describe('FiscalArtifactService', () => {
  it('downloads, hashes and uploads XML/PDF using private deterministic keys', async () => {
    const { service, storage, provider, tx, events } = harness();

    const result = await service.persistStampedArtifacts(
      'invoice-1',
      stampResponse(),
    );

    expect(provider.getXml).toHaveBeenCalledWith({
      correlationId: 'correlation-1',
      providerKey: 'FACTURAMA',
      providerDocumentId: 'provider-document-1',
    });
    expect(provider.getPdf).toHaveBeenCalledWith({
      correlationId: 'correlation-1',
      providerKey: 'FACTURAMA',
      providerDocumentId: 'provider-document-1',
    });
    expect(storage.putObject).toHaveBeenCalledTimes(2);
    expect(storage.putObject).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        key: `fiscal/legal-entity-1/2026/08/${uuid.toLowerCase()}/xml-v1.xml`,
        contentType: 'application/xml',
        checksumSha256: expect.any(String),
        body: expect.any(Buffer),
      }),
    );
    expect(tx.fiscalArtifact.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          sha256: createHash('sha256')
            .update(`<tfd:TimbreFiscalDigital UUID="${uuid}" />`, 'utf8')
            .digest('hex'),
          byteSize: BigInt(
            Buffer.byteLength(`<tfd:TimbreFiscalDigital UUID="${uuid}" />`),
          ),
        }),
      }),
    );
    expect(tx.fiscalArtifact.update).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ XML: 'AVAILABLE', PDF: 'AVAILABLE' });
    expect(events.emit).toHaveBeenCalledWith(
      'cfdi.artifact.completed',
      expect.objectContaining({ invoiceId: 'invoice-1', state: 'AVAILABLE' }),
    );
  });

  it('persists recovered artifact bytes supplied by reconciliation without a second provider download', async () => {
    const recoveredXml = artifact(
      'XML',
      `<tfd:TimbreFiscalDigital UUID="${uuid}" />`,
      'application/xml',
    );
    const { service, provider, storage } = harness();

    const result = await service.persistStampedArtifacts(
      'invoice-1',
      stampResponse(),
      { XML: recoveredXml, PDF: null },
    );

    expect(provider.getXml).not.toHaveBeenCalled();
    expect(provider.getPdf).not.toHaveBeenCalled();
    expect(storage.putObject).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ XML: 'AVAILABLE', PDF: 'FAILED' });
  });

  it('returns a short-lived signed URL without exposing storageKey', async () => {
    const { service, storage } = harness({
      artifactRows: [
        {
          id: 'artifact-xml',
          type: 'XML',
          status: 'AVAILABLE',
          version: 1,
          storageKey: 'fiscal/legal-entity-1/2026/08/uuid/xml-v1.xml',
          mimeType: 'application/xml',
          byteSize: 42n,
          sha256: 'a'.repeat(64),
          providerHash: 'a'.repeat(64),
          metadata: null,
        },
      ],
    });

    const result = await service.getDownloadUrl('invoice-1', 'XML', {
      id: 'seller-1',
      role: 'SELLER',
    });

    expect(storage.getDownloadUrl).toHaveBeenCalledWith(
      'fiscal/legal-entity-1/2026/08/uuid/xml-v1.xml',
      300,
    );
    expect(result).toEqual({
      invoiceId: 'invoice-1',
      artifactType: 'XML',
      mimeType: 'application/xml',
      sizeBytes: '42',
      sha256: 'a'.repeat(64),
      expiresInSeconds: 300,
      url: 'https://objects.example.test/signed',
    });
    expect(result).not.toHaveProperty('storageKey');
  });

  it('caps a misconfigured fiscal signed URL lifetime at five minutes', async () => {
    const { service, storage } = harness({
      signedUrlTtlSeconds: 86_400,
      artifactRows: [
        {
          id: 'artifact-xml',
          type: 'XML',
          status: 'AVAILABLE',
          version: 1,
          storageKey: 'fiscal/legal-entity-1/2026/08/uuid/xml-v1.xml',
          mimeType: 'application/xml',
          byteSize: 42n,
          sha256: 'a'.repeat(64),
          providerHash: 'a'.repeat(64),
          metadata: null,
        },
      ],
    });

    const result = await service.getDownloadUrl('invoice-1', 'XML', {
      id: 'billing-1',
      role: 'BILLING',
    });

    expect(storage.getDownloadUrl).toHaveBeenCalledWith(
      'fiscal/legal-entity-1/2026/08/uuid/xml-v1.xml',
      300,
    );
    expect(result.expiresInSeconds).toBe(300);
  });

  it('reports a recoverable inconsistency when a STAMPED artifact is missing', async () => {
    const { service, tx } = harness({ artifactRows: [] });

    await expect(
      service.getDownloadUrl('invoice-1', 'XML', {
        id: 'admin-1',
        role: 'ADMIN',
      }),
    ).rejects.toEqual(new ConflictException('FISCAL_ARTIFACT_MISSING'));
    expect(tx.fiscalArtifact.update).not.toHaveBeenCalled();
  });

  it('rejects XML whose TimbreFiscalDigital UUID differs from the persisted UUID', async () => {
    const { service, storage, tx } = harness({
      xml: artifact(
        'XML',
        '<tfd:TimbreFiscalDigital UUID="00000000-0000-4000-8000-000000000000" />',
        'application/xml',
      ),
    });

    const result = await service.persistStampedArtifacts(
      'invoice-1',
      stampResponse(),
    );

    expect(result.XML).toBe('FAILED');
    expect(storage.putObject).toHaveBeenCalledTimes(1);
    expect(tx.fiscalArtifact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'artifact-xml' },
        data: expect.objectContaining({
          status: 'FAILED',
          lastErrorCode: 'FISCAL_ARTIFACT_UUID_MISMATCH',
        }),
      }),
    );
  });

  it('rejects XML containing DTD or entity declarations before storage', async () => {
    const { service, storage, tx } = harness({
      xml: artifact(
        'XML',
        `<!DOCTYPE cfdi [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><tfd:TimbreFiscalDigital UUID="${uuid}" />`,
        'application/xml',
      ),
    });

    const result = await service.persistStampedArtifacts(
      'invoice-1',
      stampResponse(),
    );

    expect(result.XML).toBe('FAILED');
    expect(storage.putObject).toHaveBeenCalledTimes(1);
    expect(tx.fiscalArtifact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'artifact-xml' },
        data: expect.objectContaining({
          status: 'FAILED',
          lastErrorCode: 'FISCAL_ARTIFACT_XML_UNSAFE',
        }),
      }),
    );
  });

  it('marks storage failure as recoverable without changing STAMPED state', async () => {
    const putObject = jest
      .fn()
      .mockRejectedValue(new Error('bucket unavailable'));
    const { service, tx } = harness({ putObject });

    const result = await service.persistStampedArtifacts(
      'invoice-1',
      stampResponse(),
    );

    expect(result).toEqual({ XML: 'FAILED', PDF: 'FAILED' });
    expect(tx.fiscalArtifact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          lastErrorCode: 'FISCAL_ARTIFACT_STORAGE_FAILURE',
        }),
      }),
    );
  });

  it('persists a cancellation acknowledgment through the same object-storage boundary', async () => {
    const { service, storage, tx } = harness({
      artifactRows: [
        {
          id: 'artifact-ack',
          type: 'CANCELLATION_ACK',
          status: 'PENDING',
          version: 1,
          storageKey: 'fiscal/invoice-1/cancellation-ack/v1.xml',
          mimeType: 'application/xml',
          byteSize: null,
          sha256: null,
          providerHash: null,
          metadata: { providerDocumentId: 'provider-document-1' },
        },
      ],
    });
    const content = artifact(
      'CANCELLATION_ACK',
      '<AcuseCancelacion />',
      'application/xml',
    );

    await expect(
      service.persistCancellationAcknowledgment('invoice-1', {
        correlationId: 'correlation-cancel',
        provider: 'FACTURAMA',
        providerDocumentId: 'provider-document-1',
        status: 'CANCELLED',
        uuid,
        requestedAt: '2026-08-23T18:00:00.000Z',
        cancelledAt: '2026-08-23T18:01:00.000Z',
        acknowledgment: content,
      }),
    ).resolves.toBe('AVAILABLE');
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `fiscal/legal-entity-1/2026/08/${uuid.toLowerCase()}/cancellation-ack-v1.xml`,
        contentType: 'application/xml',
      }),
    );
    expect(tx.fiscalArtifact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'AVAILABLE' }),
      }),
    );
  });

  it('rejects a cancellation acknowledgment containing DTD or entity declarations', async () => {
    const { service, storage, tx } = harness({
      artifactRows: [
        {
          id: 'artifact-ack',
          type: 'CANCELLATION_ACK',
          status: 'PENDING',
          version: 1,
          storageKey: 'fiscal/invoice-1/cancellation-ack/v1.xml',
          mimeType: 'application/xml',
          byteSize: null,
          sha256: null,
          providerHash: null,
          metadata: { providerDocumentId: 'provider-document-1' },
        },
      ],
    });
    const content = artifact(
      'CANCELLATION_ACK',
      '<!DOCTYPE acuse [<!ENTITY external SYSTEM "file:///etc/passwd">]><AcuseCancelacion>&external;</AcuseCancelacion>',
      'application/xml',
    );

    await expect(
      service.persistCancellationAcknowledgment('invoice-1', {
        correlationId: 'correlation-cancel-unsafe',
        provider: 'FACTURAMA',
        providerDocumentId: 'provider-document-1',
        status: 'CANCELLED',
        uuid,
        requestedAt: '2026-08-23T18:00:00.000Z',
        cancelledAt: '2026-08-23T18:01:00.000Z',
        acknowledgment: content,
      }),
    ).resolves.toBe('FAILED');
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(tx.fiscalArtifact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          lastErrorCode: 'FISCAL_ARTIFACT_XML_UNSAFE',
        }),
      }),
    );
  });

  it('rejects access outside the invoice ownership scope', async () => {
    const { service } = harness();

    await expect(
      service.getDownloadUrl('invoice-1', 'XML', {
        id: 'other-seller',
        role: 'SELLER',
      }),
    ).rejects.toEqual(new ForbiddenException('FISCAL_ARTIFACT_ACCESS_DENIED'));
  });

  it('enforces the complete artifact role and ownership matrix for arbitrary invoice ids', async () => {
    const { service, invoice } = harness({
      artifactRows: [
        {
          id: 'artifact-xml',
          type: 'XML',
          status: 'AVAILABLE',
          version: 1,
          storageKey: 'fiscal/legal-entity-1/2026/08/uuid/xml-v1.xml',
          mimeType: 'application/xml',
          byteSize: 42n,
          sha256: 'a'.repeat(64),
          providerHash: 'a'.repeat(64),
          metadata: null,
        },
      ],
    });

    for (const role of ['ADMIN', 'BILLING'] as const) {
      await expect(
        service.getDownloadUrl('arbitrary-invoice-id', 'XML', {
          id: `${role.toLowerCase()}-1`,
          role,
        }),
      ).resolves.toMatchObject({ artifactType: 'XML' });
    }
    await expect(
      service.getDownloadUrl('arbitrary-invoice-id', 'XML', {
        id: 'seller-1',
        role: 'SELLER',
      }),
    ).resolves.toMatchObject({ artifactType: 'XML' });
    await expect(
      service.getDownloadUrl('arbitrary-invoice-id', 'XML', {
        id: 'collections-1',
        role: 'COLLECTIONS',
      }),
    ).resolves.toMatchObject({ artifactType: 'XML' });

    invoice.documents[0].saleDocument.sale.accountReceivable = null;
    await expect(
      service.getDownloadUrl('arbitrary-invoice-id', 'XML', {
        id: 'collections-1',
        role: 'COLLECTIONS',
      }),
    ).rejects.toEqual(new ForbiddenException('FISCAL_ARTIFACT_ACCESS_DENIED'));
    await expect(
      service.getDownloadUrl('arbitrary-invoice-id', 'XML', {
        id: 'driver-1',
        role: 'DRIVER',
      }),
    ).rejects.toEqual(new ForbiddenException('FISCAL_ARTIFACT_ACCESS_DENIED'));
  });

  it('surfaces object storage failures as a redacted service error', async () => {
    const getDownloadUrl = jest
      .fn()
      .mockRejectedValue(new Error('signed URL contains secret material'));
    const { service } = harness({
      getDownloadUrl,
      artifactRows: [
        {
          id: 'artifact-xml',
          type: 'XML',
          status: 'AVAILABLE',
          version: 1,
          storageKey: 'fiscal/legal-entity-1/2026/08/uuid/xml-v1.xml',
          mimeType: 'application/xml',
          byteSize: 42n,
          sha256: 'a'.repeat(64),
          providerHash: 'a'.repeat(64),
          metadata: null,
        },
      ],
    });

    await expect(
      service.getDownloadUrl('invoice-1', 'XML', {
        id: 'admin-1',
        role: 'ADMIN',
      }),
    ).rejects.toEqual(
      new ServiceUnavailableException('FISCAL_ARTIFACT_STORAGE_UNAVAILABLE'),
    );
  });
});
