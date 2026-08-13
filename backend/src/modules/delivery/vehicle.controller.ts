import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CreateVehicleDto,
  ListVehiclesQueryDto,
  UpdateVehicleDto,
} from './dto';
import { VehicleService } from './vehicle.service';

@Controller('vehicles')
@RequirePermissions(PERMISSIONS.FLEET_VIEW)
export class VehicleController {
  constructor(private readonly vehicles: VehicleService) {}

  @Get()
  async findAll(@Query() query: ListVehiclesQueryDto) {
    return {
      success: true,
      message: 'Vehicles retrieved successfully',
      data: await this.vehicles.findAll(query),
    };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.FLEET_MANAGE)
  async create(@Body() body: CreateVehicleDto) {
    return {
      success: true,
      message: 'Vehicle created successfully',
      data: await this.vehicles.create(body),
    };
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.FLEET_MANAGE)
  async update(@Param('id') id: string, @Body() body: UpdateVehicleDto) {
    return {
      success: true,
      message: 'Vehicle updated successfully',
      data: await this.vehicles.update(id, body),
    };
  }
}
