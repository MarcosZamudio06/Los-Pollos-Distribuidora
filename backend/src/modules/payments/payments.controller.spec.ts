import { BadRequestException } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

describe('PaymentsController', () => {
  it('passes current user and Idempotency-Key to cancellation service', async () => {
    const service = { cancel: jest.fn().mockResolvedValue({ payment: { id: 'payment-1' } }) } as unknown as jest.Mocked<PaymentsService>;
    const controller = new PaymentsController(service);
    const user = { id: 'admin-1', email: 'a@example.com', name: 'Admin', role: 'ADMIN', mustChangePassword: false };
    const body = { reason: 'Pago registrado por error', expectedVersion: 2 };

    await controller.cancel('payment-1', body, user, 'cancel-key');

    expect(service.cancel).toHaveBeenCalledWith('payment-1', body, user, 'cancel-key');
  });

  it('rejects cancellation without Idempotency-Key', async () => {
    const service = { cancel: jest.fn() } as unknown as jest.Mocked<PaymentsService>;
    const controller = new PaymentsController(service);
    const user = { id: 'admin-1', email: 'a@example.com', name: 'Admin', role: 'ADMIN', mustChangePassword: false };

    await expect(controller.cancel('payment-1', { reason: 'Pago registrado por error', expectedVersion: 2 }, user, ' ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
