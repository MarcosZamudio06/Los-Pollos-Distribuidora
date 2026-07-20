import { Injectable } from '@nestjs/common';
import { PassThrough, Readable } from 'node:stream';
import { stream as excelStream } from 'exceljs';

export type BillingExportFormat = 'csv' | 'xlsx';
export type BillingExportRow = Record<string, unknown>;
export interface BillingExportMetadata {
  generatedAt: Date;
  user: { id: string; name: string };
  timeZone: string;
  filters: Record<string, unknown>;
  totals: Record<string, unknown>;
  truncated: boolean;
}

const COLUMNS = [
  ['saleDocumentId', 'ID documento'], ['saleId', 'ID venta'], ['saleNumber', 'Venta'], ['physicalFolio', 'Folio visible'],
  ['issuedAt', 'Fecha'], ['customerName', 'Cliente'], ['taxId', 'RFC'], ['documentType', 'Tipo de documento'],
  ['billingStatus', 'Estado de facturación'], ['activeRequested', 'Solicitado'], ['activeInvoiced', 'Facturado'],
  ['pendingInvoice', 'Pendiente'], ['total', 'Total'], ['currencyCode', 'Moneda'], ['invoiceUuids', 'UUID'], ['invoiceFolios', 'Folios factura'],
  ['locationName', 'Ubicación'], ['sellerName', 'Vendedor'], ['routeName', 'Ruta'], ['activePaid', 'Saldo cobrado'],
  ['collectionBalance', 'Saldo por cobrar'], ['blockingCodes', 'Códigos de bloqueo'], ['deadline', 'Fecha límite'], ['deliveryStatus', 'Estado de entrega'],
] as const;
const MONEY_KEYS = new Set(['activeRequested', 'activeInvoiced', 'pendingInvoice', 'total', 'activePaid', 'collectionBalance']);
const CONTROL_TOTALS = [
  ['totalDocuments', 'Total de documentos', false], ['billableDocuments', 'Documentos facturables', false], ['blockedDocuments', 'Documentos bloqueados', false],
  ['totalBillable', 'Total facturable', true], ['totalRequested', 'Total solicitado', true], ['totalInvoiced', 'Total facturado', true],
  ['totalPending', 'Total pendiente', true], ['totalCollected', 'Total cobrado', true], ['totalReceivable', 'Total por cobrar', true],
] as const;

@Injectable()
export class BillingReportExporter {
  async createFile(rows: BillingExportRow[], metadata: BillingExportMetadata, format: BillingExportFormat) {
    const stamp = metadata.generatedAt.toISOString().slice(0, 10).replaceAll('-', '');
    const fileName = `notas-facturables-${stamp}.${format}`;
    if (format === 'csv') {
      return { stream: Readable.from([this.toCsv(rows, metadata)]), contentType: 'text/csv; charset=utf-8', fileName };
    }
    const stream = new PassThrough();
    void this.writeXlsx(stream, rows, metadata).catch((error) => stream.destroy(error as Error));
    return { stream, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName };
  }

  toCsv(rows: BillingExportRow[], metadata: BillingExportMetadata): string {
    const lines: unknown[][] = [
      ['Fecha de generación', metadata.generatedAt.toISOString()],
      ['Usuario', `${metadata.user.name} (${metadata.user.id})`],
      ['Zona horaria', metadata.timeZone],
      ['Filtros', this.stableJson(metadata.filters)],
      ...CONTROL_TOTALS.map(([key, label]) => [label, metadata.totals[key] ?? (key.endsWith('Documents') ? 0 : '0.00')]),
      [],
      COLUMNS.map(([, label]) => label),
      ...rows.map((row) => COLUMNS.map(([key]) => MONEY_KEYS.has(key) ? Number(row[key] ?? 0) : this.csvValue(key, row[key]))),
    ];
    return `\uFEFF${lines.map((line) => line.map((value) => this.escapeCsv(value)).join(',')).join('\r\n')}\r\n`;
  }

  async toXlsxBuffer(rows: BillingExportRow[], metadata: BillingExportMetadata): Promise<Buffer> {
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    const completed = new Promise<Buffer>((resolve, reject) => {
      output.on('end', () => resolve(Buffer.concat(chunks)));
      output.on('error', reject);
    });
    await this.writeXlsx(output, rows, metadata);
    return completed;
  }

  private async writeXlsx(output: PassThrough, rows: BillingExportRow[], metadata: BillingExportMetadata) {
    const workbook = new excelStream.xlsx.WorkbookWriter({ stream: output, useStyles: true, useSharedStrings: true });
    workbook.creator = 'Pollos Distribuidora';
    workbook.created = metadata.generatedAt;
    const headerRowNumber = 4 + CONTROL_TOTALS.length + 2;
    const sheet = workbook.addWorksheet('Notas facturables', { views: [{ state: 'frozen', ySplit: headerRowNumber }] });
    const metadataRows = [
      ['Fecha de generación', metadata.generatedAt],
      ['Usuario', `${metadata.user.name} (${metadata.user.id})`],
      ['Zona horaria', metadata.timeZone],
      ['Filtros', this.stableJson(metadata.filters)],
      ...CONTROL_TOTALS.map(([key, label]) => [label, Number(metadata.totals[key] ?? 0)]),
      [],
    ];
    metadataRows.forEach((values, index) => {
      const row = sheet.addRow(values);
      if (index >= 4 + 3 && index < 4 + CONTROL_TOTALS.length) row.getCell(2).numFmt = '#,##0.00';
      row.commit();
    });
    const header = sheet.addRow(COLUMNS.map(([, label]) => label));
    header.font = { bold: true };
    header.commit();
    for (const source of rows) {
      const row = sheet.addRow(COLUMNS.map(([key]) => this.xlsxValue(key, source[key])));
      for (const key of MONEY_KEYS) {
        const index = COLUMNS.findIndex(([column]) => column === key) + 1;
        row.getCell(index).numFmt = '#,##0.00';
      }
      row.getCell(COLUMNS.findIndex(([key]) => key === 'issuedAt') + 1).numFmt = 'yyyy-mm-dd hh:mm';
      row.getCell(COLUMNS.findIndex(([key]) => key === 'deadline') + 1).numFmt = 'yyyy-mm-dd';
      row.commit();
    }
    sheet.columns.forEach((column) => { column.width = 20; });
    await workbook.commit();
  }

  private xlsxValue(key: string, value: unknown) {
    if (MONEY_KEYS.has(key)) return Number(value ?? 0);
    if ((key === 'issuedAt' || key === 'deadline') && value) return new Date(value as string | Date);
    if (key === 'blockingCodes' && Array.isArray(value)) return value.join(' | ');
    return value == null ? '' : String(value);
  }

  private csvValue(key: string, value: unknown) {
    if (key === 'blockingCodes' && Array.isArray(value)) return value.join(' | ');
    if (value instanceof Date) return value.toISOString();
    return value ?? '';
  }

  private escapeCsv(value: unknown) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  private stableJson(value: Record<string, unknown>) {
    return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
  }
}
