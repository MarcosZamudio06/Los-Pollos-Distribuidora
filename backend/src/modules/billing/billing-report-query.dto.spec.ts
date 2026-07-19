import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BillingReportQueryDto } from './dto/billing-report-query.dto';

describe('BillingReportQueryDto contract', () => {
  it('transforms pagination and boolean filters while preserving one shared filter contract', async () => {
    const dto = plainToInstance(BillingReportQueryDto, {
      page: '2', limit: '50', hasRequest: 'true', fiscalProfileComplete: 'false',
      blocked: 'true', sortBy: 'pendingInvoice', sortOrder: 'asc', format: 'xlsx',
      timeZone: 'America/Mexico_City', billingStatus: 'PARTIALLY_INVOICED',
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto).toMatchObject({
      page: 2, limit: 50, hasRequest: true, fiscalProfileComplete: false,
      blocked: true, sortBy: 'pendingInvoice', sortOrder: 'asc', format: 'xlsx',
      billingStatus: 'PARTIALLY_INVOICED',
    });
  });

  it('rejects unsupported sorting, pagination, format, status, and time zone values', async () => {
    const dto = plainToInstance(BillingReportQueryDto, {
      page: '0', limit: '101', sortBy: 'unsafe-column', sortOrder: 'sideways',
      format: 'pdf', timeZone: 'Invalid/Zone', billingStatus: 'UNKNOWN',
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(expect.arrayContaining([
      'page', 'limit', 'sortBy', 'sortOrder', 'format', 'timeZone', 'billingStatus',
    ]));
  });
});
