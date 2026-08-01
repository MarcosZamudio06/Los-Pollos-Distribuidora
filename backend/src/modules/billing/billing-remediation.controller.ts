import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { BillingRemediationService } from './billing-remediation.service';
import {
  BillingRemediationQueryDto,
  ResolveBillingRemediationDto,
} from './dto/billing-remediation.dto';

@Controller('billing/remediations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingRemediationController {
  constructor(private readonly service: BillingRemediationService) {}

  @Get()
  @Roles('ADMIN', 'BILLING')
  list(@Query() query: BillingRemediationQueryDto) {
    return this.service.list(query);
  }

  @Post(':id/resolve')
  @Roles('ADMIN')
  async resolve(
    @Param('id') id: string,
    @Body() body: ResolveBillingRemediationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim())
      throw new BadRequestException('Idempotency-Key header is required');
    return this.service.resolve(id, body, user, idempotencyKey.trim());
  }
}
