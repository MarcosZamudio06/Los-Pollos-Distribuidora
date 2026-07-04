import { BadRequestException } from '@nestjs/common';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { DeliveryController } from './delivery.controller';
import { DeliveryOrdersController } from './delivery-orders.controller';
import { DeliveryService } from './delivery.service';

describe('Delivery controllers', () => {
  it('exposes delivery route endpoint permissions from the spec', () => {
    expect(Reflect.getMetadata(ROLES_KEY, DeliveryController.prototype.findAll)).toEqual([
      'ADMIN',
      'DRIVER',
      'COLLECTIONS',
      'WAREHOUSE',
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, DeliveryController.prototype.findOne)).toEqual([
      'ADMIN',
      'DRIVER',
      'COLLECTIONS',
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, DeliveryController.prototype.create)).toEqual(['ADMIN']);
    expect(Reflect.getMetadata(ROLES_KEY, DeliveryController.prototype.updateStatus)).toEqual(['ADMIN', 'DRIVER']);
    expect(Reflect.getMetadata(ROLES_KEY, DeliveryOrdersController.prototype.updateStatus)).toEqual(['ADMIN', 'DRIVER']);
  });

  it('passes route and order status requests to the service with the current user', async () => {
    const service = {
      updateRouteStatus: jest.fn().mockResolvedValue({ id: 'route-1', status: 'IN_PROGRESS' }),
      updateOrderStatus: jest.fn().mockResolvedValue({ id: 'order-1', status: 'DELIVERED' }),
    } as unknown as jest.Mocked<DeliveryService>;
    const routeController = new DeliveryController(service);
    const orderController = new DeliveryOrdersController(service);
    const user = { id: 'driver-1', email: 'd@example.com', name: 'Driver', role: 'DRIVER', mustChangePassword: false };

    await expect(routeController.updateStatus('route-1', { status: 'IN_PROGRESS' as never }, user)).resolves.toEqual({
      success: true,
      message: 'Delivery route status updated successfully',
      data: { id: 'route-1', status: 'IN_PROGRESS' },
    });
    await expect(orderController.updateStatus('order-1', { status: 'DELIVERED' as never }, user)).resolves.toEqual({
      success: true,
      message: 'Delivery order status updated successfully',
      data: { id: 'order-1', status: 'DELIVERED' },
    });

    expect(service.updateRouteStatus).toHaveBeenCalledWith('route-1', { status: 'IN_PROGRESS' }, user);
    expect(service.updateOrderStatus).toHaveBeenCalledWith('order-1', { status: 'DELIVERED' }, user);
  });

  it('rejects route creation with no orders', async () => {
    const service = { createRoute: jest.fn() } as unknown as jest.Mocked<DeliveryService>;
    const controller = new DeliveryController(service);
    const user = { id: 'admin-1', email: 'a@example.com', name: 'Admin', role: 'ADMIN', mustChangePassword: false };

    await expect(
      controller.create({ name: 'Ruta Centro', driverId: 'driver-1', scheduledDate: '2026-06-19', orders: [] }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.createRoute).not.toHaveBeenCalled();
  });
});
