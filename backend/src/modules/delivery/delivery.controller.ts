import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AssignDeliveryRouteOrdersDto, CreateDeliveryRouteDto, ListDeliveryRoutesQueryDto, UpdateDeliveryRouteStatusDto } from './dto';
import { DeliveryService } from './delivery.service';

@Controller('delivery-routes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get()
  @Roles('ADMIN', 'DRIVER', 'COLLECTIONS', 'WAREHOUSE')
  async findAll(
    @Query() query: ListDeliveryRoutesQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Delivery routes retrieved successfully',
      data: await this.deliveryService.findRoutes(query, currentUser),
    };
  }

  @Get(':id')
  @Roles('ADMIN', 'DRIVER', 'COLLECTIONS')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Delivery route retrieved successfully',
      data: await this.deliveryService.findRoute(id, currentUser),
    };
  }

  @Post()
  @Roles('ADMIN')
  async create(
    @Body() body: CreateDeliveryRouteDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (Boolean(body.routePlanId) === Boolean(body.orders?.length)) {
      throw new BadRequestException('Provide exactly one of routePlanId or orders');
    }
    if (body.routePlanId && !idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key is required for optimized route creation');
    }

    return {
      success: true,
      message: 'Delivery route created successfully',
      data: await this.deliveryService.createRoute(body, currentUser, idempotencyKey),
    };
  }

  @Post(':id/orders')
  @Roles('ADMIN')
  async assignOrders(
    @Param('id') id: string,
    @Body() body: AssignDeliveryRouteOrdersDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    if (Boolean(body.routePlanId) === Boolean(body.orders?.length)) {
      throw new BadRequestException('Provide exactly one of routePlanId or orders');
    }

    return {
      success: true,
      message: 'Delivery route orders assigned successfully',
      data: await this.deliveryService.assignOrdersToRoute(id, body, currentUser),
    };
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'DRIVER')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateDeliveryRouteStatusDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Delivery route status updated successfully',
      data: await this.deliveryService.updateRouteStatus(id, body, currentUser),
    };
  }

  @Post(':id/settlement')
  @Roles('ADMIN', 'COLLECTIONS')
  async openSettlement(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Route settlement calculated successfully',
      data: await this.deliveryService.openSettlement(id, currentUser),
    };
  }
}
