import {
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { IssueCfdiDto } from '../billing-requests/dto';
import {
  FISCAL_PROVIDER_PORT,
  FiscalProviderError,
  type FiscalProviderPort,
} from './domain/fiscal-provider.port';
import { CfdiIssuanceRepository } from './cfdi-issuance.repository';
import { FiscalArtifactService } from './fiscal-artifact.service';
import type {
  CfdiIssuanceResult,
  FiscalIssuanceFailureOutcome,
} from './cfdi-issuance.types';
import { FiscalEventLogger } from './fiscal-event.logger';

@Injectable()
export class CfdiIssuanceService {
  constructor(
    private readonly repository: CfdiIssuanceRepository,
    @Inject(FISCAL_PROVIDER_PORT)
    private readonly provider: FiscalProviderPort,
    @Optional() private readonly artifacts?: FiscalArtifactService,
    @Optional() private readonly events?: FiscalEventLogger,
  ) {}

  async issue(
    billingRequestId: string,
    dto: IssueCfdiDto,
    actor: Pick<AuthenticatedUser, 'id' | 'role'>,
    idempotencyKey: string,
  ): Promise<CfdiIssuanceResult> {
    const providerKey = this.provider.providerKey;

    const prepared = await this.repository.prepare(
      billingRequestId,
      dto,
      actor,
      idempotencyKey,
      providerKey,
    );
    this.events?.emit('cfdi.stamp.started', {
      billingRequestId,
      invoiceId: prepared.invoiceId,
      attemptId: prepared.attemptId,
      correlationId: prepared.correlationId,
      providerKey,
    });
    if (prepared.replayed) {
      const replay = this.toReplay(prepared);
      this.events?.emit('cfdi.stamp.completed', {
        billingRequestId,
        invoiceId: prepared.invoiceId,
        attemptId: prepared.attemptId,
        state: prepared.fiscalStatus,
        replayed: true,
      });
      return replay;
    }
    if (!prepared.snapshot) {
      this.events?.emit('cfdi.stamp.failed', {
        billingRequestId,
        invoiceId: prepared.invoiceId,
        attemptId: prepared.attemptId,
        code: 'CFDI_SNAPSHOT_UNAVAILABLE',
      });
      throw new ServiceUnavailableException('CFDI_SNAPSHOT_UNAVAILABLE');
    }

    try {
      const response = await this.provider.stamp({
        correlationId: prepared.correlationId,
        idempotencyKey: prepared.idempotencyKey,
        folio: prepared.folio,
        series: prepared.series,
        snapshot: prepared.snapshot,
      });
      let result: CfdiIssuanceResult;
      try {
        result = await this.repository.finalizeStamped(prepared, response);
      } catch {
        const unknown = await this.repository.markPersistenceUnknown(
          prepared,
          'STAMP_RESULT_PERSISTENCE_FAILED',
        );
        this.events?.emit('cfdi.stamp.unknown', {
          billingRequestId,
          invoiceId: prepared.invoiceId,
          attemptId: prepared.attemptId,
          correlationId: prepared.correlationId,
          code: 'STAMP_RESULT_PERSISTENCE_FAILED',
        });
        return unknown;
      }
      // Storage is a post-stamp reconciliation concern. A storage/provider
      // artifact failure must never downgrade a fiscal success to UNKNOWN.
      if (this.artifacts) {
        try {
          await this.artifacts.persistStampedArtifacts(
            prepared.invoiceId,
            response,
          );
        } catch {
          // FiscalArtifactService records recoverable inconsistency metadata.
        }
      }
      this.events?.emit('cfdi.stamp.completed', {
        billingRequestId,
        invoiceId: prepared.invoiceId,
        attemptId: prepared.attemptId,
        correlationId: prepared.correlationId,
        state: result.fiscalStatus,
      });
      return result;
    } catch (error) {
      const failure =
        error instanceof FiscalProviderError
          ? { code: error.code, statusCode: error.statusCode }
          : {
              code: 'FISCAL_PROVIDER_UNKNOWN' as const,
              statusCode: null,
            };
      const outcome = this.classifyFailure(failure.code);
      const result = await this.repository.finalizeFailure(
        prepared,
        outcome,
        failure,
      );
      this.events?.emit(
        outcome === 'UNKNOWN' ? 'cfdi.stamp.unknown' : 'cfdi.stamp.failed',
        {
          billingRequestId,
          invoiceId: prepared.invoiceId,
          attemptId: prepared.attemptId,
          correlationId: prepared.correlationId,
          code: failure.code,
        },
      );
      return result;
    }
  }

  private classifyFailure(code: string): FiscalIssuanceFailureOutcome {
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
    prepared: Parameters<CfdiIssuanceRepository['finalizeStamped']>[0],
  ): CfdiIssuanceResult {
    return {
      billingRequestId: prepared.billingRequestId,
      invoiceId: prepared.invoiceId,
      attemptId: prepared.attemptId,
      fiscalStatus: prepared.fiscalStatus,
      operationStatus: prepared.operationStatus,
      uuid: prepared.uuid ?? null,
      replayed: true,
    };
  }
}
