import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CashClosingReportQueryDto,
  DashboardReportQueryDto,
  InventoryLowStockReportQueryDto,
  SalesDailyReportQueryDto,
} from './dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  @Roles('ADMIN', 'SELLER', 'WAREHOUSE', 'COLLECTIONS', 'DRIVER')
  async getDashboard(
    @Query() query: DashboardReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Dashboard report retrieved successfully',
      data: await this.reportsService.getDashboard(query, user),
    };
  }

  @Get('sales-daily')
  @Roles('ADMIN', 'SELLER')
  async getSalesDaily(
    @Query() query: SalesDailyReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Daily sales report retrieved successfully',
      data: await this.reportsService.getSalesDaily(query, user),
    };
  }

  @Get('inventory-low-stock')
  @Roles('ADMIN', 'WAREHOUSE')
  async getInventoryLowStock(
    @Query() query: InventoryLowStockReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Low stock report retrieved successfully',
      data: await this.reportsService.getInventoryLowStock(query, user),
    };
  }

  @Get('cash-closing')
  @Roles('ADMIN', 'SELLER')
  async getCashClosing(
    @Query() query: CashClosingReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Cash closing report retrieved successfully',
      data: await this.reportsService.getCashClosing(query, user),
    };
  }
}
