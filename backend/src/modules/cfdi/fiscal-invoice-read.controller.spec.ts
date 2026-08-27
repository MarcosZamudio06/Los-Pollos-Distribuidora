import { PATH_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { FiscalInvoiceReadController } from './fiscal-invoice-read.controller';

function methodOf(target: object, key: string): object {
  return Object.getOwnPropertyDescriptor(target, key)?.value as object;
}

describe('FiscalInvoiceReadController', () => {
  const service = {
    list: jest.fn().mockResolvedValue({ items: [], pagination: {} }),
    detail: jest.fn().mockResolvedValue({ id: 'invoice-1' }),
    status: jest.fn().mockResolvedValue({ invoiceId: 'invoice-1' }),
    cancellation: jest.fn().mockResolvedValue({
      invoiceId: 'invoice-1',
      state: 'PENDING',
    }),
  };
  const controller = new FiscalInvoiceReadController(service as never);
  const user = { id: 'billing-1', role: 'BILLING' } as never;

  it('exposes the canonical paths and ADMIN/BILLING-only roles', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, FiscalInvoiceReadController),
    ).toBe('billing/invoices');
    for (const method of [
      'list',
      'detail',
      'status',
      'cancellation',
    ] as const) {
      expect(
        Reflect.getMetadata(
          ROLES_KEY,
          methodOf(FiscalInvoiceReadController.prototype, method),
        ),
      ).toEqual(['ADMIN', 'BILLING']);
    }
  });

  it('delegates list, detail and status through the same read service', async () => {
    const query = { page: 1, limit: 25 } as never;
    await controller.list(query, user);
    await controller.detail('invoice-1', user);
    await controller.status('invoice-1', user);
    const cancellation = await controller.cancellation('invoice-1', user);

    expect(service.list).toHaveBeenCalledWith(query, user);
    expect(service.detail).toHaveBeenCalledWith('invoice-1', user);
    expect(service.status).toHaveBeenCalledWith('invoice-1', user);
    expect(service.cancellation).toHaveBeenCalledWith('invoice-1', user);
    expect(cancellation).toEqual({
      success: true,
      message: 'Fiscal cancellation status retrieved successfully',
      data: { invoiceId: 'invoice-1', state: 'PENDING' },
    });
  });
});
