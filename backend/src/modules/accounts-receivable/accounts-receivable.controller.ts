import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AccountsReceivableService } from './accounts-receivable.service';
import { ListAccountsReceivableQueryDto, RegisterReceivablePaymentDto } from './dto';

@Controller('accounts-receivable')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccountsReceivableController {
  constructor(private readonly accountsReceivableService: AccountsReceivableService) {}

  @Get()
  @Roles('ADMIN', 'COLLECTIONS')
  async findAll(
    @Query() query: ListAccountsReceivableQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Accounts receivable retrieved successfully',
      data: await this.accountsReceivableService.findAll(query, currentUser),
    };
  }

  @Get(':id')
  @Roles('ADMIN', 'COLLECTIONS')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Account receivable retrieved successfully',
      data: await this.accountsReceivableService.findOne(id, currentUser),
    };
  }

  @Post(':id/payments')
  @Roles('ADMIN', 'COLLECTIONS')
  async registerPayment(
    @Param('id') id: string,
    @Body() body: RegisterReceivablePaymentDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return {
      success: true,
      message: 'Payment registered successfully',
      data: await this.accountsReceivableService.registerPayment(id, body, currentUser, idempotencyKey.trim()),
    };
  }
}
