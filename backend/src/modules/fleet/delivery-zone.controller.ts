import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateDeliveryZoneDto,
  ListDeliveryZonesQueryDto,
  UpdateDeliveryZoneDto,
} from './dto';
import { GeofenceService } from './geofence.service';

@Controller('delivery-zones')
@UseGuards(RolesGuard)
export class DeliveryZoneController {
  constructor(private readonly geofences: GeofenceService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.FLEET_VIEW)
  async findAll(
    @Query() query: ListDeliveryZonesQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Delivery zones retrieved successfully',
      data: await this.geofences.findAll(query, currentUser),
    };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.FLEET_ZONES_MANAGE)
  async create(
    @Body() body: CreateDeliveryZoneDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Delivery zone created successfully',
      data: await this.geofences.create(body, currentUser),
    };
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.FLEET_ZONES_MANAGE)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateDeliveryZoneDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Delivery zone updated successfully',
      data: await this.geofences.update(id, body, currentUser),
    };
  }
}
