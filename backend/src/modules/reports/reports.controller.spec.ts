import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import type { AuthenticatedUser } from '../auth/auth.types';

describe('ReportsController', () => {
  const user: AuthenticatedUser = { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'ADMIN', mustChangePassword: false };

  function createController() {
    const service = {
      getDashboard: jest.fn().mockResolvedValue({ generatedAt: 'now' }),
      getSalesDaily: jest.fn().mockResolvedValue({ date: '2026-07-05' }),
      getInventoryLowStock: jest.fn().mockResolvedValue({ items: [] }),
      getCashClosing: jest.fn().mockResolvedValue({ cashSales: [] }),
      getInventoryByLocation: jest.fn().mockResolvedValue({ items: [] }),
      getAccountsReceivable: jest.fn().mockResolvedValue({ items: [] }),
      getDeliveryOperations: jest.fn().mockResolvedValue({ deliverySummary: {} }),
    } as unknown as jest.Mocked<ReportsService>;
    return { controller: new ReportsController(service), service };
  }

  it('exposes report endpoints with expected role metadata', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ReportsController.prototype.getDashboard)).toEqual(['ADMIN', 'SELLER', 'WAREHOUSE', 'COLLECTIONS', 'DRIVER']);
    expect(Reflect.getMetadata(ROLES_KEY, ReportsController.prototype.getSalesDaily)).toEqual(['ADMIN', 'SELLER']);
    expect(Reflect.getMetadata(ROLES_KEY, ReportsController.prototype.getInventoryLowStock)).toEqual(['ADMIN', 'WAREHOUSE']);
    expect(Reflect.getMetadata(ROLES_KEY, ReportsController.prototype.getCashClosing)).toEqual(['ADMIN', 'SELLER']);
    expect(Reflect.getMetadata(ROLES_KEY, ReportsController.prototype.getInventoryByLocation)).toEqual(['ADMIN', 'WAREHOUSE', 'SELLER']);
    expect(Reflect.getMetadata(ROLES_KEY, ReportsController.prototype.getAccountsReceivable)).toEqual(['ADMIN', 'COLLECTIONS']);
    expect(Reflect.getMetadata(ROLES_KEY, ReportsController.prototype.getDeliveryOperations)).toEqual(['ADMIN', 'COLLECTIONS', 'DRIVER']);
    expect(Object.getOwnPropertyNames(ReportsController.prototype).filter((name) => name !== 'constructor').sort()).toEqual([
      'getAccountsReceivable',
      'getCashClosing',
      'getDashboard',
      'getDeliveryOperations',
      'getInventoryByLocation',
      'getInventoryLowStock',
      'getSalesDaily',
    ]);
  });

  it('wraps dashboard response and passes query/current user to service', async () => {
    const { controller, service } = createController();
    const query = { date: '2026-07-05', locationId: 'loc-1' };

    await expect(controller.getDashboard(query, user)).resolves.toEqual({ success: true, message: 'Dashboard report retrieved successfully', data: { generatedAt: 'now' } });
    expect(service.getDashboard).toHaveBeenCalledWith(query, user);
  });

  it('wraps sales-daily response and passes query/current user to service', async () => {
    const { controller, service } = createController();
    const query = { date: '2026-07-05', paymentType: 'CASH_SALE' as const };

    await expect(controller.getSalesDaily(query, user)).resolves.toEqual({ success: true, message: 'Daily sales report retrieved successfully', data: { date: '2026-07-05' } });
    expect(service.getSalesDaily).toHaveBeenCalledWith(query, user);
  });

  it('wraps inventory low stock response and passes query/current user to service', async () => {
    const { controller, service } = createController();
    const query = { locationId: 'loc-1', page: 1, limit: 20 };

    await expect(controller.getInventoryLowStock(query, user)).resolves.toEqual({ success: true, message: 'Low stock report retrieved successfully', data: { items: [] } });
    expect(service.getInventoryLowStock).toHaveBeenCalledWith(query, user);
  });

  it('wraps cash closing response and passes query/current user to service', async () => {
    const { controller, service } = createController();
    const query = { date: '2026-07-05', locationId: 'loc-1' };

    await expect(controller.getCashClosing(query, user)).resolves.toEqual({ success: true, message: 'Cash closing report retrieved successfully', data: { cashSales: [] } });
    expect(service.getCashClosing).toHaveBeenCalledWith(query, user);
  });

  it('wraps inventory-by-location response and passes query/current user to service', async () => {
    const { controller, service } = createController();
    const query = { locationId: 'loc-1', search: 'pollo' };

    await expect(controller.getInventoryByLocation(query, user)).resolves.toEqual({ success: true, message: 'Inventory by location report retrieved successfully', data: { items: [] } });
    expect(service.getInventoryByLocation).toHaveBeenCalledWith(query, user);
  });

  it('wraps accounts-receivable response and passes query/current user to service', async () => {
    const { controller, service } = createController();
    const query = { onlyOverdue: true };

    await expect(controller.getAccountsReceivable(query, user)).resolves.toEqual({ success: true, message: 'Accounts receivable report retrieved successfully', data: { items: [] } });
    expect(service.getAccountsReceivable).toHaveBeenCalledWith(query, user);
  });

  it('wraps delivery-operations response and passes query/current user to service', async () => {
    const { controller, service } = createController();
    const query = { driverId: 'driver-1' };

    await expect(controller.getDeliveryOperations(query, user)).resolves.toEqual({ success: true, message: 'Delivery operations report retrieved successfully', data: { deliverySummary: {} } });
    expect(service.getDeliveryOperations).toHaveBeenCalledWith(query, user);
  });
});
