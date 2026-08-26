import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { IssuePaymentCfdiDto } from './dto/issue-payment-cfdi.dto';
import { RepIssuanceService } from './rep-issuance.service';

@Controller('billing/payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RepIssuanceController {
  constructor(private readonly service: RepIssuanceService) {}

  @Post(':paymentId/issue-cfdi')
  @Roles('ADMIN', 'BILLING')
  async issue(
    @Param('paymentId') paymentId: string,
    @Body() body: IssuePaymentCfdiDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    const key = idempotencyKey?.trim();
    if (!key)
      throw new BadRequestException('Idempotency-Key header is required');
    if (key.length > 128)
      throw new BadRequestException('IDEMPOTENCY_KEY_TOO_LONG');
    return {
      success: true,
      message: 'Payment CFDI issuance processed successfully',
      data: await this.service.issue(paymentId, body, user, key),
    };
  }
}
