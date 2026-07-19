import { PATH_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { BillingReportController } from './billing-report.controller';
import { BillingReportService } from './billing-report.service';
import { BillingReportQueryDto } from './dto/billing-report-query.dto';

describe('BillingReportController', () => {
  const user: AuthenticatedUser = { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'ADMIN', mustChangePassword: false };
  const query = new BillingReportQueryDto();
  const service = {
    list: jest.fn().mockResolvedValue({ items: [] }),
    summary: jest.fn().mockResolvedValue({ totalDocuments: 0 }),
    detail: jest.fn().mockResolvedValue({ saleDocumentId: 'doc-1' }),
    exportFile: jest.fn().mockResolvedValue({ stream: Buffer.from('csv'), contentType: 'text/csv', fileName: 'file.csv' }),
  } as unknown as jest.Mocked<BillingReportService>;
  const controller = new BillingReportController(service);

  it('exposes the billing report base path and read roles', () => {
    expect(Reflect.getMetadata(PATH_METADATA, BillingReportController)).toBe('billing/reportable-notes');
    for (const method of ['list', 'summary', 'detail'] as const) {
      expect(Reflect.getMetadata(ROLES_KEY, BillingReportController.prototype[method])).toEqual(['ADMIN', 'BILLING', 'SELLER', 'COLLECTIONS']);
    }
    expect(Reflect.getMetadata(ROLES_KEY, BillingReportController.prototype.export)).toEqual(['ADMIN', 'BILLING']);
  });

  it('delegates list, summary, detail, and export with the same filter DTO', async () => {
    await controller.list(query, user);
    await controller.summary(query, user);
    await controller.detail('doc-1', user);
    await controller.export(query, user);

    expect(service.list).toHaveBeenCalledWith(query, user);
    expect(service.summary).toHaveBeenCalledWith(query, user);
    expect(service.detail).toHaveBeenCalledWith('doc-1', user);
    expect(service.exportFile).toHaveBeenCalledWith(query, user);
  });
});
