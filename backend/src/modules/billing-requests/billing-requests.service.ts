import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { BillingRequestStatus, InvoiceStatus, Prisma, SaleStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CancelBillingRequestDto,
  CreateBillingRequestDto,
  ListBillingRequestsQueryDto,
  LinkInvoiceDto,
  ReviewBillingRequestDto,
  UpdateBillingRequestDto,
} from './dto';
import { BillingBalanceError, validateRequestedAmount } from '../billing/billability-evaluator';

type Actor = Pick<AuthenticatedUser, 'id' | 'role'>;

const transitions: Record<
  BillingRequestStatus,
  readonly BillingRequestStatus[]
> = {
  REQUESTED: [BillingRequestStatus.IN_REVIEW, BillingRequestStatus.CANCELLED],
  IN_REVIEW: [
    BillingRequestStatus.APPROVED,
    BillingRequestStatus.REJECTED,
    BillingRequestStatus.CANCELLED,
  ],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
};

const detailInclude = {
  customer: true,
  sale: true,
  accountReceivables: true,
  documents: { include: { saleDocument: true } },
  requestedBy: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
  history: {
    include: { changedBy: { select: { id: true, name: true } } },
    orderBy: { changedAt: 'asc' as const },
  },
} satisfies Prisma.BillingRequestInclude;

@Injectable()
export class BillingRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListBillingRequestsQueryDto, actor: Actor) {
    const where = this.applyScope(this.buildWhere(query), actor);
    const [items, total] = await Promise.all([
      this.prisma.billingRequest.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          sale: { select: { id: true, saleNumber: true, locationId: true } },
        },
        orderBy: { requestedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.billingRequest.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toListItem(item)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async findOne(id: string, actor: Actor) {
    const request = await this.prisma.billingRequest.findFirst({
      where: this.applyScope({ id }, actor),
      include: detailInclude,
    });
    if (!request) throw new NotFoundException('Billing request not found');
    return request;
  }

  async create(dto: CreateBillingRequestDto, actor: Actor, idempotencyKey?: string) {
    if (dto.documents?.length) return this.createFromDocuments(dto, actor, idempotencyKey?.trim());
    if (!dto.saleId) throw new BadRequestException('documents or legacy saleId is required');
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const sale = await tx.sale.findUnique({
            where: { id: dto.saleId },
            include: {
              billingRequests: { select: { id: true }, take: 1 },
              accountReceivable: { select: { id: true } },
              documents: true,
            },
          });
          if (!sale) throw new NotFoundException('Sale not found');
          if (sale.status === SaleStatus.CANCELLED)
            throw new BadRequestException(
              'Cancelled sales cannot receive billing requests',
            );
          if (!sale.customerId)
            throw new BadRequestException('Sale must have a customer');
          if (sale.customerId !== dto.customerId)
            throw new BadRequestException(
              'customerId must match the sale customer',
            );
          if (sale.billingRequests.length)
            throw new ConflictException('Sale already has a billing request');
          if (actor.role === 'SELLER' && sale.userId !== actor.id)
            throw new ForbiddenException(
              'SELLER can only create requests for own sales',
            );

          const created = await tx.billingRequest.create({
            data: {
              saleId: sale.id,
              customerId: sale.customerId,
              requestedByUserId: actor.id,
              status: BillingRequestStatus.REQUESTED,
              reason: dto.reason.trim(),
              notes: this.optionalText(dto.notes),
              history: {
                create: {
                  toStatus: BillingRequestStatus.REQUESTED,
                  changedByUserId: actor.id,
                  reason: dto.reason.trim(),
                  notes: this.optionalText(dto.notes),
                },
              },
            },
            include: detailInclude,
          });

          const requestedDocuments = sale.documents.filter(
            (document) => document.documentType === sale.documentType,
          );
          if (requestedDocuments.length !== 1) {
            throw new ConflictException(
              'Sale document requires remediation before billing request creation',
            );
          }
          await tx.billingRequestSaleDocument.create({
            data: {
              billingRequestId: created.id,
              saleDocumentId: requestedDocuments[0].id,
              requestedSubtotal: sale.subtotal.minus(sale.discount),
              requestedTax: sale.tax,
              requestedTotal: sale.total,
              createdByUserId: actor.id,
            },
          });
          await this.writeAudit(tx, actor, 'BILLING_REQUEST_CREATED', 'BillingRequest', created.id, {
            after: { status: created.status, customerId: created.customerId, saleId: created.saleId },
            reason: dto.reason.trim(),
            correlationId: idempotencyKey,
          });

          if (sale.accountReceivable) {
            await tx.accountReceivable.update({
              where: { id: sale.accountReceivable.id },
              data: { billingRequestId: created.id },
            });
          }
          return tx.billingRequest.findUnique({
            where: { id: created.id },
            include: detailInclude,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Sale already has a billing request');
      }
      throw error;
    }
  }

  private async createFromDocuments(dto: CreateBillingRequestDto, actor: Actor, idempotencyKey?: string) {
    if (!idempotencyKey) throw new BadRequestException('Idempotency-Key header is required');
    const documents = dto.documents ?? [];
    const ids = documents.map((item) => item.saleDocumentId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('documents must not contain duplicates');
    const normalized = [...documents].sort((a, b) => a.saleDocumentId.localeCompare(b.saleDocumentId));
    const payloadHash = createHash('sha256').update(JSON.stringify({ customerId: dto.customerId, retryOfBillingRequestId: dto.retryOfBillingRequestId ?? null, reason: dto.reason.trim(), notes: this.optionalText(dto.notes), documents: normalized })).digest('hex');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.billingRequest.findUnique({ where: { creationIdempotencyKey: idempotencyKey }, include: detailInclude });
        if (existing) {
          if (existing.creationPayloadHash !== payloadHash) throw new ConflictException('Idempotency-Key was already used for a different billing request payload');
          return existing;
        }

        await tx.$queryRaw`SELECT "id" FROM "SaleDocument" WHERE "id" IN (${Prisma.join([...ids].sort())}) ORDER BY "id" FOR UPDATE`;
        const records = await tx.saleDocument.findMany({
          where: { id: { in: ids } },
          include: {
            sale: { include: { customer: true, deliveryOrder: true } },
            billingRequestDocuments: { where: { reversedAt: null }, include: { billingRequest: { select: { status: true } } } },
            invoiceDocuments: { where: { reversedAt: null }, include: { invoice: { select: { status: true } } } },
          },
        });
        if (records.length !== ids.length) throw new NotFoundException('One or more sale documents were not found');

        const first = records[0].sale;
        if (records.some((record) => record.sale.customerId !== dto.customerId)) throw new BadRequestException('MIXED_CUSTOMERS');
        if (records.some((record) => record.sale.currencyCode !== first.currencyCode)) throw new BadRequestException('MIXED_CURRENCIES');
        if (records.some((record) => record.sale.legalEntityId !== first.legalEntityId)) throw new BadRequestException('MIXED_LEGAL_ENTITIES');
        if (!first.legalEntityId) throw new BadRequestException('MISSING_LEGAL_ENTITY');
        const customer = first.customer;
        if (!customer?.isActive || !customer.taxId || !customer.fiscalName || !customer.fiscalPostalCode || !customer.fiscalRegime || !customer.fiscalUseCode || !customer.billingEmail) {
          throw new BadRequestException('MISSING_FISCAL_PROFILE');
        }
        if (actor.role === 'SELLER' && records.some((record) => record.sale.userId !== actor.id)) throw new ForbiddenException('SELLER can only create requests for own sales');

        for (const item of normalized) {
          const record = records.find((candidate) => candidate.id === item.saleDocumentId)!;
          if (record.sale.status !== SaleStatus.CONFIRMED) throw new BadRequestException('SALE_NOT_CONFIRMED');
          if (record.status === 'CANCELLED') throw new BadRequestException('DOCUMENT_CANCELLED');
          if (!['SIMPLE_NOTE', 'LARGE_NOTE'].includes(record.documentType)) throw new BadRequestException('DOCUMENT_TYPE_NOT_BILLABLE');
          if (record.sale.deliveryOrder && record.sale.deliveryOrder.status !== 'DELIVERED') throw new BadRequestException('DELIVERY_PENDING');
          const subtotal = new Prisma.Decimal(item.requestedSubtotal);
          const tax = new Prisma.Decimal(item.requestedTax);
          const total = new Prisma.Decimal(item.requestedTotal);
          if (!subtotal.plus(tax).equals(total)) throw new BadRequestException('INVALID_REQUESTED_AMOUNT');
          if (subtotal.greaterThan(record.sale.subtotal.minus(record.sale.discount)) || tax.greaterThan(record.sale.tax)) throw new BadRequestException('INVALID_REQUESTED_TAX_BREAKDOWN');
          const activeRequested = record.billingRequestDocuments.filter((entry) => !['REJECTED', 'CANCELLED'].includes(entry.billingRequest.status)).reduce((sum, entry) => sum.plus(entry.requestedTotal), new Prisma.Decimal(0));
          const activeInvoiced = record.invoiceDocuments.filter((entry) => entry.invoice.status === 'ACTIVE').reduce((sum, entry) => sum.plus(entry.totalApplied), new Prisma.Decimal(0));
          try { validateRequestedAmount(total, record.sale.total.minus(activeRequested).minus(activeInvoiced)); }
          catch (error) { if (error instanceof BillingBalanceError) throw new ConflictException(error.code); throw error; }
        }

        if (dto.retryOfBillingRequestId) {
          const previous = await tx.billingRequest.findUnique({ where: { id: dto.retryOfBillingRequestId }, select: { status: true, customerId: true } });
          if (!previous) throw new NotFoundException('Previous billing request not found');
          if (!['REJECTED', 'CANCELLED'].includes(previous.status)) throw new BadRequestException('Only terminal rejected or cancelled requests can be retried');
          if (previous.customerId !== dto.customerId) throw new BadRequestException('Retry must preserve customer');
        }

        const created = await tx.billingRequest.create({ data: {
          saleId: records.length === 1 ? records[0].sale.id : null,
          customerId: dto.customerId, requestedByUserId: actor.id, status: BillingRequestStatus.REQUESTED,
          reason: dto.reason.trim(), notes: this.optionalText(dto.notes), creationIdempotencyKey: idempotencyKey,
          creationPayloadHash: payloadHash, retryOfBillingRequestId: dto.retryOfBillingRequestId,
          history: { create: { toStatus: BillingRequestStatus.REQUESTED, changedByUserId: actor.id, reason: dto.reason.trim(), notes: this.optionalText(dto.notes), compositionSnapshot: normalized.map((item) => ({ saleDocumentId: item.saleDocumentId, requestedSubtotal: item.requestedSubtotal, requestedTax: item.requestedTax, requestedTotal: item.requestedTotal })) } },
        }, include: detailInclude });
        for (const item of normalized) await tx.billingRequestSaleDocument.create({ data: {
          billingRequestId: created.id, saleDocumentId: item.saleDocumentId,
          requestedSubtotal: new Prisma.Decimal(item.requestedSubtotal), requestedTax: new Prisma.Decimal(item.requestedTax), requestedTotal: new Prisma.Decimal(item.requestedTotal), createdByUserId: actor.id,
        } });
        await this.writeAudit(tx, actor, 'BILLING_REQUEST_CREATED', 'BillingRequest', created.id, {
          after: this.toAuditJson({ status: created.status, customerId: created.customerId, documents: normalized }),
          reason: dto.reason.trim(),
          correlationId: idempotencyKey,
        });
        return tx.billingRequest.findUnique({ where: { id: created.id }, include: detailInclude });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.billingRequest.findUnique({ where: { creationIdempotencyKey: idempotencyKey }, include: detailInclude });
        if (existing?.creationPayloadHash === payloadHash) return existing;
        throw new ConflictException('Concurrent billing request creation is still in progress; retry with the same Idempotency-Key');
      }
      throw error;
    }
  }

  approve(id: string, dto: ReviewBillingRequestDto, actor: Actor) {
    return this.reviewCommand(id, BillingRequestStatus.APPROVED, dto, actor);
  }

  reject(id: string, dto: ReviewBillingRequestDto, actor: Actor) {
    return this.reviewCommand(id, BillingRequestStatus.REJECTED, dto, actor);
  }

  async update(id: string, dto: UpdateBillingRequestDto, actor: Actor) {
    return this.prisma.$transaction(
      async (tx) => {
        const current = await tx.billingRequest.findUnique({
          where: { id },
          include: { sale: { select: { userId: true } } },
        });
        if (!current) throw new NotFoundException('Billing request not found');
        if (current.creationIdempotencyKey && dto.status) throw new BadRequestException('Use an explicit billing request command for status transitions');
        this.assertCanEdit(
          current.status,
          current.sale?.userId ?? '',
          dto.status,
          actor,
        );

        const nextStatus = dto.status;
        if (!nextStatus || nextStatus === current.status) {
          if (current.status !== BillingRequestStatus.REQUESTED)
            throw new BadRequestException(
              'Only REQUESTED requests can edit reason or notes',
            );
          return tx.billingRequest.update({
            where: { id },
            data: {
              ...(dto.reason !== undefined
                ? { reason: dto.reason.trim() }
                : {}),
              ...(dto.notes !== undefined
                ? { notes: this.optionalText(dto.notes) }
                : {}),
            },
            include: detailInclude,
          });
        }

        if (!transitions[current.status].includes(nextStatus)) {
          throw new BadRequestException(
            `Invalid billing request transition: ${current.status} to ${nextStatus}`,
          );
        }
        const reason = dto.reason?.trim();
        if (!reason)
          throw new BadRequestException(
            'reason is required for status transitions',
          );

        await tx.billingRequestHistory.create({
          data: {
            billingRequestId: id,
            fromStatus: current.status,
            toStatus: nextStatus,
            changedByUserId: actor.id,
            reason,
            notes: this.optionalText(dto.notes),
          },
        });
        return tx.billingRequest.update({
          where: { id },
          data: {
            status: nextStatus,
            reviewedByUserId: actor.id,
            reviewedAt: new Date(),
            reason,
            notes: this.optionalText(dto.notes),
          },
          include: detailInclude,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  cancel(id: string, dto: CancelBillingRequestDto, actor: Actor) {
    return this.reviewCommand(id, BillingRequestStatus.CANCELLED, dto, actor);
  }

  async linkInvoice(id: string, dto: LinkInvoiceDto, actor: Actor, idempotencyKey: string) {
    const normalizedApplications = [...dto.applications].sort((a, b) => a.saleDocumentId.localeCompare(b.saleDocumentId));
    const payloadHash = createHash('sha256').update(JSON.stringify({ id, expectedVersion: dto.expectedVersion, invoiceId: dto.invoiceId ?? null, invoice: dto.invoice ?? null, applications: normalizedApplications })).digest('hex');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const replay = await tx.invoice.findUnique({ where: { linkIdempotencyKey: idempotencyKey }, include: { documents: { include: { itemApplications: true } } } });
        if (replay) {
          if (replay.linkPayloadHash !== payloadHash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
          return replay;
        }

        await tx.$queryRaw`SELECT "id" FROM "BillingRequest" WHERE "id" = ${id} FOR UPDATE`;
        const request = await tx.billingRequest.findUnique({
          where: { id },
          include: { documents: { where: { reversedAt: null }, include: { saleDocument: { include: { sale: { include: { items: true } }, invoiceDocuments: { where: { reversedAt: null }, include: { invoice: { select: { id: true, status: true } } } } } } } } },
        });
        if (!request) throw new NotFoundException('Billing request not found');
        if (request.version !== dto.expectedVersion) throw new ConflictException('VERSION_CONFLICT');
        if (request.status !== BillingRequestStatus.APPROVED) throw new BadRequestException('BILLING_REQUEST_NOT_APPROVED');
        if (new Set(normalizedApplications.map((item) => item.saleDocumentId)).size !== normalizedApplications.length) throw new BadRequestException('DUPLICATE_DOCUMENT_APPLICATION');

        const requestDocuments = new Map(request.documents.map((item) => [item.saleDocumentId, item]));
        if (normalizedApplications.some((item) => !requestDocuments.has(item.saleDocumentId))) throw new BadRequestException('DOCUMENT_NOT_IN_BILLING_REQUEST');
        const documentIds = normalizedApplications.map((item) => item.saleDocumentId);
        await tx.$queryRaw`SELECT "id" FROM "SaleDocument" WHERE "id" IN (${Prisma.join(documentIds)}) ORDER BY "id" FOR UPDATE`;

        const firstSale = requestDocuments.get(normalizedApplications[0].saleDocumentId)!.saleDocument.sale;
        const sum = (values: Prisma.Decimal[]) => values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0));
        for (const application of normalizedApplications) {
          const relation = requestDocuments.get(application.saleDocumentId)!;
          const sale = relation.saleDocument.sale;
          if (sale.legalEntityId !== firstSale.legalEntityId) throw new BadRequestException('MIXED_LEGAL_ENTITIES');
          if (sale.currencyCode !== firstSale.currencyCode) throw new BadRequestException('MIXED_CURRENCIES');
          const subtotal = new Prisma.Decimal(application.subtotalApplied);
          const tax = new Prisma.Decimal(application.taxApplied);
          const total = new Prisma.Decimal(application.totalApplied);
          if (!subtotal.plus(tax).equals(total)) throw new BadRequestException('INVALID_APPLIED_AMOUNT');
          const itemSubtotal = sum(application.items.map((item) => new Prisma.Decimal(item.subtotalApplied)));
          const itemTax = sum(application.items.map((item) => new Prisma.Decimal(item.taxApplied)));
          const itemTotal = sum(application.items.map((item) => new Prisma.Decimal(item.totalApplied)));
          if (!itemSubtotal.equals(subtotal) || !itemTax.equals(tax) || !itemTotal.equals(total)) throw new BadRequestException('ITEM_APPLICATION_MISMATCH');
          const saleItemIds = new Set(sale.items.map((item) => item.id));
          if (new Set(application.items.map((item) => item.saleItemId)).size !== application.items.length || application.items.some((item) => !saleItemIds.has(item.saleItemId))) throw new BadRequestException('INVALID_SALE_ITEM_APPLICATION');
          if (total.greaterThan(relation.requestedTotal)) throw new ConflictException('OVER_INVOICED');
          const activeInvoiced = sum(relation.saleDocument.invoiceDocuments.filter((entry) => entry.invoice.status === InvoiceStatus.ACTIVE).map((entry) => entry.totalApplied));
          if (total.greaterThan(sale.total.minus(activeInvoiced))) throw new ConflictException('OVER_INVOICED');
        }

        const appliedSubtotal = sum(normalizedApplications.map((item) => new Prisma.Decimal(item.subtotalApplied)));
        const appliedTax = sum(normalizedApplications.map((item) => new Prisma.Decimal(item.taxApplied)));
        const appliedTotal = sum(normalizedApplications.map((item) => new Prisma.Decimal(item.totalApplied)));
        let invoice;
        if (dto.invoiceId) {
          invoice = await tx.invoice.findUnique({ where: { id: dto.invoiceId } });
          if (!invoice) throw new NotFoundException('Invoice not found');
          if (invoice.status !== InvoiceStatus.ACTIVE) throw new BadRequestException('INVOICE_NOT_ACTIVE');
          if (invoice.legalEntityId !== firstSale.legalEntityId) throw new BadRequestException('MIXED_LEGAL_ENTITIES');
          if (invoice.currencyCode !== firstSale.currencyCode) throw new BadRequestException('MIXED_CURRENCIES');
          await tx.invoice.update({ where: { id: invoice.id }, data: { linkIdempotencyKey: idempotencyKey, linkPayloadHash: payloadHash } });
        } else {
          const external = dto.invoice!;
          if (external.legalEntityId !== firstSale.legalEntityId) throw new BadRequestException('MIXED_LEGAL_ENTITIES');
          if (external.currencyCode !== firstSale.currencyCode) throw new BadRequestException('MIXED_CURRENCIES');
          const invoiceSubtotal = new Prisma.Decimal(external.subtotal).minus(external.discount);
          if (!appliedSubtotal.equals(invoiceSubtotal) || !appliedTax.equals(external.tax) || !appliedTotal.equals(external.total)) throw new BadRequestException('INVOICE_TOTAL_MISMATCH');
          invoice = await tx.invoice.create({ data: { legalEntityId: external.legalEntityId, currencyCode: external.currencyCode, series: external.series, folio: external.folio, uuid: external.uuid, subtotal: new Prisma.Decimal(external.subtotal), discount: new Prisma.Decimal(external.discount), tax: new Prisma.Decimal(external.tax), total: new Prisma.Decimal(external.total), createdByUserId: actor.id, linkIdempotencyKey: idempotencyKey, linkPayloadHash: payloadHash } });
          if (external.substitutesInvoiceId) {
            const original = await tx.invoice.findUnique({ where: { id: external.substitutesInvoiceId } });
            if (!original || original.status !== InvoiceStatus.ACTIVE) throw new BadRequestException('INVOICE_TO_REPLACE_NOT_ACTIVE');
            await tx.invoice.update({ where: { id: original.id, version: original.version }, data: { status: InvoiceStatus.SUBSTITUTED, substitutedByInvoiceId: invoice.id, version: { increment: 1 } } });
          }
        }
        if (!appliedSubtotal.equals(invoice.subtotal.minus(invoice.discount)) || !appliedTax.equals(invoice.tax) || !appliedTotal.equals(invoice.total)) throw new BadRequestException('INVOICE_TOTAL_MISMATCH');

        for (const application of normalizedApplications) {
          const documentApplication = await tx.invoiceSaleDocument.create({ data: { invoiceId: invoice.id, saleDocumentId: application.saleDocumentId, subtotalApplied: new Prisma.Decimal(application.subtotalApplied), taxApplied: new Prisma.Decimal(application.taxApplied), totalApplied: new Prisma.Decimal(application.totalApplied), createdByUserId: actor.id } });
          for (const item of application.items) await tx.invoiceSaleItemApplication.create({ data: { invoiceSaleDocumentId: documentApplication.id, saleItemId: item.saleItemId, subtotalApplied: new Prisma.Decimal(item.subtotalApplied), taxApplied: new Prisma.Decimal(item.taxApplied), totalApplied: new Prisma.Decimal(item.totalApplied), createdByUserId: actor.id } });
        }
        await tx.billingRequest.update({ where: { id, version: dto.expectedVersion }, data: { version: { increment: 1 } } });
        await this.writeAudit(tx, actor, 'INVOICE_LINKED', 'Invoice', invoice.id, {
          after: this.toAuditJson({ billingRequestId: id, applications: normalizedApplications }),
          correlationId: idempotencyKey,
          context: { billingRequestId: id },
        });
        await this.writeAudit(tx, actor, 'INVOICE_APPLICATIONS_CREATED', 'Invoice', invoice.id, {
          after: this.toAuditJson({ applications: normalizedApplications }),
          correlationId: idempotencyKey,
          context: { billingRequestId: id },
        });
        if (dto.invoice?.substitutesInvoiceId) {
          await this.writeAudit(tx, actor, 'INVOICE_SUBSTITUTED', 'Invoice', dto.invoice.substitutesInvoiceId, {
            after: { substitutedByInvoiceId: invoice.id },
            correlationId: idempotencyKey,
            context: { billingRequestId: id },
          });
        }
        return tx.invoice.findUnique({ where: { id: invoice.id }, include: { documents: { include: { itemApplications: true } } } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('IDEMPOTENCY_CONFLICT');
      throw error;
    }
  }

  private async reviewCommand(id: string, nextStatus: BillingRequestStatus, dto: ReviewBillingRequestDto, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.billingRequest.findUnique({ where: { id }, include: { documents: true } });
      if (!current) throw new NotFoundException('Billing request not found');
      if (current.version !== dto.expectedVersion) throw new ConflictException('Billing request version does not match expectedVersion');
      if (!transitions[current.status].includes(nextStatus)) throw new BadRequestException(`Invalid billing request transition: ${current.status} to ${nextStatus}`);
      const reason = dto.reason.trim();
      await tx.billingRequestHistory.create({ data: { billingRequestId: id, fromStatus: current.status, toStatus: nextStatus, changedByUserId: actor.id, reason, notes: this.optionalText(dto.notes), compositionSnapshot: current.documents.map((document) => ({ saleDocumentId: document.saleDocumentId, requestedSubtotal: document.requestedSubtotal.toString(), requestedTax: document.requestedTax.toString(), requestedTotal: document.requestedTotal.toString() })) } });
      const updated = await tx.billingRequest.update({ where: { id, version: dto.expectedVersion }, data: { status: nextStatus, reviewedByUserId: actor.id, reviewedAt: new Date(), reason, notes: this.optionalText(dto.notes), version: { increment: 1 } }, include: detailInclude });
      if (!updated) throw new ConflictException('Billing request version does not match expectedVersion');
      await this.writeAudit(tx, actor, nextStatus === BillingRequestStatus.CANCELLED ? 'BILLING_REQUEST_CANCELLED' : `BILLING_REQUEST_${nextStatus}`, 'BillingRequest', id, {
        before: { status: current.status, version: current.version },
        after: { status: updated.status, version: updated.version },
        reason,
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private writeAudit(
    tx: Prisma.TransactionClient,
    actor: Actor,
    action: string,
    entityType: string,
    entityId: string,
    evidence: {
      before?: Prisma.InputJsonValue;
      after?: Prisma.InputJsonValue;
      reason?: string;
      correlationId?: string;
      context?: Prisma.InputJsonValue;
    },
  ) {
    return tx.billingAuditLog.create({
      data: {
        actorUserId: actor.id,
        action,
        entityType,
        entityId,
        before: evidence.before,
        after: evidence.after,
        reason: evidence.reason,
        correlationId: evidence.correlationId,
        context: evidence.context,
      },
    });
  }

  private toAuditJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private buildWhere(
    query: ListBillingRequestsQueryDto,
  ): Prisma.BillingRequestWhereInput {
    return {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.saleId ? { saleId: query.saleId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.locationId ? { sale: { locationId: query.locationId } } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            requestedAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };
  }

  private applyScope(
    where: Prisma.BillingRequestWhereInput,
    actor: Actor,
  ): Prisma.BillingRequestWhereInput {
    if (actor.role === 'ADMIN' || actor.role === 'BILLING') return where;
    if (actor.role === 'SELLER')
      return { AND: [where, { OR: [{ sale: { is: { userId: actor.id } } }, { documents: { some: { saleDocument: { sale: { userId: actor.id } } } } }] }] };
    if (actor.role === 'COLLECTIONS')
      return { AND: [where, { OR: [{ accountReceivables: { some: {} } }, { documents: { some: { saleDocument: { sale: { accountReceivable: { isNot: null } } } } } }] }] };
    return { id: '__no_visible_request__' };
  }

  private assertCanEdit(
    status: BillingRequestStatus,
    saleUserId: string,
    nextStatus: BillingRequestStatus | undefined,
    actor: Actor,
  ) {
    if (actor.role === 'ADMIN') return;
    if (actor.role !== 'SELLER' || saleUserId !== actor.id)
      throw new ForbiddenException('Billing request is outside the user scope');
    if (status !== BillingRequestStatus.REQUESTED)
      throw new ForbiddenException('SELLER can only edit REQUESTED requests');
    if (nextStatus && nextStatus !== status)
      throw new ForbiddenException('SELLER cannot transition billing requests');
  }

  private toListItem(item: Record<string, any>) {
    return {
      id: item.id,
      customerId: item.customerId,
      customerName: item.customer?.name ?? null,
      saleId: item.saleId,
      saleNumber: item.sale?.saleNumber ?? null,
      locationId: item.sale?.locationId ?? null,
      requestedByUserId: item.requestedByUserId,
      reviewedByUserId: item.reviewedByUserId,
      status: item.status,
      requestedAt: item.requestedAt,
      reviewedAt: item.reviewedAt,
      reason: item.reason,
      notes: item.notes,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private optionalText(value?: string | null) {
    const normalized = value?.trim();
    return normalized || null;
  }
}
