import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ExternalInvoiceDto } from './billing-request.dto';

describe('ExternalInvoiceDto substitution validation', () => {
  const invoice = { legalEntityId: 'legal-1', currencyCode: 'MXN', series: 'A', folio: '1', subtotal: '90.00', discount: '0.00', tax: '10.00', total: '100.00' };

  it('requires a non-empty substitution reason when replacing an invoice', async () => {
    const dto = plainToInstance(ExternalInvoiceDto, { ...invoice, substitutesInvoiceId: 'invoice-old' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'substitutionReason')).toBe(true);
  });

  it('accepts a trimmed substitution reason', async () => {
    const dto = plainToInstance(ExternalInvoiceDto, { ...invoice, substitutesInvoiceId: 'invoice-old', substitutionReason: ' Correct issuer data ' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.substitutionReason).toBe('Correct issuer data');
  });
});
