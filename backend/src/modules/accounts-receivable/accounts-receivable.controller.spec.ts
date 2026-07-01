import { BadRequestException } from '@nestjs/common';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AccountsReceivableController } from './accounts-receivable.controller';
import { AccountsReceivableService } from './accounts-receivable.service';
import { PaymentMethod } from '@prisma/client';

describe('AccountsReceivableController', () => {

  it('does not expose list or detail routes to SELLER at the controller role gate', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AccountsReceivableController.prototype.findAll)).toEqual(['ADMIN', 'COLLECTIONS']);
    expect(Reflect.getMetadata(ROLES_KEY, AccountsReceivableController.prototype.findOne)).toEqual(['ADMIN', 'COLLECTIONS']);
  });

  it('passes the current user and Idempotency-Key to payment registration service', async () => {
    const service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      registerPayment: jest.fn().mockResolvedValue({ payment: { id: 'payment-1' } }),
    } as unknown as jest.Mocked<AccountsReceivableService>;
    const controller = new AccountsReceivableController(service);
    const user = { id: 'collector-1', email: 'c@example.com', name: 'Collector', role: 'COLLECTIONS', mustChangePassword: false };
    const body = { accountReceivableId: 'ar-1', amount: 100, paymentMethod: PaymentMethod.CASH };

    await controller.registerPayment('ar-1', body, user, 'idem-key');

    expect(service.registerPayment).toHaveBeenCalledWith('ar-1', body, user, 'idem-key');
  });

  it('rejects payment registration without Idempotency-Key', async () => {
    const service = { registerPayment: jest.fn() } as unknown as jest.Mocked<AccountsReceivableService>;
    const controller = new AccountsReceivableController(service);
    const user = { id: 'collector-1', email: 'c@example.com', name: 'Collector', role: 'COLLECTIONS', mustChangePassword: false };

    await expect(
      controller.registerPayment('ar-1', { accountReceivableId: 'ar-1', amount: 100, paymentMethod: PaymentMethod.CASH }, user, ' '),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
