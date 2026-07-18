import {
  Body,
  Controller,
  Get,
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
  CreateScaleTicketDto,
  ListDailyCloseQueryDto,
  OpenDailyCloseDto,
  ReasonedDailyCloseDto,
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
  ) {
    return this.response(
      'Daily closes retrieved successfully',
      await this.service.list(query),
    );
  }
  @Get(':id') @Roles('ADMIN', 'SELLER', 'WAREHOUSE', 'COLLECTIONS') async get(
    @Param('id') id: string,
  ) {
    return this.response(
      'Daily close retrieved successfully',
      await this.service.get(id),
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
  ) {
    return this.response(
      'Expense registered successfully',
      await this.service.addExpense(id, dto, user),
    );
  }
  @Post(':id/scale-tickets') @Roles('ADMIN', 'SELLER') async ticket(
    @Param('id') id: string,
    @Body() dto: CreateScaleTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.response(
      'Scale ticket registered successfully',
      await this.service.addScaleTicket(id, dto, user),
    );
  }
  @Post(':id/validate') @Roles('ADMIN', 'SELLER') async validate(
    @Param('id') id: string,
  ) {
    return this.response(
      'Daily close validated successfully',
      await this.service.validate(id),
    );
  }
  @Post(':id/refresh')
  @Roles('ADMIN', 'SELLER', 'WAREHOUSE', 'COLLECTIONS')
  async refresh(@Param('id') id: string) {
    return this.response(
      'Daily close refreshed successfully',
      await this.service.refresh(id),
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
