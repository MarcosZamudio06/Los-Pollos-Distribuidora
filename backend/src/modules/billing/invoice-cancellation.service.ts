import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CancelInvoiceDto } from './dto/cancel-invoice.dto';

type Actor = Pick<AuthenticatedUser, 'id' | 'role'>;

const cancellationInclude = { documents: { include: { itemApplications: true } }, substitutes: { select: { id: true } } } satisfies Prisma.InvoiceInclude;

@Injectable()
export class InvoiceCancellationService {
  constructor(private readonly prisma: PrismaService) {}

  async cancel(id: string, dto: CancelInvoiceDto, actor: Actor, idempotencyKey: string) {
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException('reason is required');
    const payload = { invoiceId: id, expectedVersion: dto.expectedVersion, reason, actorUserId: actor.id };
    const payloadHash = this.hashPayload(payload);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const replay = await tx.invoice.findFirst({ where: { cancellationIdempotencyKey: idempotencyKey }, include: cancellationInclude });
        if (replay) {
          if (replay.cancellationPayloadHash !== payloadHash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
          return replay;
        }

        await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${id} FOR UPDATE`;
        const invoice = await tx.invoice.findUnique({ where: { id }, include: cancellationInclude });
        if (!invoice) throw new NotFoundException('Invoice not found');
        if (invoice.version !== dto.expectedVersion) throw new ConflictException('VERSION_CONFLICT');
        if (invoice.status !== InvoiceStatus.ACTIVE) throw new BadRequestException('INVOICE_NOT_ACTIVE');
        if (invoice.substitutedByInvoiceId || invoice.substitutes) throw new BadRequestException('INCOMPATIBLE_INVOICE_SUBSTITUTION');

        const applicationIds = invoice.documents.filter((application) => !application.reversedAt).map((application) => application.id);
        if (applicationIds.length) {
          await tx.$queryRaw`SELECT "id" FROM "InvoiceSaleDocument" WHERE "id" IN (${Prisma.join(applicationIds)}) ORDER BY "id" FOR UPDATE`;
        }
        const reversedAt = new Date();
        await tx.invoiceSaleItemApplication.updateMany({
          where: { invoiceSaleDocumentId: { in: applicationIds }, reversedAt: null },
          data: { reversedAt, reversedByUserId: actor.id, reversalReason: reason },
        });
        await tx.invoiceSaleDocument.updateMany({
          where: { invoiceId: id, reversedAt: null },
          data: { reversedAt, reversedByUserId: actor.id, reversalReason: reason },
        });
        const cancelled = await tx.invoice.update({
          where: { id, version: dto.expectedVersion },
          data: { status: InvoiceStatus.CANCELLED, cancelledAt: reversedAt, cancelledByUserId: actor.id, cancellationReason: reason, cancellationIdempotencyKey: idempotencyKey, cancellationPayloadHash: payloadHash, version: { increment: 1 } },
          include: cancellationInclude,
        });
        await tx.billingAuditLog.create({ data: {
          actorUserId: actor.id, action: 'INVOICE_CANCELLED', entityType: 'Invoice', entityId: id,
          before: { status: invoice.status, version: invoice.version, activeApplicationIds: applicationIds },
          after: { status: cancelled.status, version: cancelled.version, reversedApplicationIds: applicationIds },
          reason, correlationId: idempotencyKey,
          context: { releasedBillingBalance: true, reversedDocumentApplications: applicationIds.length },
        } });
        return cancelled;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2034')) {
        const replay = await this.prisma.invoice.findFirst({ where: { cancellationIdempotencyKey: idempotencyKey }, include: cancellationInclude });
        if (!replay) throw new ConflictException('CONCURRENT_INVOICE_CANCELLATION');
        if (replay.cancellationPayloadHash !== payloadHash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
        return replay;
      }
      throw error;
    }
  }

  private hashPayload(payload: object) {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}
