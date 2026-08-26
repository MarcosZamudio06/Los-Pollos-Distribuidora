import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCreditAdjustmentDto } from './credit-adjustment.dto';

const validPayload = () => ({
  sourceType: ' bonus ',
  internalReason: '  Bonificación autorizada por calidad  ',
  paymentFormCode: ' 03 ',
  applications: [
    {
      invoiceId: ' invoice-1 ',
      lines: [{ invoiceConceptId: ' concept-1 ', creditTotal: '58.00' }],
    },
  ],
});

describe('CreateCreditAdjustmentDto', () => {
  it('normalizes the explicit commercial credit command', async () => {
    const dto = plainToInstance(CreateCreditAdjustmentDto, validPayload());

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      sourceType: 'BONUS',
      internalReason: 'Bonificación autorizada por calidad',
      paymentFormCode: '03',
      applications: [
        {
          invoiceId: 'invoice-1',
          lines: [{ invoiceConceptId: 'concept-1', creditTotal: '58.00' }],
        },
      ],
    });
  });

  it('rejects server-owned fiscal identity and totals', async () => {
    const dto = plainToInstance(CreateCreditAdjustmentDto, {
      ...validPayload(),
      uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
      total: '58.00',
      certificateNumber: '30001000000300023708',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['uuid', 'total', 'certificateNumber']),
    );
  });
});
