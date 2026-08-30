import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ExternalInvoiceDto, IssueCfdiDto } from './billing-request.dto';

describe('ExternalInvoiceDto substitution validation', () => {
  const invoice = {
    legalEntityId: 'legal-1',
    currencyCode: 'MXN',
    series: 'A',
    folio: '1',
    subtotal: '90.00',
    discount: '0.00',
    tax: '10.00',
    total: '100.00',
  };

  it('requires a non-empty substitution reason when replacing an invoice', async () => {
    const dto = plainToInstance(ExternalInvoiceDto, {
      ...invoice,
      substitutesInvoiceId: 'invoice-old',
    });
    const errors = await validate(dto);
    expect(
      errors.some((error) => error.property === 'substitutionReason'),
    ).toBe(true);
  });

  it('accepts a trimmed substitution reason', async () => {
    const dto = plainToInstance(ExternalInvoiceDto, {
      ...invoice,
      substitutesInvoiceId: 'invoice-old',
      substitutionReason: ' Correct issuer data ',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.substitutionReason).toBe('Correct issuer data');
  });
});

describe('IssueCfdiDto substitution validation', () => {
  const issue = {
    expectedVersion: 3,
    cfdiUse: 'G03',
    paymentMethod: 'PUE',
    paymentForm: '01',
    exportCode: '01',
  };

  it('accepts only a server-owned original invoice reference', async () => {
    const dto = plainToInstance(IssueCfdiDto, {
      ...issue,
      substitutesInvoiceId: ' invoice-original-1 ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.substitutesInvoiceId).toBe('invoice-original-1');
  });

  it('rejects a client-supplied fiscal relationship payload', async () => {
    const dto = plainToInstance(IssueCfdiDto, {
      ...issue,
      relationships: [
        {
          typeCode: '04',
          relatedUuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
        },
      ],
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'relationships')).toBe(
      true,
    );
  });
});
