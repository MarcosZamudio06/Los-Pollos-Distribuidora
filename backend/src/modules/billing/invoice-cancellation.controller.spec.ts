import { BadRequestException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { InvoiceCancellationController } from './invoice-cancellation.controller';

function methodOf(target: object, key: string): object {
  return Object.getOwnPropertyDescriptor(target, key)?.value as object;
}

describe('InvoiceCancellationController', () => {
  const service = { cancel: jest.fn().mockResolvedValue({ id: 'invoice-1' }) };
  const controller = new InvoiceCancellationController(service as never);

  it('exposes POST /billing/invoices/:id/cancel for ADMIN and BILLING', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, InvoiceCancellationController),
    ).toBe('billing/invoices');
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        methodOf(InvoiceCancellationController.prototype, 'cancel'),
      ),
    ).toEqual(['ADMIN', 'BILLING']);
  });

  it('requires Idempotency-Key and delegates the command', async () => {
    await expect(
      controller.cancel(
        'invoice-1',
        {
          expectedVersion: 1,
          cancellationMotiveCode: '02',
          internalReason: 'Correction',
        },
        {} as never,
        undefined,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forwards only the validated fiscal cancellation command', async () => {
    const body = {
      expectedVersion: 1,
      cancellationMotiveCode: '01' as const,
      internalReason: 'Replace incorrect CFDI',
      replacementInvoiceId: 'invoice-2',
    };
    const actor = { id: 'billing-1', role: 'BILLING' } as never;

    await controller.cancel('invoice-1', body, actor, ' cancel-key ');

    expect(service.cancel).toHaveBeenCalledWith(
      'invoice-1',
      body,
      actor,
      'cancel-key',
    );
  });
});
