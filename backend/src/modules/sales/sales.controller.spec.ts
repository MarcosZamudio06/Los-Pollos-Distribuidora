import { BadRequestException } from '@nestjs/common';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

function mockOf<T extends object>(target: T, key: keyof T): jest.Mock {
  return target[key] as jest.Mock;
}

function methodOf(target: object, key: string): object {
  return Object.getOwnPropertyDescriptor(target, key)?.value as object;
}

describe('SalesController', () => {
  it('allows ADMIN, SELLER, and COLLECTIONS to print a sale document', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        methodOf(SalesController.prototype, 'getDocumentPrint'),
      ),
    ).toEqual(['ADMIN', 'SELLER', 'COLLECTIONS']);
  });

  it('passes the exact sale document to the print service', async () => {
    const service = {
      getDocumentPrint: jest.fn().mockResolvedValue({ ticketId: 'doc-1' }),
    } as unknown as jest.Mocked<SalesService>;
    const controller = new SalesController(service);
    const user = {
      id: 'seller-1',
      email: 'seller@example.com',
      name: 'Seller',
      role: 'SELLER',
      mustChangePassword: false,
    };

    const result = await controller.getDocumentPrint('sale-1', 'doc-1', user);

    expect(mockOf(service, 'getDocumentPrint')).toHaveBeenCalledWith(
      'sale-1',
      'doc-1',
      user,
    );
    expect(result).toEqual({
      success: true,
      message: 'Sale document print data retrieved successfully',
      data: { ticketId: 'doc-1' },
    });
  });

  it('allows ADMIN, SELLER, and COLLECTIONS to read sale documents', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        methodOf(SalesController.prototype, 'getDocuments'),
      ),
    ).toEqual(['ADMIN', 'SELLER', 'COLLECTIONS']);
  });

  it('passes current user to the sale document service', async () => {
    const service = {
      findDocuments: jest.fn().mockResolvedValue({ items: [{ id: 'doc-1' }] }),
    } as unknown as jest.Mocked<SalesService>;
    const controller = new SalesController(service);
    const user = {
      id: 'seller-1',
      email: 'seller@example.com',
      name: 'Seller',
      role: 'SELLER',
      mustChangePassword: false,
    };

    const result = await controller.getDocuments('sale-1', user);

    expect(mockOf(service, 'findDocuments')).toHaveBeenCalledWith(
      'sale-1',
      user,
    );
    expect(result).toEqual({
      success: true,
      message: 'Sale documents retrieved successfully',
      data: { items: [{ id: 'doc-1' }] },
    });
  });

  it('restricts sale cancellation to ADMIN only', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        methodOf(SalesController.prototype, 'cancel'),
      ),
    ).toEqual(['ADMIN']);
  });

  it('passes current user to the sale cancellation service', async () => {
    const service = {
      cancel: jest.fn().mockResolvedValue({ sale: { id: 'sale-1' } }),
    } as unknown as jest.Mocked<SalesService>;
    const controller = new SalesController(service);
    const user = {
      id: 'admin-1',
      email: 'a@example.com',
      name: 'Admin',
      role: 'ADMIN',
      mustChangePassword: false,
    };
    const body = { reason: 'Cliente canceló pedido', expectedVersion: 1 };

    await controller.cancel('sale-1', body, user, 'cancel-key-1');

    expect(mockOf(service, 'cancel')).toHaveBeenCalledWith(
      'sale-1',
      body,
      user,
      'cancel-key-1',
    );
  });

  it('rejects sale cancellation without reason', async () => {
    const service = {
      cancel: jest.fn(),
    } as unknown as jest.Mocked<SalesService>;
    const controller = new SalesController(service);
    const user = {
      id: 'admin-1',
      email: 'a@example.com',
      name: 'Admin',
      role: 'ADMIN',
      mustChangePassword: false,
    };

    await expect(
      controller.cancel(
        'sale-1',
        { reason: ' ', expectedVersion: 1 },
        user,
        'cancel-key-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires Idempotency-Key for sale cancellation', async () => {
    const service = {
      cancel: jest.fn(),
    } as unknown as jest.Mocked<SalesService>;
    const controller = new SalesController(service);
    const user = {
      id: 'admin-1',
      email: 'a@example.com',
      name: 'Admin',
      role: 'ADMIN',
      mustChangePassword: false,
    };

    await expect(
      controller.cancel(
        'sale-1',
        { reason: 'Cliente canceló pedido', expectedVersion: 1 },
        user,
        '  ',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockOf(service, 'cancel')).not.toHaveBeenCalled();
  });

  it('restricts administrative sale voiding and preview to ADMIN only', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        methodOf(SalesController.prototype, 'voidPreview'),
      ),
    ).toEqual(['ADMIN']);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        methodOf(SalesController.prototype, 'voidSale'),
      ),
    ).toEqual(['ADMIN']);
  });

  it('returns the administrative void preview', async () => {
    const service = {
      getVoidPreview: jest.fn().mockResolvedValue({ canExecute: true }),
    } as unknown as jest.Mocked<SalesService>;
    const controller = new SalesController(service);
    const user = {
      id: 'admin-1',
      email: 'a@example.com',
      name: 'Admin',
      role: 'ADMIN',
      mustChangePassword: false,
    };

    await expect(controller.voidPreview('sale-1', user)).resolves.toEqual({
      success: true,
      message: 'Sale void preview retrieved successfully',
      data: { canExecute: true },
    });
    expect(mockOf(service, 'getVoidPreview')).toHaveBeenCalledWith(
      'sale-1',
      user,
    );
  });

  it('passes the administrative void command and idempotency key to the service', async () => {
    const service = {
      voidSale: jest
        .fn()
        .mockResolvedValue({ sale: { id: 'sale-1', status: 'CANCELLED' } }),
    } as unknown as jest.Mocked<SalesService>;
    const controller = new SalesController(service);
    const user = {
      id: 'admin-1',
      email: 'a@example.com',
      name: 'Admin',
      role: 'ADMIN',
      mustChangePassword: false,
    };
    const body = { reason: 'Cliente devolvió el pedido', expectedVersion: 4 };

    await expect(
      controller.voidSale('sale-1', body, user, 'void-key-1'),
    ).resolves.toEqual({
      success: true,
      message: 'Sale voided successfully',
      data: { sale: { id: 'sale-1', status: 'CANCELLED' } },
    });
    expect(mockOf(service, 'voidSale')).toHaveBeenCalledWith(
      'sale-1',
      body,
      user,
      'void-key-1',
    );
  });

  it('requires reason and Idempotency-Key for administrative voiding', async () => {
    const service = {
      voidSale: jest.fn(),
    } as unknown as jest.Mocked<SalesService>;
    const controller = new SalesController(service);
    const user = {
      id: 'admin-1',
      email: 'a@example.com',
      name: 'Admin',
      role: 'ADMIN',
      mustChangePassword: false,
    };

    await expect(
      controller.voidSale(
        'sale-1',
        { reason: ' ', expectedVersion: 4 },
        user,
        'void-key-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.voidSale(
        'sale-1',
        { reason: 'Cliente devolvió', expectedVersion: 4 },
        user,
        '  ',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockOf(service, 'voidSale')).not.toHaveBeenCalled();
  });
});
