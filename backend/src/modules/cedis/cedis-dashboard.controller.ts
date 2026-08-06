import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CedisBranchHistoryQueryDto,
  CedisDashboardQueryDto,
  CedisInventorySummaryQueryDto,
} from './dto';
import { CedisDashboardQueryService } from './cedis-dashboard.query.service';
import { CedisInventorySummaryQueryService } from './cedis-inventory-summary.query.service';

@Controller('cedis')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'WAREHOUSE', 'SELLER')
@RequirePermissions(PERMISSIONS.CEDIS_VIEW)
export class CedisDashboardController {
  constructor(
    private readonly queryService: CedisDashboardQueryService,
    private readonly inventorySummaryService: CedisInventorySummaryQueryService,
  ) {}

  @Get('dashboard')
  async dashboard(
    @Query() query: CedisDashboardQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'CEDIS dashboard retrieved successfully',
      data: await this.queryService.getDashboard(query, user),
    };
  }

  @Get('inventory-summary')
  @Roles('ADMIN', 'WAREHOUSE')
  async inventorySummary(
    @Query() query: CedisInventorySummaryQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'CEDIS inventory summary retrieved successfully',
      data: await this.inventorySummaryService.getSummary(query, user),
    };
  }

  @Get('branches/:branchId/history')
  async branchHistory(
    @Param('branchId') branchId: string,
    @Query() query: CedisBranchHistoryQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Branch supply cycle history retrieved successfully',
      data: await this.queryService.getBranchHistory(branchId, query, user),
    };
  }

  @Get('branch-supply-cycles/:id/summary')
  async cycleSummary(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Branch supply cycle summary retrieved successfully',
      data: await this.queryService.getCycleSummary(id, user),
    };
  }
}
