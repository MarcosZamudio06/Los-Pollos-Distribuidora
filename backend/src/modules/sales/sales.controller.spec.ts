import { BadRequestException } from '@nestjs/common';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

describe('SalesController', () => {
  it('allows ADMIN, SELLER, and COLLECTIONS to read sale tickets', () => {
    expect(Reflect.getMetadata(ROLES_KEY, SalesController.prototype.getTicket)).toEqual(['ADMIN', 'SELLER', 'COLLECTIONS']);
  });

  it('passes current user to the sale ticket service', async () => {
    const service = { getTicket: jest.fn().mockResolvedValue({ saleNumber: 'SALE-000001' }) } as unknown as jest.Mocked<SalesService>;
    const controller = new SalesController(service);
    const user = { id: 'seller-1', email: 'seller@example.com', name: 'Seller', role: 'SELLER', mustChangePassword: false };

    const result = await controller.getTicket('sale-1', user);

    expect(service.getTicket).toHaveBeenCalledWith('sale-1', user);
    expect(result).toEqual({
      success: true,
      message: 'Sale ticket retrieved successfully',
      data: { saleNumber: 'SALE-000001' },
    });
  });

  it('allows ADMIN, SELLER, and COLLECTIONS to read sale documents', () => {
    expect(Reflect.getMetadata(ROLES_KEY, SalesController.prototype.getDocuments)).toEqual(['ADMIN', 'SELLER', 'COLLECTIONS']);
  });

  it('passes current user to the sale document service', async () => {
    const service = { findDocuments: jest.fn().mockResolvedValue({ items: [{ id: 'doc-1' }] }) } as unknown as jest.Mocked<SalesService>;
    const controller = new SalesController(service);
    const user = { id: 'seller-1', email: 'seller@example.com', name: 'Seller', role: 'SELLER', mustChangePassword: false };

    const result = await controller.getDocuments('sale-1', user);

    expect(service.findDocuments).toHaveBeenCalledWith('sale-1', user);
    expect(result).toEqual({
      success: true,
      message: 'Sale documents retrieved successfully',
      data: { items: [{ id: 'doc-1' }] },
    });
  });

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
