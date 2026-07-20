import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SaleDocumentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { BillingRemediationQueryDto, ResolveBillingRemediationDto } from './dto/billing-remediation.dto';

type Actor = Pick<AuthenticatedUser, 'id' | 'role'>;
type SaleForRemediation = Prisma.SaleGetPayload<{ include: { items: true; documents: { include: { billingRequestDocuments: true; invoiceDocuments: true } } } }>;
type Transaction = Prisma.TransactionClient;

const saleInclude = {
  items: true,
  documents: { include: { billingRequestDocuments: true, invoiceDocuments: true } },
} satisfies Prisma.SaleInclude;

@Injectable()
export class BillingRemediationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: BillingRemediationQueryDto) {
    const where: Prisma.BillingDataRemediationWhereInput = {
      ...(query.status === 'OPEN' ? { resolvedAt: null } : query.status === 'RESOLVED' ? { resolvedAt: { not: null } } : {}),
      ...(query.code ? { code: query.code } : {}),
      ...(query.search?.trim() ? { OR: [
        { code: { contains: query.search.trim(), mode: 'insensitive' } },
        { entityId: { contains: query.search.trim(), mode: 'insensitive' } },
        { resolutionNotes: { contains: query.search.trim(), mode: 'insensitive' } },
      ] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.billingDataRemediation.findMany({
        where,
        include: { resolvedBy: { select: { id: true, name: true } } },
        orderBy: [{ resolvedAt: 'asc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.billingDataRemediation.count({ where }),
    ]);
    const saleIds = items.filter((item) => item.entityType === 'Sale').map((item) => item.entityId);
    const sales = saleIds.length ? await this.prisma.sale.findMany({
      where: { id: { in: saleIds } },
      select: {
        id: true, saleNumber: true, documentType: true, legalEntityId: true, subtotal: true, discount: true, tax: true, total: true,
        legalEntity: { select: { legalName: true } },
        documents: { select: { id: true, documentType: true, status: true, physicalFolio: true, _count: { select: { billingRequestDocuments: true, invoiceDocuments: true } } }, orderBy: { createdAt: 'asc' } },
        items: { select: { id: true, productNameSnapshot: true, subtotal: true, discount: true, tax: true, total: true }, orderBy: { createdAt: 'asc' } },
      },
    }) : [];
    const legalEntities = await this.prisma.legalEntity.findMany({ where: { isActive: true }, select: { id: true, legalName: true, taxId: true }, orderBy: { legalName: 'asc' } });
    const salesById = new Map<string, (typeof sales)[number]>();
    sales.forEach((sale) => salesById.set(sale.id, sale));
    return {
      items: items.map((item) => ({ ...item, sale: salesById.get(item.entityId) ?? null })),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
      legalEntities,
    };
  }

  async resolve(id: string, dto: ResolveBillingRemediationDto, actor: Actor) {
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException('reason is required');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "BillingDataRemediation" WHERE "id" = ${id} FOR UPDATE`;
      const remediation = await tx.billingDataRemediation.findUnique({ where: { id } });
      if (!remediation) throw new NotFoundException('Billing remediation not found');
      if (remediation.resolvedAt) return remediation;
      if (remediation.updatedAt.toISOString() !== dto.expectedUpdatedAt) throw new ConflictException('VERSION_CONFLICT');
      if (remediation.entityType !== 'Sale') throw new BadRequestException('UNSUPPORTED_REMEDIATION_ENTITY');

      await tx.$queryRaw`SELECT "id" FROM "Sale" WHERE "id" = ${remediation.entityId} FOR UPDATE`;
      let sale = await tx.sale.findUnique({ where: { id: remediation.entityId }, include: saleInclude });
      if (!sale) throw new NotFoundException('Remediation sale not found');
      const before = this.auditSnapshot(remediation, sale);
      sale = await this.applyCorrection(tx, remediation.code, sale, dto);
      if (this.isInconsistencyPresent(remediation.code, sale)) throw new ConflictException('REMEDIATION_STILL_PRESENT');

      const resolvedAt = new Date();
      const resolved = await tx.billingDataRemediation.update({
        where: { id },
        data: { resolvedAt, resolvedByUserId: actor.id, resolutionNotes: reason },
      });
      await tx.billingAuditLog.create({ data: {
        actorUserId: actor.id,
        action: 'BILLING_REMEDIATION_RESOLVED',
        entityType: 'BillingDataRemediation',
        entityId: id,
        before,
        after: this.auditSnapshot(resolved, sale),
        reason,
        context: { code: remediation.code, sourceEntityType: remediation.entityType, sourceEntityId: remediation.entityId, billabilityRecalculated: true },
      } });
      return resolved;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async applyCorrection(tx: Transaction, code: string, sale: SaleForRemediation, dto: ResolveBillingRemediationDto): Promise<SaleForRemediation> {
    const correction = dto.correction;
    if (!correction) return sale;
    if (code === 'MISSING_LEGAL_ENTITY_MAPPING' && correction.legalEntityId) {
      const legalEntity = await tx.legalEntity.findFirst({ where: { id: correction.legalEntityId, isActive: true } });
      if (!legalEntity) throw new BadRequestException('LEGAL_ENTITY_NOT_ACTIVE');
      return tx.sale.update({ where: { id: sale.id }, data: { legalEntityId: legalEntity.id }, include: saleInclude });
    }
    if (code === 'AMBIGUOUS_SALE_DOCUMENT' && correction.selectedSaleDocumentId) {
      const matching = sale.documents.filter((document) => document.documentType === sale.documentType && document.status !== SaleDocumentStatus.CANCELLED);
      const selected = matching.find((document) => document.id === correction.selectedSaleDocumentId);
      if (!selected) throw new BadRequestException('SELECTED_DOCUMENT_NOT_ELIGIBLE');
      const duplicates = matching.filter((document) => document.id !== selected.id);
      if (duplicates.some((document) => document.billingRequestDocuments.length || document.invoiceDocuments.length)) {
        throw new ConflictException('DOCUMENT_HAS_ACCOUNTING_RELATIONS');
      }
      await tx.saleDocument.updateMany({ where: { id: { in: duplicates.map((document) => document.id) } }, data: { status: SaleDocumentStatus.CANCELLED } });
      return tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: saleInclude });
    }
    if (code === 'UNALLOCATED_ITEM_AMOUNTS' && correction.items) {
      const expectedIds = new Set(sale.items.map((item) => item.id));
      if (correction.items.length !== expectedIds.size || correction.items.some((item) => !expectedIds.delete(item.saleItemId)) || expectedIds.size) {
        throw new BadRequestException('ITEM_ALLOCATION_MUST_COVER_SALE');
      }
      for (const item of correction.items) {
        this.assertValidAmounts(item.subtotal, item.discount, item.tax, item.total);
        await tx.saleItem.update({ where: { id: item.saleItemId }, data: {
          subtotal: item.subtotal, discount: item.discount, taxableBase: new Prisma.Decimal(item.subtotal).minus(item.discount), tax: item.tax, total: item.total,
        } });
      }
      return tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: saleInclude });
    }
    if (code === 'INVALID_SALE_TOTAL' && correction.subtotal !== undefined && correction.discount !== undefined && correction.tax !== undefined && correction.total !== undefined) {
      this.assertValidAmounts(correction.subtotal, correction.discount, correction.tax, correction.total);
      return tx.sale.update({ where: { id: sale.id }, data: {
        subtotal: correction.subtotal, discount: correction.discount, tax: correction.tax, total: correction.total,
      }, include: saleInclude });
    }
    return sale;
  }

  private isInconsistencyPresent(code: string, sale: SaleForRemediation): boolean {
    if (code === 'MISSING_LEGAL_ENTITY_MAPPING') return !sale.legalEntityId;
    if (code === 'AMBIGUOUS_SALE_DOCUMENT') return sale.documents.filter((document) => document.documentType === sale.documentType && document.status !== SaleDocumentStatus.CANCELLED).length !== 1;
    if (code === 'INVALID_SALE_TOTAL') return this.money(sale.total) <= 0 || this.money(sale.subtotal) - this.money(sale.discount) + this.money(sale.tax) !== this.money(sale.total);
    if (code === 'UNALLOCATED_ITEM_AMOUNTS') {
      if (!sale.items.length) return true;
      const sums = sale.items.reduce((acc, item) => ({ subtotal: acc.subtotal + this.money(item.subtotal), discount: acc.discount + this.money(item.discount), tax: acc.tax + this.money(item.tax), total: acc.total + this.money(item.total) }), { subtotal: 0, discount: 0, tax: 0, total: 0 });
      const invalidItem = sale.items.some((item) => this.money(item.subtotal) - this.money(item.discount) + this.money(item.tax) !== this.money(item.total));
      return invalidItem || sums.subtotal !== this.money(sale.subtotal) || sums.discount !== this.money(sale.discount) || sums.tax !== this.money(sale.tax) || sums.total !== this.money(sale.total);
    }
    throw new BadRequestException('UNSUPPORTED_REMEDIATION_CODE');
  }

  private assertValidAmounts(subtotal: string, discount: string, tax: string, total: string) {
    const values = [subtotal, discount, tax, total].map((value) => new Prisma.Decimal(value));
    const taxableBase = values[0].minus(values[1]);
    if (values.some((value) => value.isNegative()) || taxableBase.isNegative() || !taxableBase.plus(values[2]).toDecimalPlaces(2).equals(values[3])) throw new BadRequestException('INVALID_AMOUNT_EQUATION');
  }

  private money(value: Prisma.Decimal | number | string) { return Number(new Prisma.Decimal(value).toFixed(2)); }

  private auditSnapshot(remediation: { resolvedAt: Date | null; resolvedByUserId?: string | null; resolutionNotes?: string | null }, sale: SaleForRemediation) {
    return {
      remediation: { resolvedAt: remediation.resolvedAt, resolvedByUserId: remediation.resolvedByUserId ?? null, resolutionNotes: remediation.resolutionNotes ?? null },
      sale: { id: sale.id, legalEntityId: sale.legalEntityId, subtotal: String(sale.subtotal), discount: String(sale.discount), tax: String(sale.tax), total: String(sale.total) },
      documents: sale.documents.map((document) => ({ id: document.id, documentType: document.documentType, status: document.status })),
      items: sale.items.map((item) => ({ id: item.id, subtotal: String(item.subtotal), discount: String(item.discount), tax: String(item.tax), total: String(item.total) })),
    } as Prisma.InputJsonValue;
  }
}
