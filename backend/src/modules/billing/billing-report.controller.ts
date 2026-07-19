import { Controller, Get, Param, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { BillingReportService } from './billing-report.service';
import { BillingReportQueryDto } from './dto/billing-report-query.dto';

@Controller('billing/reportable-notes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingReportController {
  constructor(private readonly service: BillingReportService) {}

  @Get()
  @Roles('ADMIN', 'BILLING', 'SELLER', 'COLLECTIONS')
  list(@Query() query: BillingReportQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.list(query, user);
  }

  @Get('summary')
  @Roles('ADMIN', 'BILLING', 'SELLER', 'COLLECTIONS')
  summary(@Query() query: BillingReportQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.summary(query, user);
  }

  @Get('export')
  @Roles('ADMIN', 'BILLING')
  async export(@Query() query: BillingReportQueryDto, @CurrentUser() user: AuthenticatedUser) {
    const file = await this.service.exportFile(query, user);
    return new StreamableFile(file.stream, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
    });
  }

  @Get(':saleDocumentId')
  @Roles('ADMIN', 'BILLING', 'SELLER', 'COLLECTIONS')
  detail(@Param('saleDocumentId') saleDocumentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.detail(saleDocumentId, user);
  }
}
