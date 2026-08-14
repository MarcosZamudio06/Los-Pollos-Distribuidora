import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterReceivablePaymentDto } from './register-receivable-payment.dto';

describe('RegisterReceivablePaymentDto', () => {
  it('accepts a numeric payment amount from JSON clients and normalizes it', async () => {
    const dto = plainToInstance(RegisterReceivablePaymentDto, {
      accountReceivableId: 'ar-1',
      amount: 2500,
      paymentMethod: 'TRANSFER',
    });

    const errors = await validate(dto);

    expect(dto.amount).toBe('2500');
    expect(errors).toEqual([]);
  });
});
