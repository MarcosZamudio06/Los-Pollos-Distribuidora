import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UpdateDeliveryOrderStatusDto } from './dto';
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
}
