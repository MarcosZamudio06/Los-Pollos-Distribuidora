import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CaptureDeliveryEvidenceDto,
  RegisterDeliveryIncidentDto,
  RegisterRouteCollectionDto,
  UpdateDeliveryOrderStatusDto,
} from './dto';
import { DeliveryService } from './delivery.service';

@Controller('delivery-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveryOrdersController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Patch(':id/status')
  @Roles('ADMIN', 'DRIVER')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateDeliveryOrderStatusDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Delivery order status updated successfully',
      data: await this.deliveryService.updateOrderStatus(id, body, currentUser),
    };
  }

  @Post(':id/evidence')
  @Roles('ADMIN', 'DRIVER')
  async captureEvidence(
    @Param('id') id: string,
    @Body() body: CaptureDeliveryEvidenceDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Delivery evidence captured successfully',
      data: await this.deliveryService.captureEvidence(id, body, currentUser),
    };
  }

  @Post(':id/collections')
  @Roles('ADMIN', 'DRIVER', 'COLLECTIONS')
  async registerCollection(
    @Param('id') id: string,
    @Body() body: RegisterRouteCollectionDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Route collection registered successfully',
      data: await this.deliveryService.registerCollection(id, body, currentUser),
    };
  }

  @Post(':id/incidents')
  @Roles('ADMIN', 'DRIVER')
  async registerIncident(
    @Param('id') id: string,
    @Body() body: RegisterDeliveryIncidentDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Delivery incident registered successfully',
      data: await this.deliveryService.registerIncident(id, body, currentUser),
    };
  }
}
