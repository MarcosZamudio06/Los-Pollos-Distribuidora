import { Workbook } from 'exceljs';
import { BillingReportExporter } from './billing-report-exporter';

describe('BillingReportExporter', () => {
  const exporter = new BillingReportExporter();
  const metadata = {
    generatedAt: new Date('2026-07-18T18:00:00.000Z'),
    user: { id: 'admin-1', name: 'Admin' },
    timeZone: 'America/Mexico_City',
    filters: { billingStatus: 'BILLABLE', search: 'Cliente, principal' },
    totals: { totalDocuments: 1, totalPending: '100.50' },
    truncated: false,
  };
  const rows = [{
    saleDocumentId: 'doc-1', saleId: 'sale-1', saleNumber: 'V-1', physicalFolio: '00123',
    issuedAt: new Date('2026-07-18T12:00:00.000Z'), customerName: 'Cliente "Principal"',
    taxId: 'XAXX010101000', documentType: 'SIMPLE_NOTE', billingStatus: 'BILLABLE',
    activeRequested: '0.00', activeInvoiced: '0.00', pendingInvoice: '100.50', total: '100.50',
    currencyCode: 'MXN', invoiceUuids: '00000000-0000-0000-0000-000000000001', invoiceFolios: 'A-001',
  }];

  it('serializes CSV with metadata, control totals, numeric amounts and escaped text', () => {
    const csv = exporter.toCsv(rows, metadata);

    expect(csv).toContain('Usuario,Admin (admin-1)');
    expect(csv).toContain('Zona horaria,America/Mexico_City');
    expect(csv).toContain('Total pendiente,100.50');
    expect(csv).toContain('"Cliente ""Principal"""');
    expect(csv).toContain(',100.5,100.5,MXN,');
  });

  it('writes XLSX using typed date, numeric and text cells', async () => {
    const buffer = await exporter.toXlsxBuffer(rows, metadata);
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet('Notas facturables');
    expect(sheet).toBeDefined();

    const headerRow = sheet!.getRow(8).values as unknown[];
    const dataRow = sheet!.getRow(9);
    const issuedAtColumn = headerRow.indexOf('Fecha');
    const folioColumn = headerRow.indexOf('Folio visible');
    const totalColumn = headerRow.indexOf('Total');
    expect(dataRow.getCell(issuedAtColumn).value).toBeInstanceOf(Date);
    expect(dataRow.getCell(folioColumn).value).toBe('00123');
    expect(dataRow.getCell(totalColumn).value).toBe(100.5);
  });
});
