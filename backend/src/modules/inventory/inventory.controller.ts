import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateInventoryAdjustmentDto,
  ListInventoryBalancesQueryDto,
  ListInventoryMovementsQueryDto,
} from './dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('balances')
  @Roles('ADMIN', 'WAREHOUSE', 'SELLER')
  async findBalances(@Query() query: ListInventoryBalancesQueryDto) {
    return {
      success: true,
      message: 'Inventory balances retrieved successfully',
      data: await this.inventoryService.findBalances(query),
    };
  }

  @Post('adjustments')
  @Roles('ADMIN', 'WAREHOUSE')
  async createAdjustment(
    @Body() body: CreateInventoryAdjustmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Inventory adjustment registered successfully',
      data: await this.inventoryService.createAdjustment(body, user.id),
    };
  }

  @Get('movements')
  @Roles('ADMIN', 'WAREHOUSE')
  async findMovements(@Query() query: ListInventoryMovementsQueryDto) {
    return {
      success: true,
      message: 'Inventory movements retrieved successfully',
      data: await this.inventoryService.findMovements(query),
    };
  }
}
