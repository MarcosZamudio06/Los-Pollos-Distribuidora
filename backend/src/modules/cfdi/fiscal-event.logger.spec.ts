import { Logger } from '@nestjs/common';
import { FiscalEventLogger } from './fiscal-event.logger';

describe('FiscalEventLogger', () => {
  afterEach(() => jest.restoreAllMocks());

  it('emits a structured allowlisted fiscal event', () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const logger = new FiscalEventLogger();

    logger.emit('cfdi.stamp.started', {
      invoiceId: 'invoice-1',
      attemptId: 'attempt-1',
      correlationId: 'correlation-1',
    });

    expect(log).toHaveBeenCalledWith({
      event: 'cfdi.stamp.started',
      invoiceId: 'invoice-1',
      attemptId: 'attempt-1',
      correlationId: 'correlation-1',
    });
  });

  it('drops non-allowlisted, nested and oversized values', () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const logger = new FiscalEventLogger();

    logger.emit('cfdi.artifact.failed', {
      invoiceId: 'invoice-1',
      code: 'FISCAL_ARTIFACT_STORAGE_FAILURE',
      xml: '<cfdi:Comprobante>secret</cfdi:Comprobante>',
      password: 'secret',
      headers: { authorization: 'Basic secret' },
      state: 'x'.repeat(300),
    } as never);

    expect(error).toHaveBeenCalledWith({
      event: 'cfdi.artifact.failed',
      invoiceId: 'invoice-1',
      code: 'FISCAL_ARTIFACT_STORAGE_FAILURE',
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(error.mock.calls)).not.toContain('cfdi:Comprobante');
  });
});
