import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CancelPurchaseDto, CreatePurchaseDto, ListPurchasesQueryDto } from './dto';
import { PurchasesService } from './purchases.service';

@Controller('purchases')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  @Roles('ADMIN', 'WAREHOUSE')
  async findAll(@Query() query: ListPurchasesQueryDto) {
    return {
      success: true,
      message: 'Purchases retrieved successfully',
      data: await this.purchasesService.findAll(query),
    };
  }

  @Get(':id')
  @Roles('ADMIN', 'WAREHOUSE')
  async findOne(@Param('id') id: string) {
    return {
      success: true,
      message: 'Purchase retrieved successfully',
      data: await this.purchasesService.findOne(id),
    };
  }

  @Post()
  @Roles('ADMIN', 'WAREHOUSE')
  async create(
    @Body() body: CreatePurchaseDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return {
      success: true,
      message: 'Purchase created successfully',
      data: await this.purchasesService.create(body, currentUser, idempotencyKey.trim()),
    };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles('ADMIN')
  async cancel(
    @Param('id') id: string,
    @Body() body: CancelPurchaseDto,
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
      message: 'Purchase cancelled successfully',
      data: await this.purchasesService.cancel(id, body, currentUser, idempotencyKey.trim()),
    };
  }
}
