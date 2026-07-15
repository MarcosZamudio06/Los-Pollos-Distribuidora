import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RoutingTechnicalStatusService } from './routing-technical-status.service';

@Controller('delivery-routing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RoutingTechnicalStatusController {
  constructor(private readonly statusService: RoutingTechnicalStatusService) {}

  @Get('technical-status')
  @Roles('ADMIN')
  async getTechnicalStatus() {
    return { success: true, message: 'Routing technical status retrieved successfully', data: await this.statusService.getStatus() };
  }
}
