import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FiscalArtifactStatus,
  FiscalArtifactType,
  FiscalOperationType,
  InvoiceFiscalStatus,
  Prisma,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  FISCAL_PROVIDER_PORT,
  FiscalProviderError,
  type FiscalArtifactContent,
  type FiscalCancellationResponse,
  type FiscalProviderPort,
  type FiscalStampResponse,
} from './domain/fiscal-provider.port';
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from '../object-storage/object-storage.port';
import { containsUnsafeXmlDeclaration } from './xml-security';
import { FiscalEventLogger } from './fiscal-event.logger';

type Actor = Pick<AuthenticatedUser, 'id' | 'role'>;
type DownloadableArtifactType = Extract<FiscalArtifactType, 'XML' | 'PDF'>;
type ArtifactOverrides = Partial<
  Record<DownloadableArtifactType, FiscalArtifactContent | null>
>;
type PersistableArtifactType = FiscalArtifactType;
type ArtifactResultStatus = 'AVAILABLE' | 'FAILED';

type ArtifactRow = {
  id: string;
  type: FiscalArtifactType;
  status: FiscalArtifactStatus;
  version: number;
  storageKey: string;
  mimeType: string;
  byteSize: bigint | null;
  sha256: string | null;
  providerHash: string | null;
  metadata: Prisma.JsonValue | null;
};

type ArtifactInvoice = {
  id: string;
  uuid: string | null;
  legalEntityId: string;
  fiscalStatus: InvoiceFiscalStatus;
  stampedAt: Date | null;
  createdByUserId: string;
  sourceBillingRequest: {
    requestedByUserId: string;
    accountReceivables: Array<{ id: string }>;
  } | null;
  documents: Array<{
    saleDocument: {
      sale: {
        userId: string;
        accountReceivable: { id: string } | null;
      };
    };
  }>;
  fiscalArtifacts: ArtifactRow[];
  fiscalOperationAttempts: Array<{ providerKey: string }>;
};

type ArtifactFailureCode =
  | 'FISCAL_ARTIFACT_MISSING'
  | 'FISCAL_ARTIFACT_UUID_MISSING'
  | 'FISCAL_ARTIFACT_UUID_MISMATCH'
  | 'FISCAL_ARTIFACT_HASH_MISMATCH'
  | 'FISCAL_ARTIFACT_MIME_MISMATCH'
  | 'FISCAL_ARTIFACT_XML_UNSAFE'
  | 'FISCAL_ARTIFACT_PROVIDER_UNAVAILABLE'
  | 'FISCAL_ARTIFACT_STORAGE_FAILURE'
  | 'FISCAL_ARTIFACT_DATABASE_FAILURE';

const ARTIFACT_SELECT = {
  id: true,
  type: true,
  status: true,
  version: true,
  storageKey: true,
  mimeType: true,
  byteSize: true,
  sha256: true,
  providerHash: true,
  metadata: true,
} satisfies Prisma.FiscalArtifactSelect;

const INVOICE_SELECT = {
  id: true,
  uuid: true,
  legalEntityId: true,
  fiscalStatus: true,
  stampedAt: true,
  createdByUserId: true,
  sourceBillingRequest: {
    select: {
      requestedByUserId: true,
      accountReceivables: { select: { id: true } },
    },
  },
  documents: {
    select: {
      saleDocument: {
        select: {
          sale: {
            select: {
              userId: true,
              accountReceivable: { select: { id: true } },
            },
          },
        },
      },
    },
  },
  fiscalArtifacts: {
    orderBy: { version: 'desc' as const },
    select: ARTIFACT_SELECT,
  },
  fiscalOperationAttempts: {
    where: { operation: FiscalOperationType.STAMP },
    orderBy: { attemptNumber: 'desc' as const },
    take: 1,
    select: { providerKey: true },
  },
} satisfies Prisma.InvoiceSelect;

const DEFAULT_SIGNED_URL_TTL_SECONDS = 300;
const MAX_FISCAL_SIGNED_URL_TTL_SECONDS = 300;

@Injectable()
export class FiscalArtifactService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(FISCAL_PROVIDER_PORT)
    private readonly provider: FiscalProviderPort,
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly events?: FiscalEventLogger,
  ) {}

  /**
   * Materializes the provider's authoritative XML/PDF after Invoice is already
   * STAMPED. Provider and object-storage calls intentionally occur outside any
   * database transaction; only each metadata transition is short and atomic.
   * Reconciliation may provide bytes already downloaded in the same pass so a
   * recovery does not issue a duplicate artifact request.
   */
  async persistStampedArtifacts(
    invoiceId: string,
    response: FiscalStampResponse,
    overrides?: ArtifactOverrides,
  ): Promise<Record<DownloadableArtifactType, ArtifactResultStatus>> {
    const invoice = await this.findInvoice(invoiceId);
    if (!invoice) throw new NotFoundException('INVOICE_NOT_FOUND');

    const rows = await this.ensureRows(invoice, response);
    const result: Record<DownloadableArtifactType, ArtifactResultStatus> = {
      XML: 'FAILED',
      PDF: 'FAILED',
    };
    for (const type of ['XML', 'PDF'] as const) {
      this.events?.emit('cfdi.artifact.started', {
        invoiceId,
        artifactType: type,
        correlationId: response.correlationId,
      });
    }

    if (invoice.fiscalStatus !== InvoiceFiscalStatus.STAMPED) {
      return this.failRows(invoice, rows, 'FISCAL_ARTIFACT_MISSING', result);
    }
    if (!invoice.uuid || !invoice.stampedAt) {
      return this.failRows(
        invoice,
        rows,
        'FISCAL_ARTIFACT_UUID_MISSING',
        result,
      );
    }

    const expectedUuid = invoice.uuid.trim().toUpperCase();
    const responseUuid =
      typeof response.uuid === 'string'
        ? response.uuid.trim().toUpperCase()
        : '';
    const tfdUuid =
      typeof response.tfd?.uuid === 'string'
        ? response.tfd.uuid.trim().toUpperCase()
        : '';
    if (responseUuid !== expectedUuid || tfdUuid !== expectedUuid) {
      return this.failRows(
        invoice,
        rows,
        'FISCAL_ARTIFACT_UUID_MISMATCH',
        result,
      );
    }

    for (const type of ['XML', 'PDF'] as const) {
      const row = rows[type];
      if (!row) {
        result[type] = 'FAILED';
        this.emitArtifactResult(
          invoice.id,
          type,
          'FAILED',
          'FISCAL_ARTIFACT_MISSING',
        );
        continue;
      }
      if (row.status === FiscalArtifactStatus.AVAILABLE) {
        result[type] = 'AVAILABLE';
        this.emitArtifactResult(invoice.id, type, 'AVAILABLE');
        continue;
      }

      const reference =
        type === 'XML' ? response.xmlReference : response.pdfReference;
      let content: FiscalArtifactContent | null;
      if (
        overrides !== undefined &&
        Object.prototype.hasOwnProperty.call(overrides, type)
      ) {
        content = overrides[type] ?? null;
      } else {
        content = await this.fetchProviderArtifact(
          type,
          response.provider,
          response.correlationId,
          reference.providerDocumentId,
        );
      }
      if (!content) {
        await this.markFailure(
          invoice,
          row,
          this.providerFailureCode,
          this.storageKey(invoice, expectedUuid, type),
        );
        this.emitArtifactResult(
          invoice.id,
          type,
          'FAILED',
          this.providerFailureCode,
        );
        continue;
      }

      const validationFailure = this.validateContent(
        type,
        content,
        expectedUuid,
      );
      if (validationFailure) {
        await this.markFailure(
          invoice,
          row,
          validationFailure,
          this.storageKey(invoice, expectedUuid, type),
        );
        this.emitArtifactResult(invoice.id, type, 'FAILED', validationFailure);
        continue;
      }

      const storageKey = this.storageKey(invoice, expectedUuid, type);
      try {
        if (!this.storage.isConfigured()) {
          throw new Error('OBJECT_STORAGE_NOT_CONFIGURED');
        }
        const body = Buffer.from(content.content);
        await this.storage.putObject({
          key: storageKey,
          body,
          contentType: this.expectedMimeType(type),
          checksumSha256: Buffer.from(content.sha256, 'hex').toString('base64'),
        });
        await this.markAvailable(invoice, row, storageKey, content, body);
        result[type] = 'AVAILABLE';
        this.emitArtifactResult(invoice.id, type, 'AVAILABLE');
      } catch {
        await this.markFailure(
          invoice,
          row,
          'FISCAL_ARTIFACT_STORAGE_FAILURE',
          storageKey,
        );
        this.emitArtifactResult(
          invoice.id,
          type,
          'FAILED',
          'FISCAL_ARTIFACT_STORAGE_FAILURE',
        );
      }
    }

    return result;
  }

  /**
   * Reconciles rows left PENDING/FAILED after a process crash. The provider
   * reference is read from the persisted metadata; no second stamp is issued.
   */
  async recoverMissingArtifacts(
    invoiceId: string,
  ): Promise<Record<DownloadableArtifactType, ArtifactResultStatus>> {
    const invoice = await this.findInvoice(invoiceId);
    if (!invoice) throw new NotFoundException('INVOICE_NOT_FOUND');
    if (!invoice.uuid || !invoice.stampedAt) {
      throw new ConflictException('FISCAL_ARTIFACT_MISSING');
    }
    const attempt = invoice.fiscalArtifacts.find(
      (artifact) => artifact.type === FiscalArtifactType.XML,
    );
    const response = this.recoveryResponse(invoice, attempt);
    return this.persistStampedArtifacts(invoiceId, response);
  }

  async persistCancellationAcknowledgment(
    invoiceId: string,
    response: FiscalCancellationResponse,
  ): Promise<ArtifactResultStatus> {
    this.events?.emit('cfdi.artifact.started', {
      invoiceId,
      artifactType: FiscalArtifactType.CANCELLATION_ACK,
      correlationId: response.correlationId,
    });
    const invoice = await this.findInvoice(invoiceId);
    if (!invoice) throw new NotFoundException('INVOICE_NOT_FOUND');
    const acknowledgment = response.acknowledgment;
    const row = await this.ensureArtifactRow(
      invoice,
      FiscalArtifactType.CANCELLATION_ACK,
      acknowledgment?.providerDocumentId ?? response.providerDocumentId,
    );
    if (row.status === FiscalArtifactStatus.AVAILABLE) {
      this.emitArtifactResult(
        invoiceId,
        FiscalArtifactType.CANCELLATION_ACK,
        'AVAILABLE',
      );
      return 'AVAILABLE';
    }

    const storageKey = this.storageKey(
      invoice,
      invoice.uuid ?? 'unknown',
      FiscalArtifactType.CANCELLATION_ACK,
    );
    if (!acknowledgment) {
      await this.markFailure(
        invoice,
        row,
        'FISCAL_ARTIFACT_MISSING',
        storageKey,
      );
      this.emitArtifactResult(
        invoiceId,
        FiscalArtifactType.CANCELLATION_ACK,
        'FAILED',
        'FISCAL_ARTIFACT_MISSING',
      );
      return 'FAILED';
    }
    if (
      invoice.uuid &&
      response.uuid.trim().toUpperCase() !== invoice.uuid.trim().toUpperCase()
    ) {
      await this.markFailure(
        invoice,
        row,
        'FISCAL_ARTIFACT_UUID_MISMATCH',
        storageKey,
      );
      this.emitArtifactResult(
        invoiceId,
        FiscalArtifactType.CANCELLATION_ACK,
        'FAILED',
        'FISCAL_ARTIFACT_UUID_MISMATCH',
      );
      return 'FAILED';
    }
    const failure = this.validateContent(
      FiscalArtifactType.CANCELLATION_ACK,
      acknowledgment,
      invoice.uuid?.trim().toUpperCase() ?? '',
    );
    if (failure) {
      await this.markFailure(invoice, row, failure, storageKey);
      this.emitArtifactResult(
        invoiceId,
        FiscalArtifactType.CANCELLATION_ACK,
        'FAILED',
        failure,
      );
      return 'FAILED';
    }
    try {
      if (!this.storage.isConfigured())
        throw new Error('OBJECT_STORAGE_NOT_CONFIGURED');
      const body = Buffer.from(acknowledgment.content);
      await this.storage.putObject({
        key: storageKey,
        body,
        contentType: 'application/xml',
        checksumSha256: Buffer.from(acknowledgment.sha256, 'hex').toString(
          'base64',
        ),
      });
      await this.markAvailable(invoice, row, storageKey, acknowledgment, body);
      this.emitArtifactResult(
        invoiceId,
        FiscalArtifactType.CANCELLATION_ACK,
        'AVAILABLE',
      );
      return 'AVAILABLE';
    } catch {
      await this.markFailure(
        invoice,
        row,
        'FISCAL_ARTIFACT_STORAGE_FAILURE',
        storageKey,
      );
      this.emitArtifactResult(
        invoiceId,
        FiscalArtifactType.CANCELLATION_ACK,
        'FAILED',
        'FISCAL_ARTIFACT_STORAGE_FAILURE',
      );
      return 'FAILED';
    }
  }

  async getDownloadUrl(
    invoiceId: string,
    type: DownloadableArtifactType,
    actor: Actor,
  ) {
    const invoice = await this.findInvoice(invoiceId);
    if (!invoice) throw new NotFoundException('INVOICE_NOT_FOUND');
    this.assertScope(invoice, actor);

    const artifact = invoice.fiscalArtifacts
      .filter((candidate) => candidate.type === type)
      .sort((left, right) => right.version - left.version)[0];
    if (!artifact || artifact.status !== FiscalArtifactStatus.AVAILABLE) {
      throw new ConflictException(
        invoice.fiscalStatus === InvoiceFiscalStatus.STAMPED
          ? 'FISCAL_ARTIFACT_MISSING'
          : 'FISCAL_ARTIFACT_NOT_AVAILABLE',
      );
    }
    if (!artifact.sha256 || artifact.byteSize === null) {
      throw new ConflictException('FISCAL_ARTIFACT_MISSING');
    }
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException(
        'FISCAL_ARTIFACT_STORAGE_UNAVAILABLE',
      );
    }

    const configuredExpiresInSeconds =
      this.config?.get<number>('OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS') ??
      DEFAULT_SIGNED_URL_TTL_SECONDS;
    const expiresInSeconds =
      Number.isSafeInteger(configuredExpiresInSeconds) &&
      configuredExpiresInSeconds > 0
        ? Math.min(
            configuredExpiresInSeconds,
            MAX_FISCAL_SIGNED_URL_TTL_SECONDS,
          )
        : DEFAULT_SIGNED_URL_TTL_SECONDS;
    let url: string;
    try {
      url = await this.storage.getDownloadUrl(
        artifact.storageKey,
        expiresInSeconds,
      );
    } catch {
      throw new ServiceUnavailableException(
        'FISCAL_ARTIFACT_STORAGE_UNAVAILABLE',
      );
    }

    return {
      invoiceId,
      artifactType: type,
      mimeType: artifact.mimeType,
      sizeBytes: artifact.byteSize.toString(),
      sha256: artifact.sha256,
      expiresInSeconds,
      url,
    };
  }

  private readonly providerFailureCode: ArtifactFailureCode =
    'FISCAL_ARTIFACT_PROVIDER_UNAVAILABLE';

  private async findInvoice(
    invoiceId: string,
  ): Promise<ArtifactInvoice | null> {
    return this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: INVOICE_SELECT,
    });
  }

  private async ensureRows(
    invoice: ArtifactInvoice,
    response: FiscalStampResponse,
  ): Promise<Partial<Record<DownloadableArtifactType, ArtifactRow>>> {
    const rows: Partial<Record<DownloadableArtifactType, ArtifactRow>> = {};
    const expectedUuid = invoice.uuid?.trim().toUpperCase() ?? response.uuid;
    for (const type of ['XML', 'PDF'] as const) {
      const reference =
        type === 'XML' ? response.xmlReference : response.pdfReference;
      rows[type] = await this.ensureArtifactRow(
        invoice,
        type,
        reference.providerDocumentId,
        expectedUuid,
        response.provider,
      );
    }
    return rows;
  }

  private async ensureArtifactRow(
    invoice: ArtifactInvoice,
    type: PersistableArtifactType,
    providerDocumentId: string,
    uuid = invoice.uuid?.trim().toUpperCase() ?? 'unknown',
    providerKey = this.provider.providerKey,
  ): Promise<ArtifactRow> {
    const existing = invoice.fiscalArtifacts
      .filter((artifact) => artifact.type === type)
      .sort((left, right) => right.version - left.version)[0];
    if (existing) return existing;

    const created = await this.prisma.fiscalArtifact.create({
      data: {
        invoiceId: invoice.id,
        type,
        status: FiscalArtifactStatus.PENDING,
        version: 1,
        storageKey: this.storageKey(invoice, uuid, type),
        mimeType: this.expectedMimeType(type),
        metadata: this.toJson({ providerDocumentId, providerKey }),
      },
      select: ARTIFACT_SELECT,
    });
    return created;
  }

  private async fetchProviderArtifact(
    type: DownloadableArtifactType,
    providerKey: string,
    correlationId: string,
    providerDocumentId: string,
  ): Promise<FiscalArtifactContent | null> {
    try {
      const content =
        type === 'XML'
          ? await this.provider.getXml({
              correlationId,
              providerKey,
              providerDocumentId,
            })
          : await this.provider.getPdf({
              correlationId,
              providerKey,
              providerDocumentId,
            });
      if (content.artifactType !== type) return null;
      return content;
    } catch (error) {
      if (error instanceof FiscalProviderError) return null;
      return null;
    }
  }

  private validateContent(
    type: PersistableArtifactType,
    content: FiscalArtifactContent,
    expectedUuid: string,
  ): ArtifactFailureCode | null {
    if (!content.content || content.content.byteLength === 0)
      return 'FISCAL_ARTIFACT_MISSING';
    const normalizedContentType =
      typeof content.contentType === 'string'
        ? content.contentType.toLowerCase().split(';', 1)[0].trim()
        : '';
    const acceptedMimeTypes =
      type === FiscalArtifactType.PDF
        ? ['application/pdf']
        : ['application/xml', 'text/xml'];
    if (!acceptedMimeTypes.includes(normalizedContentType)) {
      return 'FISCAL_ARTIFACT_MIME_MISMATCH';
    }
    const providerHash =
      typeof content.sha256 === 'string'
        ? content.sha256.trim().toLowerCase()
        : '';
    const bodyHash = createHash('sha256').update(content.content).digest('hex');
    if (bodyHash !== providerHash) {
      return 'FISCAL_ARTIFACT_HASH_MISMATCH';
    }
    if (type === FiscalArtifactType.PDF) return null;

    const xml = Buffer.from(content.content).toString('utf8');
    if (containsUnsafeXmlDeclaration(xml)) {
      return 'FISCAL_ARTIFACT_XML_UNSAFE';
    }
    if (type === FiscalArtifactType.CANCELLATION_ACK) return null;
    const uuidMatch =
      /<[^>]*TimbreFiscalDigital\b[^>]*\bUUID\s*=\s*["']([^"']+)["']/i.exec(
        xml,
      );
    if (!uuidMatch?.[1]) return 'FISCAL_ARTIFACT_UUID_MISSING';
    if (uuidMatch[1].trim().toUpperCase() !== expectedUuid) {
      return 'FISCAL_ARTIFACT_UUID_MISMATCH';
    }
    return null;
  }

  private async markAvailable(
    invoice: ArtifactInvoice,
    row: ArtifactRow,
    storageKey: string,
    content: FiscalArtifactContent,
    body: Buffer,
  ) {
    const metadata = this.toJson({
      providerDocumentId: content.providerDocumentId,
      provider: content.provider,
      retrievedAt: new Date().toISOString(),
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.fiscalArtifact.update({
        where: { id: row.id },
        data: {
          status: FiscalArtifactStatus.AVAILABLE,
          storageKey,
          mimeType: this.expectedMimeType(row.type),
          byteSize: BigInt(body.byteLength),
          sha256: content.sha256.trim().toLowerCase(),
          providerHash: content.sha256.trim().toLowerCase(),
          metadata,
          storedAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      await tx.billingAuditLog.create({
        data: {
          actorUserId: invoice.createdByUserId,
          action: 'CFDI_ARTIFACT_STORED',
          entityType: 'FiscalArtifact',
          entityId: row.id,
          reason: 'FISCAL_ARTIFACT_AVAILABLE',
          correlationId: invoice.id,
          context: this.toJson({
            invoiceId: invoice.id,
            artifactType: row.type,
            sizeBytes: body.byteLength,
          }),
        },
      });
    });
  }

  private async markFailure(
    invoice: ArtifactInvoice,
    row: ArtifactRow,
    code: ArtifactFailureCode,
    storageKey: string,
  ) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.fiscalArtifact.findUnique({
          where: { id: row.id },
          select: {
            status: true,
            sha256: true,
            byteSize: true,
            storedAt: true,
          },
        });
        // A client can observe an error after the AVAILABLE transaction
        // committed. Never downgrade a confirmed artifact on that ambiguity.
        if (
          current?.status === FiscalArtifactStatus.AVAILABLE &&
          current.sha256 &&
          current.byteSize !== null &&
          current.storedAt
        ) {
          return;
        }
        await tx.fiscalArtifact.update({
          where: { id: row.id },
          data: {
            status: FiscalArtifactStatus.FAILED,
            storageKey,
            lastErrorCode: code,
            lastErrorMessage: code,
          },
        });
        await tx.billingAuditLog.create({
          data: {
            actorUserId: invoice.createdByUserId,
            action: 'CFDI_ARTIFACT_INCONSISTENT',
            entityType: 'FiscalArtifact',
            entityId: row.id,
            reason: code,
            correlationId: invoice.id,
            context: this.toJson({
              invoiceId: invoice.id,
              artifactType: row.type,
              recoverable: true,
            }),
          },
        });
      });
    } catch {
      // The row remains PENDING/FAILED and is recoverable by a later sweep.
    }
  }

  private async failRows(
    invoice: ArtifactInvoice,
    rows: Partial<Record<DownloadableArtifactType, ArtifactRow>>,
    code: ArtifactFailureCode,
    result: Record<DownloadableArtifactType, ArtifactResultStatus>,
  ) {
    for (const type of ['XML', 'PDF'] as const) {
      const row = rows[type];
      if (row) await this.markFailure(invoice, row, code, row.storageKey);
      result[type] = 'FAILED';
      this.emitArtifactResult(invoice.id, type, 'FAILED', code);
    }
    return result;
  }

  private emitArtifactResult(
    invoiceId: string,
    artifactType: PersistableArtifactType,
    status: ArtifactResultStatus,
    code?: ArtifactFailureCode,
  ): void {
    this.events?.emit(
      status === 'AVAILABLE'
        ? 'cfdi.artifact.completed'
        : 'cfdi.artifact.failed',
      {
        invoiceId,
        artifactType,
        state: status,
        ...(code ? { code } : {}),
      },
    );
  }

  private assertScope(invoice: ArtifactInvoice, actor: Actor) {
    if (actor.role === 'ADMIN' || actor.role === 'BILLING') return;
    const sellerOwnsInvoice = invoice.documents.some(
      (document) => document.saleDocument.sale.userId === actor.id,
    );
    const collectionOwnsInvoice =
      Boolean(invoice.sourceBillingRequest?.accountReceivables.length) ||
      invoice.documents.some((document) =>
        Boolean(document.saleDocument.sale.accountReceivable),
      );
    if (
      (actor.role === 'SELLER' && sellerOwnsInvoice) ||
      (actor.role === 'COLLECTIONS' && collectionOwnsInvoice)
    ) {
      return;
    }
    throw new ForbiddenException('FISCAL_ARTIFACT_ACCESS_DENIED');
  }

  private storageKey(
    invoice: Pick<ArtifactInvoice, 'legalEntityId' | 'stampedAt'>,
    uuid: string,
    type: PersistableArtifactType,
  ) {
    const date = invoice.stampedAt ?? new Date();
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const extension = type === FiscalArtifactType.PDF ? 'pdf' : 'xml';
    const name =
      type === FiscalArtifactType.CANCELLATION_ACK
        ? 'cancellation-ack-v1'
        : `${type.toLowerCase()}-v1`;
    return `fiscal/${invoice.legalEntityId}/${year}/${month}/${uuid.toLowerCase()}/${name}.${extension}`;
  }

  private expectedMimeType(type: PersistableArtifactType) {
    return type === FiscalArtifactType.PDF
      ? 'application/pdf'
      : 'application/xml';
  }

  private recoveryResponse(
    invoice: ArtifactInvoice,
    xmlArtifact: ArtifactRow | undefined,
  ): FiscalStampResponse {
    const xmlProviderDocumentId = this.providerDocumentId(xmlArtifact);
    const pdfArtifact = invoice.fiscalArtifacts.find(
      (artifact) => artifact.type === FiscalArtifactType.PDF,
    );
    const pdfProviderDocumentId = this.providerDocumentId(pdfArtifact);
    const stampedAt =
      invoice.stampedAt?.toISOString() ?? new Date().toISOString();
    const uuid = invoice.uuid as string;
    return {
      correlationId: `recovery:${invoice.id}`,
      provider: this.providerKey(xmlArtifact, invoice),
      providerDocumentId: xmlProviderDocumentId,
      outcome: 'STAMPED',
      uuid,
      issuedAt: stampedAt,
      stampedAt,
      tfd: {
        uuid,
        stampedAt,
        cfdiSeal: '',
        satSeal: '',
        satCertificateNumber: '',
        providerCertificateRfc: '',
      },
      xmlReference: {
        artifactType: 'XML',
        providerDocumentId: xmlProviderDocumentId,
      },
      pdfReference: {
        artifactType: 'PDF',
        providerDocumentId: pdfProviderDocumentId,
      },
    };
  }

  private providerDocumentId(row: ArtifactRow | undefined) {
    const metadata = row?.metadata;
    if (
      metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      typeof (metadata as { providerDocumentId?: unknown })
        .providerDocumentId === 'string' &&
      (metadata as { providerDocumentId: string }).providerDocumentId.trim()
    ) {
      return (metadata as { providerDocumentId: string }).providerDocumentId;
    }
    return row?.id ?? 'unknown-provider-document';
  }

  private providerKey(row: ArtifactRow | undefined, invoice: ArtifactInvoice) {
    const metadata = row?.metadata;
    if (
      metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      typeof (metadata as { providerKey?: unknown }).providerKey === 'string' &&
      (metadata as { providerKey: string }).providerKey.trim()
    ) {
      return (metadata as { providerKey: string }).providerKey;
    }
    return (
      invoice.fiscalOperationAttempts?.[0]?.providerKey ??
      this.provider.providerKey
    );
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
