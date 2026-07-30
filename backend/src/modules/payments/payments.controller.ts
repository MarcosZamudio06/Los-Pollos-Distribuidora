import { BadRequestException, Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../../common/authorization/permissions';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CancelPaymentDto } from './dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.PAYMENTS_CANCEL)
  async cancel(
    @Param('id') id: string,
    @Body() body: CancelPaymentDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return {
      success: true,
      message: 'Payment cancelled successfully',
      data: await this.paymentsService.cancel(id, body, currentUser, idempotencyKey.trim()),
    };
  }
}
