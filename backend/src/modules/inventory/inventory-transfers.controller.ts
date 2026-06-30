import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
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
  CancelInventoryTransferDto,
  CreateInventoryTransferDto,
  ListInventoryTransfersQueryDto,
} from './dto';
import { InventoryTransfersService } from './inventory-transfers.service';

@Controller('inventory-transfers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryTransfersController {
  constructor(
    private readonly inventoryTransfersService: InventoryTransfersService,
  ) {}

  @Get()
  @Roles('ADMIN', 'WAREHOUSE')
  async findAll(@Query() query: ListInventoryTransfersQueryDto) {
    return {
      success: true,
      message: 'Inventory transfers retrieved successfully',
      data: await this.inventoryTransfersService.findAll(query),
    };
  }

  @Get(':id')
  @Roles('ADMIN', 'WAREHOUSE')
  async findOne(@Param('id') id: string) {
    return {
      success: true,
      message: 'Inventory transfer retrieved successfully',
      data: await this.inventoryTransfersService.findOne(id),
    };
  }

  @Post()
  @Roles('ADMIN', 'WAREHOUSE')
  async create(
    @Body() body: CreateInventoryTransferDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    return {
      success: true,
      message: 'Inventory transfer created successfully',
      data: await (idempotencyKey
        ? this.inventoryTransfersService.create(body, user.id, idempotencyKey)
        : this.inventoryTransfersService.create(body, user.id)),
    };
  }

  @Post(':id/confirm')
  @Roles('ADMIN', 'WAREHOUSE')
  async confirm(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    return {
      success: true,
      message: 'Inventory transfer confirmed successfully',
      data: await (idempotencyKey
        ? this.inventoryTransfersService.confirm(id, user.id, idempotencyKey)
        : this.inventoryTransfersService.confirm(id, user.id)),
    };
  }

  @Post(':id/cancel')
  @Roles('ADMIN', 'WAREHOUSE')
  async cancel(
    @Param('id') id: string,
    @Body() body: CancelInventoryTransferDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    return {
      success: true,
      message: 'Inventory transfer cancelled successfully',
      data: await (idempotencyKey
        ? this.inventoryTransfersService.cancel(
            id,
            body,
            user.id,
            idempotencyKey,
          )
        : this.inventoryTransfersService.cancel(id, body, user.id)),
    };
  }
}
