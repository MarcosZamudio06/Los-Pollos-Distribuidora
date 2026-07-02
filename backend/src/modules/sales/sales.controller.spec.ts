import { BadRequestException } from '@nestjs/common';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

describe('SalesController', () => {
  it('restricts sale cancellation to ADMIN only', () => {
    expect(Reflect.getMetadata(ROLES_KEY, SalesController.prototype.cancel)).toEqual(['ADMIN']);
  });

  it('passes current user to the sale cancellation service', async () => {
    const service = { cancel: jest.fn().mockResolvedValue({ sale: { id: 'sale-1' } }) } as unknown as jest.Mocked<SalesService>;
    const controller = new SalesController(service);
    const user = { id: 'admin-1', email: 'a@example.com', name: 'Admin', role: 'ADMIN', mustChangePassword: false };
    const body = { reason: 'Cliente canceló pedido', expectedVersion: 1 };

    await controller.cancel('sale-1', body, user, 'cancel-key-1');

    expect(service.cancel).toHaveBeenCalledWith('sale-1', body, user, 'cancel-key-1');
  });

  it('rejects sale cancellation without reason', async () => {
    const service = { cancel: jest.fn() } as unknown as jest.Mocked<SalesService>;
    const controller = new SalesController(service);
    const user = { id: 'admin-1', email: 'a@example.com', name: 'Admin', role: 'ADMIN', mustChangePassword: false };

    await expect(controller.cancel('sale-1', { reason: ' ', expectedVersion: 1 }, user, 'cancel-key-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires Idempotency-Key for sale cancellation', async () => {
    const service = { cancel: jest.fn() } as unknown as jest.Mocked<SalesService>;
    const controller = new SalesController(service);
    const user = { id: 'admin-1', email: 'a@example.com', name: 'Admin', role: 'ADMIN', mustChangePassword: false };

    await expect(controller.cancel('sale-1', { reason: 'Cliente canceló pedido', expectedVersion: 1 }, user, '  ')).rejects.toBeInstanceOf(BadRequestException);
    expect(service.cancel).not.toHaveBeenCalled();
  });

});
