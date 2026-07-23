import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateExpenseDto,
  CreateDailyCloseInventoryCountDto,
  CreateScaleTicketDto,
  ListDailyCloseQueryDto,
  OpenDailyCloseDto,
  RecordCashCountDto,
  ReasonedDailyCloseDto,
  UpdateDailyCloseInventoryCountDto,
  VersionedDailyCloseDto,
} from './dto';
import { PointOfSaleDailyCloseService } from './point-of-sale-daily-close.service';

@Controller('point-of-sale-daily-closes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PointOfSaleDailyCloseController {
  constructor(private readonly service: PointOfSaleDailyCloseService) {}
  private response(message: string, data: unknown) {
    return { success: true, message, data };
  }
  @Get() @Roles('ADMIN', 'SELLER', 'WAREHOUSE', 'COLLECTIONS') async list(
    @Query() query: ListDailyCloseQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.response(
      'Daily closes retrieved successfully',
      await this.service.list(query, user),
    );
  }
  @Get(':id') @Roles('ADMIN', 'SELLER', 'WAREHOUSE', 'COLLECTIONS') async get(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.response(
      'Daily close retrieved successfully',
      await this.service.get(id, user),
    );
  }
  @Post() @Roles('ADMIN', 'SELLER') async open(
    @Body() dto: OpenDailyCloseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.response(
      'Daily close opened successfully',
      await this.service.open(dto, user),
    );
  }
  @Post(':id/expenses') @Roles('ADMIN', 'SELLER') async expense(
    @Param('id') id: string,
    @Body() dto: CreateExpenseDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) throw new BadRequestException('Idempotency-Key header is required');
    return this.response(
      'Expense registered successfully',
      await this.service.addExpense(id, dto, user, idempotencyKey.trim()),
    );
  }
  @Post(':id/scale-ticket-references') @Roles('ADMIN', 'SELLER') async ticket(
    @Param('id') id: string,
    @Body() dto: CreateScaleTicketDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) throw new BadRequestException('Idempotency-Key header is required');
    return this.response(
      'Scale ticket registered successfully',
      await this.service.addScaleTicket(id, dto, user, idempotencyKey.trim()),
    );
  }
  @Post(':id/cash-count') @Roles('ADMIN', 'SELLER') async recordCashCount(
    @Param('id') id: string,
    @Body() dto: RecordCashCountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.response(
      'Cash count recorded successfully',
      await this.service.recordCashCount(id, dto, user),
    );
  }
  @Get(':id/reconciliation') @Roles('ADMIN', 'SELLER', 'WAREHOUSE') async reconciliation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.response(
      'Daily close inventory reconciliation retrieved successfully',
      await this.service.getReconciliation(id, user),
    );
  }
  @Post(':id/inventory-counts') @Roles('ADMIN', 'SELLER') async createInventoryCount(
    @Param('id') id: string,
    @Body() dto: CreateDailyCloseInventoryCountDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) throw new BadRequestException('Idempotency-Key header is required');
    return this.response(
      'Daily close inventory count registered successfully',
      await this.service.createInventoryCount(id, dto, user, idempotencyKey.trim()),
    );
  }
  @Patch(':id/inventory-counts/:countId') @Roles('ADMIN', 'SELLER') async updateInventoryCount(
    @Param('id') id: string,
    @Param('countId') countId: string,
    @Body() dto: UpdateDailyCloseInventoryCountDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.response(
      'Daily close inventory count updated successfully',
      await this.service.updateInventoryCount(id, countId, dto, user),
    );
  }
  @Delete(':id/inventory-counts/:countId') @Roles('ADMIN', 'SELLER') async deleteInventoryCount(
    @Param('id') id: string,
    @Param('countId') countId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.response(
      'Daily close inventory count deleted successfully',
      await this.service.deleteInventoryCount(id, countId, user),
    );
  }
  @Post(':id/validate') @Roles('ADMIN', 'SELLER') async validate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.response(
      'Daily close validated successfully',
      await this.service.validate(id, user),
    );
  }
  @Post(':id/refresh')
  @Roles('ADMIN', 'SELLER', 'WAREHOUSE', 'COLLECTIONS')
  async refresh(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.response(
      'Daily close refreshed successfully',
      await this.service.refresh(id, user),
    );
  }
  @Patch(':id/review') @Roles('ADMIN') async review(
    @Param('id') id: string,
    @Body() dto: VersionedDailyCloseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.response(
      'Daily close reviewed successfully',
      await this.service.review(id, dto, user),
    );
  }
  @Patch(':id/close') @Roles('ADMIN') async close(
    @Param('id') id: string,
    @Body() dto: VersionedDailyCloseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.response(
      'Daily close closed successfully',
      await this.service.close(id, dto, user),
    );
  }
  @Patch(':id/cancel') @Roles('ADMIN') async cancel(
    @Param('id') id: string,
    @Body() dto: ReasonedDailyCloseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.response(
      'Daily close cancelled successfully',
      await this.service.cancel(id, dto, user),
    );
  }
  @Patch(':id/reopen') @Roles('ADMIN') async reopen(
    @Param('id') id: string,
    @Body() dto: ReasonedDailyCloseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.response(
      'Daily close reopened successfully',
      await this.service.reopen(id, dto, user),
    );
  }
}
