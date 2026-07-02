import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CancelSaleDto, CreateSaleDto, ListSalesQueryDto } from './dto';
import { SalesService } from './sales.service';

@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @Roles('ADMIN', 'SELLER', 'COLLECTIONS')
  async findAll(
    @Query() query: ListSalesQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Sales retrieved successfully',
      data: await this.salesService.findAll(query, currentUser),
    };
  }

  @Get(':id')
  @Roles('ADMIN', 'SELLER', 'COLLECTIONS')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Sale retrieved successfully',
      data: await this.salesService.findOne(id, currentUser),
    };
  }

  @Post()
  @Roles('ADMIN', 'SELLER')
  async create(
    @Body() body: CreateSaleDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return {
      success: true,
      message: 'Sale created successfully',
      data: await this.salesService.create(body, currentUser, idempotencyKey.trim()),
    };
  }

  @Post(':id/cancel')
  @Roles('ADMIN')
  async cancel(
    @Param('id') id: string,
    @Body() body: CancelSaleDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!body.reason?.trim()) {
      throw new BadRequestException('reason is required');
    }

    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return {
      success: true,
      message: 'Sale cancelled successfully',
      data: await this.salesService.cancel(id, body, currentUser, idempotencyKey.trim()),
    };
  }
}
