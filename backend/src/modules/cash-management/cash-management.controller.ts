import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CashManagementService } from './cash-management.service';
import { CloseCashShiftDto, CreateCashShiftMovementDto, CreateCashTerminalDto, CurrentCashShiftQueryDto, ListCashTerminalQueryDto, OpenCashShiftDto, UpdateCashTerminalDto } from './dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CashManagementController {
  constructor(private readonly service: CashManagementService) {}

  @Get('cash-terminals') @Roles('ADMIN', 'SELLER')
  listTerminals(@Query() query: ListCashTerminalQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.response('Cash terminals retrieved successfully', this.service.listTerminals(query, user));
  }

  @Post('cash-terminals') @Roles('ADMIN')
  createTerminal(@Body() dto: CreateCashTerminalDto, @CurrentUser() user: AuthenticatedUser) {
    return this.response('Cash terminal registered successfully', this.service.createTerminal(dto, user));
  }

  @Patch('cash-terminals/:id') @Roles('ADMIN')
  updateTerminal(@Param('id') id: string, @Body() dto: UpdateCashTerminalDto, @CurrentUser() user: AuthenticatedUser) {
    return this.response('Cash terminal updated successfully', this.service.updateTerminal(id, dto, user));
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
