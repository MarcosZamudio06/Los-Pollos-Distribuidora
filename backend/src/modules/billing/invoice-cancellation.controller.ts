import { BadRequestException, Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CancelInvoiceDto } from './dto/cancel-invoice.dto';
import { InvoiceCancellationService } from './invoice-cancellation.service';

@Controller('billing/invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoiceCancellationController {
  constructor(private readonly service: InvoiceCancellationService) {}

  @Post(':id/cancel')
  @Roles('ADMIN', 'BILLING')
  async cancel(@Param('id') id: string, @Body() body: CancelInvoiceDto, @CurrentUser() user: AuthenticatedUser, @Headers('idempotency-key') idempotencyKey?: string) {
    if (!idempotencyKey?.trim()) throw new BadRequestException('Idempotency-Key header is required');
    return { success: true, message: 'Invoice cancelled successfully', data: await this.service.cancel(id, body, user, idempotencyKey.trim()) };
  }
}
