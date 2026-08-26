import {
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  FISCAL_PROVIDER_PORT,
  FiscalProviderError,
  type FiscalProviderPort,
} from './domain/fiscal-provider.port';
import { FiscalArtifactService } from './fiscal-artifact.service';
import { RepIssuanceRepository } from './rep-issuance.repository';
import type { IssuePaymentCfdiDto } from './dto/issue-payment-cfdi.dto';
import type {
  PreparedRepIssuance,
  RepIssuanceFailureOutcome,
  RepIssuanceResult,
} from './rep-issuance.types';
import { FiscalEventLogger } from './fiscal-event.logger';

@Injectable()
export class RepIssuanceService {
  constructor(
    private readonly repository: RepIssuanceRepository,
    @Inject(FISCAL_PROVIDER_PORT)
    private readonly provider: FiscalProviderPort,
    @Optional() private readonly artifacts?: FiscalArtifactService,
    @Optional() private readonly events?: FiscalEventLogger,
  ) {}

  async issue(
    paymentId: string,
    dto: IssuePaymentCfdiDto,
    actor: Pick<AuthenticatedUser, 'id' | 'role'>,
    idempotencyKey: string,
  ): Promise<RepIssuanceResult> {
    const providerKey = this.provider.providerKey;
    const prepared = await this.repository.prepare(
      paymentId,
      dto,
      actor,
      idempotencyKey,
      providerKey,
    );
    this.events?.emit('cfdi.rep.started', {
      paymentId,
      paymentReceiptId: prepared.paymentReceiptId,
      invoiceId: prepared.invoiceId,
      attemptId: prepared.attemptId,
      correlationId: prepared.correlationId,
      providerKey,
    });
    if (prepared.replayed) {
      const replay = this.toReplay(prepared);
      this.events?.emit('cfdi.rep.completed', {
        paymentId,
        paymentReceiptId: prepared.paymentReceiptId,
        invoiceId: prepared.invoiceId,
        attemptId: prepared.attemptId,
        state: prepared.fiscalStatus,
        replayed: true,
      });
      return replay;
    }
    if (!prepared.snapshot) {
      this.events?.emit('cfdi.rep.failed', {
        paymentId,
        invoiceId: prepared.invoiceId,
        attemptId: prepared.attemptId,
        code: 'REP_SNAPSHOT_UNAVAILABLE',
      });
      throw new ServiceUnavailableException('REP_SNAPSHOT_UNAVAILABLE');
    }

    try {
      const response = await this.provider.stamp({
        correlationId: prepared.correlationId,
        idempotencyKey: prepared.idempotencyKey,
        folio: prepared.folio,
        series: prepared.series,
        snapshot: prepared.snapshot,
      });
      let result: RepIssuanceResult;
      try {
        result = await this.repository.finalizeStamped(prepared, response);
      } catch {
        const unknown = await this.repository.markPersistenceUnknown(prepared);
        this.events?.emit('cfdi.rep.unknown', {
          paymentId,
          paymentReceiptId: prepared.paymentReceiptId,
          invoiceId: prepared.invoiceId,
          attemptId: prepared.attemptId,
          correlationId: prepared.correlationId,
          code: 'REP_RESULT_PERSISTENCE_FAILED',
        });
        return unknown;
      }
      if (this.artifacts) {
        try {
          await this.artifacts.persistStampedArtifacts(
            prepared.invoiceId,
            response,
          );
        } catch {
          // Fiscal success is authoritative; artifact recovery is independent.
        }
      }
      this.events?.emit('cfdi.rep.completed', {
        paymentId,
        paymentReceiptId: prepared.paymentReceiptId,
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
          : { code: 'FISCAL_PROVIDER_UNKNOWN' as const, statusCode: null };
      const outcome = this.classifyFailure(failure.code);
      const result = await this.repository.finalizeFailure(
        prepared,
        outcome,
        failure,
      );
      this.events?.emit(
        outcome === 'UNKNOWN' ? 'cfdi.rep.unknown' : 'cfdi.rep.failed',
        {
          paymentId,
          paymentReceiptId: prepared.paymentReceiptId,
          invoiceId: prepared.invoiceId,
          attemptId: prepared.attemptId,
          correlationId: prepared.correlationId,
          code: failure.code,
        },
      );
      return result;
    }
  }

  private classifyFailure(code: string): RepIssuanceFailureOutcome {
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

  private toReplay(prepared: PreparedRepIssuance): RepIssuanceResult {
    return {
      paymentId: prepared.paymentId,
      invoiceId: prepared.invoiceId,
      paymentReceiptId: prepared.paymentReceiptId,
      paymentReceiptDetailId: prepared.paymentReceiptDetailId,
      attemptId: prepared.attemptId,
      fiscalStatus: prepared.fiscalStatus,
      operationStatus: prepared.operationStatus,
      uuid: prepared.uuid ?? null,
      replayed: true,
    };
  }
}
