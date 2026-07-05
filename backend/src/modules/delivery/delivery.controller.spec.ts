import { BadRequestException } from '@nestjs/common';
import { DeliveryEvidenceType, DeliveryOrderStatus, PaymentMethod } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { DeliveryController } from './delivery.controller';
import { DeliveryOrdersController } from './delivery-orders.controller';
import { RouteSettlementsController } from './route-settlements.controller';
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
    expect(Reflect.getMetadata(ROLES_KEY, DeliveryController.prototype.assignOrders)).toEqual(['ADMIN']);
    expect(Reflect.getMetadata(ROLES_KEY, DeliveryController.prototype.updateStatus)).toEqual(['ADMIN', 'DRIVER']);
    expect(Reflect.getMetadata(ROLES_KEY, DeliveryOrdersController.prototype.updateStatus)).toEqual(['ADMIN', 'DRIVER']);
    expect(Reflect.getMetadata(ROLES_KEY, DeliveryOrdersController.prototype.captureEvidence)).toEqual(['ADMIN', 'DRIVER']);
    expect(Reflect.getMetadata(ROLES_KEY, DeliveryOrdersController.prototype.registerCollection)).toEqual([
      'ADMIN',
      'DRIVER',
      'COLLECTIONS',
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, DeliveryOrdersController.prototype.registerIncident)).toEqual(['ADMIN', 'DRIVER']);
    expect(Reflect.getMetadata(ROLES_KEY, DeliveryController.prototype.openSettlement)).toEqual(['ADMIN', 'COLLECTIONS']);
    expect(Reflect.getMetadata(ROLES_KEY, RouteSettlementsController.prototype.close)).toEqual(['ADMIN', 'COLLECTIONS']);
    expect(Reflect.getMetadata(ROLES_KEY, RouteSettlementsController.prototype.reopen)).toEqual(['ADMIN']);
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

  it('passes route order assignment to the service with the current user', async () => {
    const service = {
      assignOrdersToRoute: jest.fn().mockResolvedValue({ id: 'route-1', orders: [{ id: 'order-2' }] }),
    } as unknown as jest.Mocked<DeliveryService>;
    const controller = new DeliveryController(service);
    const user = { id: 'admin-1', email: 'a@example.com', name: 'Admin', role: 'ADMIN', mustChangePassword: false };
    const body = { orders: [{ saleId: 'sale-2', accountReceivableId: 'ar-2', deliveryAddress: 'Av Norte 456' }] };

    await expect(controller.assignOrders('route-1', body, user)).resolves.toEqual({
      success: true,
      message: 'Delivery route orders assigned successfully',
      data: { id: 'route-1', orders: [{ id: 'order-2' }] },
    });
    expect(service.assignOrdersToRoute).toHaveBeenCalledWith('route-1', body, user);
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

  it('rejects route order assignment with no orders', async () => {
    const service = { assignOrdersToRoute: jest.fn() } as unknown as jest.Mocked<DeliveryService>;
    const controller = new DeliveryController(service);
    const user = { id: 'admin-1', email: 'a@example.com', name: 'Admin', role: 'ADMIN', mustChangePassword: false };

    await expect(controller.assignOrders('route-1', { orders: [] }, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.assignOrdersToRoute).not.toHaveBeenCalled();
  });

  it('passes evidence, collection, incident, and settlement commands to the service with the current user', async () => {
    const service = {
      captureEvidence: jest.fn().mockResolvedValue({ id: 'evidence-1' }),
      registerCollection: jest.fn().mockResolvedValue({ payment: { id: 'payment-1' } }),
      registerIncident: jest.fn().mockResolvedValue({ deliveryOrder: { id: 'order-1' } }),
      openSettlement: jest.fn().mockResolvedValue({ id: 'settlement-1' }),
      closeSettlement: jest.fn().mockResolvedValue({ id: 'settlement-1', status: 'CLOSED' }),
      reopenSettlement: jest.fn().mockResolvedValue({ id: 'settlement-1', status: 'OPEN' }),
    } as unknown as jest.Mocked<DeliveryService>;
    const routeController = new DeliveryController(service);
    const orderController = new DeliveryOrdersController(service);
    const settlementController = new RouteSettlementsController(service);
    const user = { id: 'driver-1', email: 'd@example.com', name: 'Driver', role: 'DRIVER', mustChangePassword: false };

    const evidenceDto = {
      type: DeliveryEvidenceType.NOTE,
      value: 'Entregado en recepción',
      capturedAt: '2026-06-19T12:05:00.000Z',
    };
    const collectionDto = { accountReceivableId: 'ar-1', amount: 100, paymentMethod: PaymentMethod.CASH };
    const incidentDto = { status: DeliveryOrderStatus.RETURNED, reason: 'Cliente devolvió producto' };

    await expect(orderController.captureEvidence('order-1', evidenceDto, user)).resolves.toEqual({
      success: true,
      message: 'Delivery evidence captured successfully',
      data: { id: 'evidence-1' },
    });
    await expect(orderController.registerCollection('order-1', collectionDto, user)).resolves.toEqual({
      success: true,
      message: 'Route collection registered successfully',
      data: { payment: { id: 'payment-1' } },
    });
    await expect(orderController.registerIncident('order-1', incidentDto, user)).resolves.toEqual({
      success: true,
      message: 'Delivery incident registered successfully',
      data: { deliveryOrder: { id: 'order-1' } },
    });
    await expect(routeController.openSettlement('route-1', user)).resolves.toEqual({
      success: true,
      message: 'Route settlement calculated successfully',
      data: { id: 'settlement-1' },
    });
    await expect(settlementController.close('settlement-1', { expectedVersion: 3, notes: 'Ok' }, user, 'close-idem')).resolves.toEqual({
      success: true,
      message: 'Route settlement closed successfully',
      data: { id: 'settlement-1', status: 'CLOSED' },
    });
    await expect(settlementController.reopen('settlement-1', { expectedVersion: 4, reason: 'Review' }, user, 'reopen-idem')).resolves.toEqual({
      success: true,
      message: 'Route settlement reopened successfully',
      data: { id: 'settlement-1', status: 'OPEN' },
    });

    expect(service.captureEvidence).toHaveBeenCalledWith('order-1', evidenceDto, user);
    expect(service.registerCollection).toHaveBeenCalledWith('order-1', collectionDto, user);
    expect(service.registerIncident).toHaveBeenCalledWith('order-1', incidentDto, user);
    expect(service.openSettlement).toHaveBeenCalledWith('route-1', user);
    expect(service.closeSettlement).toHaveBeenCalledWith('settlement-1', { expectedVersion: 3, notes: 'Ok' }, user, 'close-idem');
    expect(service.reopenSettlement).toHaveBeenCalledWith('settlement-1', { expectedVersion: 4, reason: 'Review' }, user, 'reopen-idem');
  });
});
