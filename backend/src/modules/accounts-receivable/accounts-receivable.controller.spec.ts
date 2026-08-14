import { BadRequestException } from '@nestjs/common';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AccountsReceivableController } from './accounts-receivable.controller';
import { AccountsReceivableService } from './accounts-receivable.service';
import { PaymentMethod } from '@prisma/client';

function mockOf<T extends object>(target: T, key: keyof T): jest.Mock {
  return target[key] as jest.Mock;
}

function methodOf(target: object, key: string): object {
  return Object.getOwnPropertyDescriptor(target, key)?.value as object;
}

describe('AccountsReceivableController', () => {
  it('exposes list, detail and payment registration routes to SELLER', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        methodOf(AccountsReceivableController.prototype, 'findAll'),
      ),
    ).toEqual(['ADMIN', 'COLLECTIONS', 'SELLER']);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        methodOf(AccountsReceivableController.prototype, 'findOne'),
      ),
    ).toEqual(['ADMIN', 'COLLECTIONS', 'SELLER']);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        methodOf(AccountsReceivableController.prototype, 'registerPayment'),
      ),
    ).toEqual(['ADMIN', 'COLLECTIONS', 'SELLER']);
  });

  it('passes the current user and Idempotency-Key to payment registration service', async () => {
    const service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      registerPayment: jest
        .fn()
        .mockResolvedValue({ payment: { id: 'payment-1' } }),
    } as unknown as jest.Mocked<AccountsReceivableService>;
    const controller = new AccountsReceivableController(service);
    const user = {
      id: 'collector-1',
      email: 'c@example.com',
      name: 'Collector',
      role: 'COLLECTIONS',
      mustChangePassword: false,
    };
    const body = {
      accountReceivableId: 'ar-1',
      amount: 100,
      paymentMethod: PaymentMethod.CASH,
    };

    await controller.registerPayment('ar-1', body, user, 'idem-key');

    expect(mockOf(service, 'registerPayment')).toHaveBeenCalledWith(
      'ar-1',
      body,
      user,
      'idem-key',
    );
  });

  it('rejects payment registration without Idempotency-Key', async () => {
    const service = {
      registerPayment: jest.fn(),
    } as unknown as jest.Mocked<AccountsReceivableService>;
    const controller = new AccountsReceivableController(service);
    const user = {
      id: 'collector-1',
      email: 'c@example.com',
      name: 'Collector',
      role: 'COLLECTIONS',
      mustChangePassword: false,
    };

    await expect(
      controller.registerPayment(
        'ar-1',
        {
          accountReceivableId: 'ar-1',
          amount: 100,
          paymentMethod: PaymentMethod.CASH,
        },
        user,
        ' ',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
