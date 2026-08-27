import { createHash } from 'node:crypto';
import type {
  FiscalArtifactCommand,
  FiscalArtifactContent,
  FiscalCancelCommand,
  FiscalCancellationResponse,
  FiscalIssueCommand,
  FiscalProviderPort,
  FiscalStatusCommand,
  FiscalStatusResponse,
  FiscalStampResponse,
} from '../domain/fiscal-provider.port';

type Handler<TCommand, TResult> = (
  command: TCommand,
) => Promise<TResult> | TResult;

export interface FakeFiscalProviderOptions {
  providerKey?: string;
  providerSideIdempotency?: boolean;
  stamp?: Handler<FiscalIssueCommand, FiscalStampResponse>;
  cancel?: Handler<FiscalCancelCommand, FiscalCancellationResponse>;
  getStatus?: Handler<FiscalStatusCommand, FiscalStatusResponse>;
  getXml?: Handler<FiscalArtifactCommand, FiscalArtifactContent>;
  getPdf?: Handler<FiscalArtifactCommand, FiscalArtifactContent>;
  getCancellationStatus?: Handler<
    FiscalStatusCommand,
    FiscalCancellationResponse
  >;
}

/**
 * In-memory provider for domain/contract tests. It intentionally has no HTTP,
 * credentials, persistence, or Facturama types.
 */
export class FakeFiscalProvider implements FiscalProviderPort {
  readonly providerKey: string;
  readonly capabilities: Readonly<{ providerSideIdempotency: boolean }>;
  readonly calls: Array<{
    operation: keyof FakeFiscalProviderOptions;
    command: unknown;
  }> = [];
  private readonly stampedUuids = new Map<string, string>();

  constructor(private readonly options: FakeFiscalProviderOptions = {}) {
    this.providerKey = options.providerKey?.trim().toUpperCase() || 'FAKE';
    this.capabilities = Object.freeze({
      providerSideIdempotency: options.providerSideIdempotency ?? true,
    });
  }

  async stamp(command: FiscalIssueCommand): Promise<FiscalStampResponse> {
    this.calls.push({ operation: 'stamp', command });
    if (this.options.stamp) return this.options.stamp(command);
    const uuid = deterministicUuid(command.idempotencyKey);
    const providerDocumentId = `fake-${command.folio}`;
    this.stampedUuids.set(providerDocumentId, uuid);
    const stampedAt = command.snapshot.issuedAt;
    return {
      correlationId: command.correlationId,
      provider: this.providerKey,
      providerDocumentId,
      outcome: 'STAMPED',
      uuid,
      issuedAt: command.snapshot.issuedAt,
      stampedAt,
      tfd: {
        uuid,
        stampedAt,
        cfdiSeal: 'fake-cfdi-seal',
        satSeal: 'fake-sat-seal',
        satCertificateNumber: 'fake-certificate',
        providerCertificateRfc: 'FAK000000000',
      },
      xmlReference: {
        artifactType: 'XML',
        providerDocumentId,
      },
      pdfReference: {
        artifactType: 'PDF',
        providerDocumentId,
      },
    };
  }

  async cancel(
    command: FiscalCancelCommand,
  ): Promise<FiscalCancellationResponse> {
    this.calls.push({ operation: 'cancel', command });
    if (!this.options.cancel) {
      return {
        correlationId: command.correlationId,
        provider: this.providerKey,
        providerDocumentId: command.providerDocumentId,
        status: 'CANCELLED',
        uuid: command.uuid,
        requestedAt: new Date().toISOString(),
        cancelledAt: new Date().toISOString(),
      };
    }
    return this.options.cancel(command);
  }

  async getStatus(command: FiscalStatusCommand): Promise<FiscalStatusResponse> {
    this.calls.push({ operation: 'getStatus', command });
    if (this.options.getStatus) return this.options.getStatus(command);
    return {
      correlationId: command.correlationId,
      provider: this.providerKey,
      providerDocumentId: command.providerDocumentId,
      status: 'ACTIVE',
      uuid: command.uuid ?? null,
      issuedAt: null,
      cancelledAt: null,
    };
  }

  async getXml(command: FiscalArtifactCommand): Promise<FiscalArtifactContent> {
    this.calls.push({ operation: 'getXml', command });
    if (this.options.getXml) return this.options.getXml(command);
    return fakeArtifact(
      this.providerKey,
      command,
      'XML',
      `<cfdi:Comprobante UUID="${this.stampedUuids.get(command.providerDocumentId) ?? deterministicUuid(command.providerDocumentId)}" />`,
      'application/xml',
    );
  }

  async getPdf(command: FiscalArtifactCommand): Promise<FiscalArtifactContent> {
    this.calls.push({ operation: 'getPdf', command });
    if (this.options.getPdf) return this.options.getPdf(command);
    return fakeArtifact(
      this.providerKey,
      command,
      'PDF',
      'fake-pdf',
      'application/pdf',
    );
  }

  async getCancellationStatus(
    command: FiscalStatusCommand,
  ): Promise<FiscalCancellationResponse> {
    this.calls.push({ operation: 'getCancellationStatus', command });
    if (this.options.getCancellationStatus)
      return this.options.getCancellationStatus(command);
    return {
      correlationId: command.correlationId,
      provider: this.providerKey,
      providerDocumentId: command.providerDocumentId,
      status: 'ACTIVE',
      uuid: command.uuid ?? deterministicUuid(command.providerDocumentId),
      requestedAt: null,
      cancelledAt: null,
    };
  }
}

function deterministicUuid(value: string): string {
  const hash = createHash('sha256').update(value).digest('hex').slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20)}`.toUpperCase();
}

function fakeArtifact(
  providerKey: string,
  command: FiscalArtifactCommand,
  artifactType: 'XML' | 'PDF',
  value: string,
  contentType: string,
): FiscalArtifactContent {
  const content = Buffer.from(value, 'utf8');
  return {
    correlationId: command.correlationId,
    provider: providerKey,
    providerDocumentId: command.providerDocumentId,
    artifactType,
    contentType,
    content,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}
