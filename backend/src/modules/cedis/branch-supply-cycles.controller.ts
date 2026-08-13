import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  BranchSupplyCycleCommandDto,
  CancelBranchSupplyCycleDto,
  CloseBranchSupplyCycleDto,
  OpenBranchSupplyCycleDto,
  RefreshBranchSupplyCycleDto,
  ReopenBranchSupplyCycleDto,
} from './dto';
import { BranchSupplyCyclesService } from './branch-supply-cycles.service';

@Controller('cedis/branch-supply-cycles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BranchSupplyCyclesController {
  constructor(private readonly service: BranchSupplyCyclesService) {}

  @Post()
  @Roles('ADMIN', 'WAREHOUSE')
  @RequirePermissions(PERMISSIONS.CEDIS_DISPATCH)
  async open(
    @Body() body: OpenBranchSupplyCycleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return {
      success: true,
      message: 'Branch supply cycle opened successfully',
      data: await this.service.open(
        body,
        user,
        this.requireIdempotencyKey(idempotencyKey),
      ),
    };
  }

  @Get(':id')
  @Roles('ADMIN', 'WAREHOUSE', 'SELLER')
  @RequirePermissions(PERMISSIONS.CEDIS_VIEW)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Branch supply cycle retrieved successfully',
      data: await this.service.findOne(id, user),
    };
  }

  @Post(':id/supplies')
  @Roles('ADMIN', 'WAREHOUSE')
  @RequirePermissions(PERMISSIONS.CEDIS_DISPATCH)
  async supply(
    @Param('id') id: string,
    @Body() body: BranchSupplyCycleCommandDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return {
      success: true,
      message: 'Branch supply transfer created successfully',
      data: await this.service.createSupply(
        id,
        body,
        user,
        this.requireIdempotencyKey(idempotencyKey),
      ),
    };
  }

  @Post(':id/returns')
  @Roles('ADMIN', 'WAREHOUSE', 'SELLER')
  @RequirePermissions(PERMISSIONS.CEDIS_REQUEST_RETURNS)
  async return(
    @Param('id') id: string,
    @Body() body: BranchSupplyCycleCommandDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return {
      success: true,
      message: 'Branch return transfer created successfully',
      data: await this.service.createReturn(
        id,
        body,
        user,
        this.requireIdempotencyKey(idempotencyKey),
      ),
    };
  }

  @Post(':id/refresh')
  @Roles('ADMIN', 'WAREHOUSE')
  @RequirePermissions(PERMISSIONS.CEDIS_RECONCILE)
  async refresh(
    @Param('id') id: string,
    @Body() body: RefreshBranchSupplyCycleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return {
      success: true,
      message: 'Branch supply cycle refreshed successfully',
      data: await this.service.refresh(
        id,
        body,
        user,
        this.requireIdempotencyKey(idempotencyKey),
      ),
    };
  }

  @Post(':id/close')
  @Roles('ADMIN')
  @RequirePermissions(PERMISSIONS.CEDIS_CLOSE)
  async close(
    @Param('id') id: string,
    @Body() body: CloseBranchSupplyCycleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return {
      success: true,
      message: 'Branch supply cycle closed successfully',
      data: await this.service.close(
        id,
        body,
        user,
        this.requireIdempotencyKey(idempotencyKey),
      ),
    };
  }

  @Post(':id/reopen')
  @Roles('ADMIN')
  @RequirePermissions(PERMISSIONS.CEDIS_CLOSE)
  async reopen(
    @Param('id') id: string,
    @Body() body: ReopenBranchSupplyCycleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return {
      success: true,
      message: 'Branch supply cycle reopened successfully',
      data: await this.service.reopen(
        id,
        body,
        user,
        this.requireIdempotencyKey(idempotencyKey),
      ),
    };
  }

  @Post(':id/cancel')
  @Roles('ADMIN')
  @RequirePermissions(PERMISSIONS.CEDIS_CLOSE)
  async cancel(
    @Param('id') id: string,
    @Body() body: CancelBranchSupplyCycleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return {
      success: true,
      message: 'Branch supply cycle cancelled successfully',
      data: await this.service.cancel(
        id,
        body,
        user,
        this.requireIdempotencyKey(idempotencyKey),
      ),
    };
  }

  private requireIdempotencyKey(value?: string): string {
    const normalized = value?.trim();
    if (!normalized) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return normalized;
  }
}
