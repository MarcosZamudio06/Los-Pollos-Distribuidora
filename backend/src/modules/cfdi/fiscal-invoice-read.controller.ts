import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ListFiscalInvoicesQueryDto } from './dto/fiscal-invoice-query.dto';
import { FiscalInvoiceReadService } from './fiscal-invoice-read.service';

@Controller('billing/invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FiscalInvoiceReadController {
  constructor(private readonly service: FiscalInvoiceReadService) {}

  @Get()
  @Roles('ADMIN', 'BILLING')
  async list(
    @Query() query: ListFiscalInvoicesQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Fiscal invoices retrieved successfully',
      data: await this.service.list(query, user),
    };
  }

  @Get(':id/status')
  @Roles('ADMIN', 'BILLING')
  async status(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Fiscal invoice status retrieved successfully',
      data: await this.service.status(id, user),
    };
  }

  @Get(':id/cancellation')
  @Roles('ADMIN', 'BILLING')
  async cancellation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Fiscal cancellation status retrieved successfully',
      data: await this.service.cancellation(id, user),
    };
  }

  @Get(':id')
  @Roles('ADMIN', 'BILLING')
  async detail(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Fiscal invoice retrieved successfully',
      data: await this.service.detail(id, user),
    };
  }
}
