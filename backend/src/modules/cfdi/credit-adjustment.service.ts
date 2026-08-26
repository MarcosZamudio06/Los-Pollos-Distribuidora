import {
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreditAdjustmentRepository } from './credit-adjustment.repository';
import type {
  CreditNoteIssuanceFailureOutcome,
  CreditNoteIssuanceResult,
  PreparedCreditNoteIssuance,
} from './credit-adjustment.types';
import {
  FISCAL_PROVIDER_PORT,
  FiscalProviderError,
  type FiscalProviderPort,
} from './domain/fiscal-provider.port';
import type {
  CreateCreditAdjustmentDto,
  CreditAdjustmentVersionDto,
} from './dto/credit-adjustment.dto';
import { FiscalArtifactService } from './fiscal-artifact.service';
import { SatCatalogService } from './sat-catalog.service';

@Injectable()
export class CreditAdjustmentService {
  constructor(
    private readonly repository: CreditAdjustmentRepository,
    @Inject(FISCAL_PROVIDER_PORT)
    private readonly provider: FiscalProviderPort,
    @Optional() private readonly catalogs?: SatCatalogService,
    @Optional() private readonly artifacts?: FiscalArtifactService,
  ) {}

  async create(
    dto: CreateCreditAdjustmentDto,
    actor: Pick<AuthenticatedUser, 'id' | 'role'>,
    idempotencyKey: string,
  ) {
    await this.validateCatalogs(dto.sourceType, dto.paymentFormCode);
    return this.repository.create(dto, actor, idempotencyKey);
  }

  findOne(id: string) {
    return this.repository.findOne(id);
  }

  approve(
    id: string,
    dto: CreditAdjustmentVersionDto,
    actor: Pick<AuthenticatedUser, 'id' | 'role'>,
  ) {
    return this.repository.approve(id, dto, actor);
  }

  async issue(
    id: string,
    dto: CreditAdjustmentVersionDto,
    actor: Pick<AuthenticatedUser, 'id' | 'role'>,
    idempotencyKey: string,
  ): Promise<CreditNoteIssuanceResult> {
    const providerKey = this.provider.providerKey;
    const adjustment = await this.repository.findOne(id);
    await this.validateCatalogs(
      adjustment.sourceType,
      adjustment.paymentFormCode,
    );
    const prepared = await this.repository.prepareIssuance(
      id,
      dto,
      actor,
      idempotencyKey,
      providerKey,
    );
    if (prepared.replayed) return this.toReplay(prepared);
    if (!prepared.snapshot) {
      throw new ServiceUnavailableException('CREDIT_NOTE_SNAPSHOT_UNAVAILABLE');
    }
    try {
      const response = await this.provider.stamp({
        correlationId: prepared.correlationId,
        idempotencyKey: prepared.idempotencyKey,
        folio: prepared.folio,
        series: prepared.series,
        snapshot: prepared.snapshot,
      });
      let result: CreditNoteIssuanceResult;
      try {
        result = await this.repository.finalizeStamped(prepared, response);
      } catch {
        return this.repository.markPersistenceUnknown(prepared);
      }
      if (this.artifacts) {
        try {
          await this.artifacts.persistStampedArtifacts(
            prepared.invoiceId,
            response,
          );
        } catch {
          // Fiscal success remains authoritative; artifact recovery is separate.
        }
      }
      return result;
    } catch (error) {
      const failure =
        error instanceof FiscalProviderError
          ? { code: error.code, statusCode: error.statusCode }
          : { code: 'FISCAL_PROVIDER_UNKNOWN' as const, statusCode: null };
      return this.repository.finalizeFailure(
        prepared,
        this.classifyFailure(failure.code),
        failure,
      );
    }
  }

  private async validateCatalogs(
    sourceType: CreateCreditAdjustmentDto['sourceType'],
    paymentFormCode: string,
  ): Promise<void> {
    if (!this.catalogs) return;
    const required = [
      ['c_TipoDeComprobante', 'E'],
      ['c_UsoCFDI', 'G02'],
      ['c_FormaPago', paymentFormCode],
      ['c_MetodoPago', 'PUE'],
      ['c_TipoRelacion', sourceType === 'APPROVED_RETURN' ? '03' : '01'],
    ] as const;
    for (const [key, code] of required) {
      const catalog = await this.catalogs.get(key, { code });
      if (!catalog.configured) {
        throw new UnprocessableEntityException('SAT_CATALOG_NOT_CONFIGURED');
      }
      if (!catalog.entries.some((entry) => entry.code === code)) {
        throw new UnprocessableEntityException('SAT_CATALOG_CODE_NOT_FOUND');
      }
    }
  }

  private classifyFailure(code: string): CreditNoteIssuanceFailureOutcome {
    return [
      'FISCAL_PROVIDER_CONFIGURATION',
      'FISCAL_PROVIDER_CREDENTIALS_UNAVAILABLE',
      'FISCAL_PROVIDER_AUTHENTICATION',
      'FISCAL_PROVIDER_VALIDATION',
      'FISCAL_PROVIDER_NOT_FOUND',
    ].includes(code)
      ? 'TERMINAL_FAILURE'
      : 'UNKNOWN';
  }

  private toReplay(
    prepared: PreparedCreditNoteIssuance,
  ): CreditNoteIssuanceResult {
    return {
      creditAdjustmentId: prepared.creditAdjustmentId,
      invoiceId: prepared.invoiceId,
      attemptId: prepared.attemptId,
      fiscalStatus: prepared.fiscalStatus,
      operationStatus: prepared.operationStatus,
      adjustmentStatus: prepared.adjustmentStatus,
      uuid: prepared.uuid ?? null,
      replayed: true,
    };
  }
}
