import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { BillingRemediationService } from './billing-remediation.service';
import { BillingRemediationQueryDto, ResolveBillingRemediationDto } from './dto/billing-remediation.dto';

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
  resolve(@Param('id') id: string, @Body() body: ResolveBillingRemediationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.resolve(id, body, user);
  }
}
