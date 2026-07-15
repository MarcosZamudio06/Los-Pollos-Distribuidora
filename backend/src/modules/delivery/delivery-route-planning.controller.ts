import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateDeliveryRoutePlanDto, EligibleSalesQueryDto } from './dto/delivery-route-planning.dto';
import { DeliveryRoutePlanningService } from './delivery-route-planning.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class DeliveryRoutePlanningController {
  constructor(private readonly planning: DeliveryRoutePlanningService) {}
  @Get('delivery-route-planning/eligible-sales') async eligibleSales(@Query() query: EligibleSalesQueryDto) { return { success: true, message: 'Eligible sales retrieved successfully', data: await this.planning.findEligibleSales(query) }; }
  @Post('delivery-route-plans') async create(@Body() body: CreateDeliveryRoutePlanDto, @CurrentUser() user: AuthenticatedUser) { return { success: true, message: 'Delivery route plan created successfully', data: await this.planning.createPlan(body, user) }; }
}
