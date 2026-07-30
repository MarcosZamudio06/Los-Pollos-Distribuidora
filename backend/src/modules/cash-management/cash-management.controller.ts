import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CashManagementService } from './cash-management.service';
import { ActivateMigratedCashTerminalDto, CloseCashShiftDto, CreateCashShiftMovementDto, CreateCashTerminalDto, CurrentCashShiftQueryDto, ListCashTerminalQueryDto, OpenCashShiftDto, RequestCashTerminalActivationDto, UpdateCashTerminalDto } from './dto';

@Controller()
export class CashManagementController {
  constructor(private readonly service: CashManagementService) {}

  @Get('cash-terminals') @Roles('ADMIN', 'SELLER')
  listTerminals(@Query() query: ListCashTerminalQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.response('Cash terminals retrieved successfully', this.service.listTerminals(query, user));
  }

  @Post('cash-terminals') @RequirePermissions(PERMISSIONS.CASH_TERMINALS_REASSIGN)
  createTerminal(@Body() dto: CreateCashTerminalDto, @CurrentUser() user: AuthenticatedUser) {
    return this.response('Cash terminal registered successfully', this.service.createTerminal(dto, user));
  }

  @Patch('cash-terminals/:id') @RequirePermissions(PERMISSIONS.CASH_TERMINALS_REASSIGN)
  updateTerminal(@Param('id') id: string, @Body() dto: UpdateCashTerminalDto, @CurrentUser() user: AuthenticatedUser) {
    return this.response('Cash terminal updated successfully', this.service.updateTerminal(id, dto, user));
  }

  @Post('cash-terminal-activations') @Roles('ADMIN', 'SELLER')
  requestTerminalActivation(@Body() dto: RequestCashTerminalActivationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.response('Cash terminal activation code issued successfully', this.service.requestTerminalActivation(dto, user));
  }

  @Post('cash-terminals/:id/activate') @RequirePermissions(PERMISSIONS.CASH_TERMINALS_REASSIGN)
  activateMigratedTerminal(@Param('id') id: string, @Body() dto: ActivateMigratedCashTerminalDto, @CurrentUser() user: AuthenticatedUser) {
    return this.response('Migrated cash terminal activated successfully', this.service.activateMigratedTerminal(id, dto, user));
  }

  @Get('cash-shifts/current') @Roles('ADMIN', 'SELLER')
  currentShift(@Query() query: CurrentCashShiftQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.response('Current cash shift retrieved successfully', this.service.currentShift(query.deviceId, user));
  }

  @Post('cash-shifts') @Roles('ADMIN', 'SELLER')
  openShift(@Body() dto: OpenCashShiftDto, @CurrentUser() user: AuthenticatedUser) {
    return this.response('Cash shift opened successfully', this.service.openShift(dto, user));
  }

  @Patch('cash-shifts/:id/close') @Roles('ADMIN', 'SELLER')
  closeShift(@Param('id') id: string, @Body() dto: CloseCashShiftDto, @CurrentUser() user: AuthenticatedUser) {
    return this.response('Cash shift closed successfully', this.service.closeShift(id, dto, user));
  }

  @Post('cash-shifts/:id/movements') @Roles('ADMIN', 'SELLER')
  recordMovement(@Param('id') id: string, @Body() dto: CreateCashShiftMovementDto, @CurrentUser() user: AuthenticatedUser, @Headers('idempotency-key') idempotencyKey?: string) {
    if (!idempotencyKey?.trim()) throw new BadRequestException('Idempotency-Key header is required');
    return this.response('Cash shift movement registered successfully', this.service.recordMovement(id, dto, user, idempotencyKey.trim()));
  }

  private async response(message: string, data: Promise<unknown>) {
    return { success: true, message, data: await data };
  }
}
