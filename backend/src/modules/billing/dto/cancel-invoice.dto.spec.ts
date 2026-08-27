import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CancelInvoiceDto } from './cancel-invoice.dto';

describe('CancelInvoiceDto fiscal contract', () => {
  it.each(['01', '02', '03', '04'])('accepts SAT motive %s', async (motive) => {
    const dto = plainToInstance(CancelInvoiceDto, {
      expectedVersion: '3',
      cancellationMotiveCode: ` ${motive} `,
      internalReason: ' Correction requested ',
      ...(motive === '01' ? { replacementInvoiceId: 'invoice-new' } : {}),
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.cancellationMotiveCode).toBe(motive);
    expect(dto.internalReason).toBe('Correction requested');
  });

  it('rejects an unsupported motive and an empty internal reason', async () => {
    const dto = plainToInstance(CancelInvoiceDto, {
      expectedVersion: 3,
      cancellationMotiveCode: '05',
      internalReason: '  ',
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['cancellationMotiveCode', 'internalReason']),
    );
  });
});
