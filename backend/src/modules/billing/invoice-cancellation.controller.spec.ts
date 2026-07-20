import { BadRequestException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { InvoiceCancellationController } from './invoice-cancellation.controller';

describe('InvoiceCancellationController', () => {
  const service = { cancel: jest.fn().mockResolvedValue({ id: 'invoice-1' }) };
  const controller = new InvoiceCancellationController(service as never);

  it('exposes POST /billing/invoices/:id/cancel for ADMIN and BILLING', () => {
    expect(Reflect.getMetadata(PATH_METADATA, InvoiceCancellationController)).toBe('billing/invoices');
    expect(Reflect.getMetadata(ROLES_KEY, InvoiceCancellationController.prototype.cancel)).toEqual(['ADMIN', 'BILLING']);
  });

  it('requires Idempotency-Key and delegates the command', async () => {
    await expect(controller.cancel('invoice-1', { expectedVersion: 1, reason: 'Correction' }, {} as never, undefined)).rejects.toBeInstanceOf(BadRequestException);
  });
});
