import { BadRequestException, Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CloseRouteSettlementDto, ReopenRouteSettlementDto } from './dto';
import { DeliveryService } from './delivery.service';

@Controller('route-settlements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RouteSettlementsController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Post(':id/close')
  @Roles('ADMIN', 'COLLECTIONS')
  async close(
    @Param('id') id: string,
    @Body() body: CloseRouteSettlementDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return {
      success: true,
      message: 'Route settlement closed successfully',
      data: await this.deliveryService.closeSettlement(id, body, currentUser, idempotencyKey),
    };
  }

  @Post(':id/reopen')
  @Roles('ADMIN')
  async reopen(
    @Param('id') id: string,
    @Body() body: ReopenRouteSettlementDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return {
      success: true,
      message: 'Route settlement reopened successfully',
      data: await this.deliveryService.reopenSettlement(id, body, currentUser, idempotencyKey),
    };
  }
}
