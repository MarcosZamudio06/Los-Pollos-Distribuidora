import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { BillingReportQueryDto } from './dto/billing-report-query.dto';
import { BillingReportExporter } from './billing-report-exporter';

type ReportUser = Pick<AuthenticatedUser, 'id' | 'name' | 'role'>;
type DecimalLike = Prisma.Decimal | string | number | null;
type ReportRow = Record<string, unknown> & {
  saleDocumentId: string;
  total: DecimalLike;
  activeRequested: DecimalLike;
  activeInvoiced: DecimalLike;
  pendingInvoice: DecimalLike;
  pendingSubtotal: DecimalLike;
  pendingTax: DecimalLike;
  pendingTotal: DecimalLike;
  activePaid: DecimalLike;
  collectionBalance: DecimalLike;
  updatedAt?: Date | string | null;
  totalCount?: bigint | number;
};

const FRESHNESS_TARGET_SECONDS = 60;
const EXPORT_LIMIT = 5_000;
const MONEY_FIELDS = [
  'total',
  'activeRequested',
  'activeInvoiced',
  'pendingInvoice',
  'pendingSubtotal',
  'pendingTax',
  'pendingTotal',
  'activePaid',
  'collectionBalance',
] as const;
const SORT_COLUMNS: Record<string, Prisma.Sql> = {
  issuedAt: Prisma.raw('"issuedAt"'),
  saleNumber: Prisma.raw('"saleNumber"'),
  customerName: Prisma.raw('"customerName"'),
  documentType: Prisma.raw('"documentType"'),
  billingStatus: Prisma.raw('"billingStatus"'),
  pendingInvoice: Prisma.raw('"pendingInvoice"'),
  total: Prisma.raw('"total"'),
};

@Injectable()
export class BillingReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exporter: BillingReportExporter,
  ) {}

  async list(query: BillingReportQueryDto, user: ReportUser) {
    this.assertReadAccess(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const filtered = this.buildFilteredReadModel(query, user);
    const order = this.buildOrder(query);
    const rows = await this.prisma.$queryRaw<ReportRow[]>(Prisma.sql`
      ${filtered}
      SELECT *, COUNT(*) OVER() AS "totalCount"
      FROM filtered
      ORDER BY ${order}
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `);
    const summaryRows = await this.prisma.$queryRaw<
      Record<string, unknown>[]
    >(Prisma.sql`
      ${filtered}
      SELECT
        COUNT(*)::bigint AS "totalDocuments",
        COUNT(*) FILTER (WHERE "billingStatus" = 'BILLABLE')::bigint AS "billableDocuments",
        COUNT(*) FILTER (WHERE "billingStatus" = 'BLOCKED')::bigint AS "blockedDocuments",
        COALESCE(SUM("total"), 0) AS "totalBillable",
        COALESCE(SUM("activeRequested"), 0) AS "totalRequested",
        COALESCE(SUM("activeInvoiced"), 0) AS "totalInvoiced",
        COALESCE(SUM("pendingInvoice"), 0) AS "totalPending",
        COALESCE(SUM("activePaid"), 0) AS "totalCollected",
        COALESCE(SUM("collectionBalance"), 0) AS "totalReceivable"
      FROM filtered
    `);
    const total = Number(rows[0]?.totalCount ?? 0);
    const dates = rows.map((row) => row.updatedAt).filter(Boolean) as (
      | Date
      | string
    )[];
    return {
      items: rows.map((row) => this.toItem(row, user)),
      pagination: {
        page,
        limit,
        total,
        totalPages: total ? Math.ceil(total / limit) : 0,
      },
      summary: this.toSummary(summaryRows[0]),
      ...this.buildFreshness(dates),
    };
  }

  async summary(query: BillingReportQueryDto, user: ReportUser) {
    this.assertReadAccess(user);
    const filtered = this.buildFilteredReadModel(query, user);
    const rows = await this.prisma.$queryRaw<
      Record<string, unknown>[]
    >(Prisma.sql`
      ${filtered}
      SELECT
        COUNT(*)::bigint AS "totalDocuments",
        COUNT(*) FILTER (WHERE "billingStatus" = 'BILLABLE')::bigint AS "billableDocuments",
        COUNT(*) FILTER (WHERE "billingStatus" = 'BLOCKED')::bigint AS "blockedDocuments",
        COALESCE(SUM("total"), 0) AS "totalBillable",
        COALESCE(SUM("activeRequested"), 0) AS "totalRequested",
        COALESCE(SUM("activeInvoiced"), 0) AS "totalInvoiced",
        COALESCE(SUM("pendingInvoice"), 0) AS "totalPending",
        COALESCE(SUM("activePaid"), 0) AS "totalCollected",
        COALESCE(SUM("collectionBalance"), 0) AS "totalReceivable",
        MAX("updatedAt") AS "dataAsOf"
      FROM filtered
    `);
    const dataAsOf = rows[0]?.dataAsOf as Date | string | undefined;
    return {
      ...this.toSummary(rows[0]),
      ...this.buildFreshness(dataAsOf ? [dataAsOf] : []),
    };
  }

  async detail(saleDocumentId: string, user: ReportUser) {
    this.assertReadAccess(user);
    const filtered = this.buildFilteredReadModel({}, user);
    const rows = await this.prisma.$queryRaw<ReportRow[]>(Prisma.sql`
      ${filtered}
      SELECT f.*,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', si."id", 'productId', si."productId", 'productName', si."productNameSnapshot",
          'quantity', si."quantitySnapshot"::text, 'unit', si."unit", 'unitPrice', si."unitPriceSnapshot"::text,
          'subtotal', si."subtotal"::text, 'discount', si."discount"::text, 'taxableBase', si."taxableBase"::text,
          'tax', si."tax"::text, 'total', si."total"::text
        ) ORDER BY si."createdAt") FROM "SaleItem" si WHERE si."saleId" = f."saleId"), '[]'::jsonb) AS items,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', br."id", 'status', br."status", 'version', br."version", 'requestedAt', br."requestedAt",
          'requestedTotal', brd."requestedTotal"::text, 'reversedAt', brd."reversedAt"
        ) ORDER BY br."requestedAt" DESC) FROM "BillingRequestSaleDocument" brd
          JOIN "BillingRequest" br ON br."id" = brd."billingRequestId" WHERE brd."saleDocumentId" = f."saleDocumentId"), '[]'::jsonb) AS requests,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', i."id", 'series', i."series", 'folio', i."folio", 'uuid', i."uuid", 'status', i."status",
          'totalApplied', idoc."totalApplied"::text, 'reversedAt', idoc."reversedAt",
          'cancelledAt', i."cancelledAt", 'substitutedByInvoiceId', i."substitutedByInvoiceId"
        ) ORDER BY i."createdAt" DESC) FROM "InvoiceSaleDocument" idoc
          JOIN "Invoice" i ON i."id" = idoc."invoiceId" WHERE idoc."saleDocumentId" = f."saleDocumentId"
          AND idoc."reversedAt" IS NULL AND i."status" = 'ACTIVE'), '[]'::jsonb) AS "activeInvoices",
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', i."id", 'series', i."series", 'folio', i."folio", 'uuid', i."uuid", 'status', i."status",
          'totalApplied', idoc."totalApplied"::text, 'reversedAt', idoc."reversedAt", 'reversalReason', idoc."reversalReason",
          'cancelledAt', i."cancelledAt", 'cancellationReason', i."cancellationReason", 'substitutedByInvoiceId', i."substitutedByInvoiceId"
        ) ORDER BY i."createdAt" DESC) FROM "InvoiceSaleDocument" idoc
          JOIN "Invoice" i ON i."id" = idoc."invoiceId" WHERE idoc."saleDocumentId" = f."saleDocumentId"
          AND (idoc."reversedAt" IS NOT NULL OR i."status" <> 'ACTIVE')), '[]'::jsonb) AS "invoiceHistory",
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', p."id", 'amount', p."amount"::text, 'status', p."status", 'paymentMethod', p."paymentMethod", 'paidAt', p."paidAt"
        ) ORDER BY p."paidAt" DESC) FROM "Payment" p WHERE p."saleId" = f."saleId" OR p."accountReceivableId" IN
          (SELECT ar."id" FROM "AccountReceivable" ar WHERE ar."saleId" = f."saleId")), '[]'::jsonb) AS payments,
        (SELECT jsonb_build_object('status', dord."status", 'deliveredAt', dord."deliveredAt", 'notes', dord."notes")
          FROM "DeliveryOrder" dord WHERE dord."saleId" = f."saleId") AS delivery,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', audit."id", 'action', audit."action", 'actorName', actor."name", 'reason', audit."reason", 'createdAt', audit."createdAt"
        ) ORDER BY audit."createdAt" DESC) FROM "BillingAuditLog" audit
          JOIN "User" actor ON actor."id" = audit."actorUserId"
          WHERE audit."entityId" IN (
            SELECT brd."billingRequestId" FROM "BillingRequestSaleDocument" brd WHERE brd."saleDocumentId" = f."saleDocumentId"
            UNION SELECT idoc."invoiceId" FROM "InvoiceSaleDocument" idoc WHERE idoc."saleDocumentId" = f."saleDocumentId"
          )), '[]'::jsonb) AS audit
      FROM filtered f
      WHERE f."saleDocumentId" = ${saleDocumentId}
      LIMIT 1
    `);
    if (!rows[0])
      throw new NotFoundException('Reportable sale document not found');
    const item = this.toItem(rows[0], user);
    return {
      ...item,
      items: rows[0].items ?? [],
      requests: rows[0].requests ?? [],
      activeInvoices: rows[0].activeInvoices ?? [],
      invoiceHistory: rows[0].invoiceHistory ?? [],
      payments: rows[0].payments ?? [],
      delivery: rows[0].delivery ?? null,
      audit: rows[0].audit ?? [],
      ...this.buildFreshness(rows[0].updatedAt ? [rows[0].updatedAt] : []),
    };
  }

  async exportFile(query: BillingReportQueryDto, user: ReportUser) {
    this.assertExportAccess(user);
    const filtered = this.buildFilteredReadModel(query, user);
    const rows = await this.prisma.$queryRaw<ReportRow[]>(Prisma.sql`
      ${filtered}
      SELECT * FROM filtered
      ORDER BY ${this.buildOrder(query)}
      LIMIT ${EXPORT_LIMIT + 1}
    `);
    const truncated = rows.length > EXPORT_LIMIT;
    const exported = truncated ? rows.slice(0, EXPORT_LIMIT) : rows;
    const summaryRows = await this.prisma.$queryRaw<
      Record<string, unknown>[]
    >(Prisma.sql`
      ${filtered}
      SELECT COUNT(*)::bigint AS "totalDocuments",
        COUNT(*) FILTER (WHERE "billingStatus" = 'BILLABLE')::bigint AS "billableDocuments",
        COUNT(*) FILTER (WHERE "billingStatus" = 'BLOCKED')::bigint AS "blockedDocuments",
        COALESCE(SUM("total"), 0) AS "totalBillable",
        COALESCE(SUM("activeRequested"), 0) AS "totalRequested", COALESCE(SUM("activeInvoiced"), 0) AS "totalInvoiced",
        COALESCE(SUM("pendingInvoice"), 0) AS "totalPending", COALESCE(SUM("activePaid"), 0) AS "totalCollected",
        COALESCE(SUM("collectionBalance"), 0) AS "totalReceivable" FROM filtered
    `);
    const items = exported.map((row) => this.toItem(row, user));
    const filters = Object.fromEntries(
      Object.entries(query).filter(
        ([key, value]) =>
          !['format', 'timeZone', 'page', 'limit'].includes(key) &&
          value !== undefined &&
          value !== '',
      ),
    );
    const generatedAt = new Date();
    const format = query.format ?? 'csv';
    const file = await this.exporter.createFile(
      items,
      {
        generatedAt,
        user: { id: user.id, name: user.name },
        timeZone: query.timeZone ?? 'America/Mexico_City',
        filters,
        totals: this.toSummary(summaryRows[0]),
        truncated,
      },
      format,
    );
    await this.prisma.billingAuditLog.create({
      data: {
        actorUserId: user.id,
        action: 'BILLING_REPORT_EXPORTED',
        entityType: 'BillingReportExport',
        entityId: `${generatedAt.toISOString()}:${user.id}`,
        after: { format, rowCount: items.length, truncated },
        context: {
          filters,
          timeZone: query.timeZone ?? 'America/Mexico_City',
          fileName: file.fileName,
        },
      },
    });
    return file;
  }

  private buildFilteredReadModel(
    query: Partial<BillingReportQueryDto>,
    user: ReportUser,
  ): Prisma.Sql {
    const conditions: Prisma.Sql[] = [];
    if (user.role === 'SELLER')
      conditions.push(Prisma.sql`b."sellerId" = ${user.id}`);
    if (query.dateFrom)
      conditions.push(Prisma.sql`b."issuedAt" >= ${new Date(query.dateFrom)}`);
    if (query.dateTo) {
      const exclusiveDateTo = new Date(query.dateTo);
      exclusiveDateTo.setUTCDate(exclusiveDateTo.getUTCDate() + 1);
      conditions.push(Prisma.sql`b."issuedAt" < ${exclusiveDateTo}`);
    }
    if (query.locationId)
      conditions.push(Prisma.sql`b."locationId" = ${query.locationId}`);
    if (query.customerId)
      conditions.push(Prisma.sql`b."customerId" = ${query.customerId}`);
    if (query.taxId)
      conditions.push(Prisma.sql`b."taxId" ILIKE ${`%${query.taxId}%`}`);
    if (query.sellerId && user.role !== 'SELLER')
      conditions.push(Prisma.sql`b."sellerId" = ${query.sellerId}`);
    if (query.routeId)
      conditions.push(Prisma.sql`b."routeId" = ${query.routeId}`);
    if (query.documentType)
      conditions.push(
        Prisma.sql`b."documentType" = ${query.documentType}::"SaleDocumentType"`,
      );
    if (query.billingStatus)
      conditions.push(Prisma.sql`b."billingStatus" = ${query.billingStatus}`);
    if (query.paymentStatus)
      conditions.push(Prisma.sql`b."paymentStatus" = ${query.paymentStatus}`);
    if (query.deliveryStatus)
      conditions.push(Prisma.sql`b."deliveryStatus" = ${query.deliveryStatus}`);
    if (query.hasRequest !== undefined)
      conditions.push(
        Prisma.sql`(b."activeRequested" > 0) = ${query.hasRequest}`,
      );
    if (query.fiscalProfileComplete !== undefined)
      conditions.push(
        Prisma.sql`b."fiscalProfileComplete" = ${query.fiscalProfileComplete}`,
      );
    if (query.overdue !== undefined)
      conditions.push(
        Prisma.sql`(b.deadline < (CURRENT_TIMESTAMP AT TIME ZONE b."policyTimezone")::date) = ${query.overdue}`,
      );
    if (query.blocked !== undefined)
      conditions.push(
        Prisma.sql`(b."billingStatus" = 'BLOCKED') = ${query.blocked}`,
      );
    if (query.folio)
      conditions.push(
        Prisma.sql`b."physicalFolio" ILIKE ${`%${query.folio}%`}`,
      );
    if (query.uuid)
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "InvoiceSaleDocument" ix JOIN "Invoice" i ON i."id" = ix."invoiceId" WHERE ix."saleDocumentId" = b."saleDocumentId" AND ix."reversedAt" IS NULL AND i."status" = 'ACTIVE' AND i."uuid" ILIKE ${`%${query.uuid}%`})`,
      );
    if (query.search) {
      const search = `%${query.search}%`;
      conditions.push(
        Prisma.sql`(b."saleNumber" ILIKE ${search} OR b."customerName" ILIKE ${search} OR b."physicalFolio" ILIKE ${search} OR b."taxId" ILIKE ${search})`,
      );
    }
    const where = conditions.length
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.empty;

    return Prisma.sql`WITH filtered AS (
      SELECT b.*,
        GREATEST((s."subtotal" - s."discount") - COALESCE((SELECT SUM(ix."subtotalApplied") FROM "InvoiceSaleDocument" ix JOIN "Invoice" i ON i."id" = ix."invoiceId" WHERE ix."saleDocumentId" = b."saleDocumentId" AND ix."reversedAt" IS NULL AND i."status" = 'ACTIVE'), 0), 0) AS "pendingSubtotal",
        GREATEST(s."tax" - COALESCE((SELECT SUM(ix."taxApplied") FROM "InvoiceSaleDocument" ix JOIN "Invoice" i ON i."id" = ix."invoiceId" WHERE ix."saleDocumentId" = b."saleDocumentId" AND ix."reversedAt" IS NULL AND i."status" = 'ACTIVE'), 0), 0) AS "pendingTax",
        b."pendingInvoice" AS "pendingTotal",
        COALESCE((SELECT jsonb_agg(item ORDER BY item->>'productName') FROM (
          SELECT jsonb_build_object(
            'saleItemId', si."id", 'productName', si."productNameSnapshot",
            'pendingSubtotal', GREATEST(si."taxableBase" - COALESCE(SUM(iia."subtotalApplied") FILTER (WHERE iia."reversedAt" IS NULL AND inv."status" = 'ACTIVE'), 0) - COALESCE(reserved."requestedSubtotal", 0), 0)::text,
            'pendingTax', GREATEST(si."tax" - COALESCE(SUM(iia."taxApplied") FILTER (WHERE iia."reversedAt" IS NULL AND inv."status" = 'ACTIVE'), 0) - COALESCE(reserved."requestedTax", 0), 0)::text,
            'pendingTotal', GREATEST(si."total" - COALESCE(SUM(iia."totalApplied") FILTER (WHERE iia."reversedAt" IS NULL AND inv."status" = 'ACTIVE'), 0) - COALESCE(reserved."requestedTotal", 0), 0)::text
          ) AS item
          FROM "SaleItem" si
          LEFT JOIN "InvoiceSaleItemApplication" iia ON iia."saleItemId" = si."id"
          LEFT JOIN "InvoiceSaleDocument" ix ON ix."id" = iia."invoiceSaleDocumentId"
          LEFT JOIN "Invoice" inv ON inv."id" = ix."invoiceId"
          LEFT JOIN LATERAL (
            SELECT SUM(bri."requestedSubtotal") AS "requestedSubtotal", SUM(bri."requestedTax") AS "requestedTax", SUM(bri."requestedTotal") AS "requestedTotal"
            FROM "BillingRequestSaleItem" bri
            JOIN "BillingRequestSaleDocument" brd ON brd."id" = bri."billingRequestSaleDocumentId" AND brd."reversedAt" IS NULL
            JOIN "BillingRequest" br ON br."id" = brd."billingRequestId"
            WHERE bri."saleItemId" = si."id" AND bri."reversedAt" IS NULL AND br."status" IN ('REQUESTED', 'IN_REVIEW', 'APPROVED')
          ) reserved ON TRUE
          WHERE si."saleId" = b."saleId"
          GROUP BY si."id", reserved."requestedSubtotal", reserved."requestedTax", reserved."requestedTotal"
          HAVING GREATEST(si."total" - COALESCE(SUM(iia."totalApplied") FILTER (WHERE iia."reversedAt" IS NULL AND inv."status" = 'ACTIVE'), 0) - COALESCE(reserved."requestedTotal", 0), 0) > 0
        ) requestable), '[]'::jsonb) AS "requestableItems"
      FROM "BillingReportableNoteReadModel" b JOIN "Sale" s ON s."id" = b."saleId" ${where}
    )`;
  }

  private buildOrder(query: Partial<BillingReportQueryDto>) {
    const column =
      SORT_COLUMNS[query.sortBy ?? 'issuedAt'] ?? SORT_COLUMNS.issuedAt;
    const direction =
      query.sortOrder === 'asc' ? Prisma.raw('ASC') : Prisma.raw('DESC');
    return Prisma.sql`${column} ${direction}, "saleDocumentId" ASC`;
  }

  private toItem(row: ReportRow, user: ReportUser) {
    const item: Record<string, unknown> = { ...row };
    delete item.totalCount;
    delete item.policyTimezone;
    for (const field of MONEY_FIELDS) item[field] = this.money(row[field]);
    if (user.role === 'COLLECTIONS') item.taxId = null;
    return item;
  }

  private toSummary(row?: Record<string, unknown>) {
    return {
      totalDocuments: Number(row?.totalDocuments ?? 0),
      billableDocuments: Number(row?.billableDocuments ?? 0),
      blockedDocuments: Number(row?.blockedDocuments ?? 0),
      totalBillable: this.money(row?.totalBillable as DecimalLike),
      totalRequested: this.money(row?.totalRequested as DecimalLike),
      totalInvoiced: this.money(row?.totalInvoiced as DecimalLike),
      totalPending: this.money(row?.totalPending as DecimalLike),
      totalCollected: this.money(row?.totalCollected as DecimalLike),
      totalReceivable: this.money(row?.totalReceivable as DecimalLike),
    };
  }

  private money(value: DecimalLike | undefined) {
    return new Prisma.Decimal(value ?? 0).toFixed(2);
  }

  private buildFreshness(values: readonly (Date | string)[]) {
    const generated = new Date();
    const dates = values
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()));
    const dataAsOf = dates.length
      ? new Date(Math.max(...dates.map((value) => value.getTime())))
      : generated;
    const freshnessSeconds = Math.max(
      0,
      Math.floor((generated.getTime() - dataAsOf.getTime()) / 1_000),
    );
    return {
      generatedAt: generated.toISOString(),
      dataAsOf: dataAsOf.toISOString(),
      freshnessSeconds,
      isStale: freshnessSeconds > FRESHNESS_TARGET_SECONDS,
    };
  }

  private assertReadAccess(user: ReportUser) {
    if (!['ADMIN', 'BILLING', 'SELLER', 'COLLECTIONS'].includes(user.role)) {
      throw new ForbiddenException('User cannot access billing report');
    }
  }

  private assertExportAccess(user: ReportUser) {
    if (!['ADMIN', 'BILLING'].includes(user.role)) {
      throw new ForbiddenException('User cannot export billing report');
    }
  }
}
