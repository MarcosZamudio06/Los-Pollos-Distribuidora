import { Injectable, Logger } from '@nestjs/common';

export type FiscalEventName =
  | `cfdi.stamp.${'started' | 'completed' | 'failed' | 'unknown'}`
  | `cfdi.reconciliation.${
      'started' | 'completed' | 'failed' | 'unknown' | 'skipped'}`
  | `cfdi.cancel.${
      | 'started'
      | 'completed'
      | 'failed'
      | 'unknown'
      | 'reconciliation.started'
      | 'reconciliation.completed'
      | 'reconciliation.failed'
      | 'reconciliation.unknown'}`
  | `cfdi.artifact.${'started' | 'completed' | 'failed'}`
  | `cfdi.rep.${'started' | 'completed' | 'failed' | 'unknown'}`
  | `cfdi.certificate.expiry.${
      'started' | 'completed' | 'failed' | 'expiring' | 'expired'}`;

export type FiscalEventFields = Partial<
  Record<
    | 'invoiceId'
    | 'attemptId'
    | 'billingRequestId'
    | 'paymentId'
    | 'paymentReceiptId'
    | 'correlationId'
    | 'legalEntityId'
    | 'artifactType'
    | 'providerKey'
    | 'operation'
    | 'state'
    | 'code'
    | 'at'
    | 'nextRetryAt'
    | 'started'
    | 'recovered'
    | 'notFound'
    | 'stillUnknown'
    | 'pending'
    | 'rejected'
    | 'failed'
    | 'checked'
    | 'expiring'
    | 'expired'
    | 'daysRemaining'
    | 'skipped'
    | 'replayed',
    string | number | boolean | null
  >
>;

const ALLOWED_FIELDS = new Set<string>([
  'invoiceId',
  'attemptId',
  'billingRequestId',
  'paymentId',
  'paymentReceiptId',
  'correlationId',
  'legalEntityId',
  'artifactType',
  'providerKey',
  'operation',
  'state',
  'code',
  'at',
  'nextRetryAt',
  'started',
  'recovered',
  'notFound',
  'stillUnknown',
  'pending',
  'rejected',
  'failed',
  'checked',
  'expiring',
  'expired',
  'daysRemaining',
  'skipped',
  'replayed',
]);

const MAX_FIELD_LENGTH = 256;

@Injectable()
export class FiscalEventLogger {
  private readonly logger = new Logger(FiscalEventLogger.name);

  emit(event: FiscalEventName, fields: FiscalEventFields = {}): void {
    const record: Record<string, string | number | boolean | null> = { event };
    for (const [key, value] of Object.entries(fields)) {
      if (!ALLOWED_FIELDS.has(key)) continue;
      if (
        value === null ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        record[key] = value;
        continue;
      }
      if (typeof value === 'string' && value.length <= MAX_FIELD_LENGTH) {
        record[key] = value;
      }
    }

    if (event.endsWith('.failed')) {
      this.logger.error(record);
    } else if (
      event.endsWith('.unknown') ||
      event.endsWith('.expired') ||
      event.endsWith('.expiring')
    ) {
      this.logger.warn(record);
    } else {
      this.logger.log(record);
    }
  }
}
