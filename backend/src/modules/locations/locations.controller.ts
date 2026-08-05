import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateLocationDto,
  ListLocationsQueryDto,
  UpdateLocationDto,
} from './dto';
import { LocationsService } from './locations.service';

@Controller('locations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  @Roles('ADMIN', 'WAREHOUSE', 'SELLER', 'DRIVER', 'COLLECTIONS')
  async findAll(
    @Query() query: ListLocationsQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Locations retrieved successfully',
      data: await this.locationsService.findAll(currentUser, query),
    };
  }

  @Get(':id/branches')
  @Roles('ADMIN', 'WAREHOUSE')
  @RequirePermissions(PERMISSIONS.CEDIS_VIEW)
  async findActiveBranches(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'CEDIS branches retrieved successfully',
      data: await this.locationsService.findActiveBranches(id, currentUser),
    };
  }

  @Get(':id')
  @Roles('ADMIN', 'WAREHOUSE', 'SELLER', 'DRIVER', 'COLLECTIONS')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Location retrieved successfully',
      data: await this.locationsService.findOne(id, currentUser),
    };
  }

  @Post()
  @Roles('ADMIN')
  @RequirePermissions(PERMISSIONS.CEDIS_MANAGE)
  async create(@Body() body: CreateLocationDto) {
    return {
      success: true,
      message: 'Location created successfully',
      data: await this.locationsService.create(body),
    };
  }

  @Patch(':id')
  @Roles('ADMIN')
  @RequirePermissions(PERMISSIONS.CEDIS_MANAGE)
  async update(@Param('id') id: string, @Body() body: UpdateLocationDto) {
    return {
      success: true,
      message: 'Location updated successfully',
      data: await this.locationsService.update(id, body),
    };
  }

  @Delete(':id')
  @Roles('ADMIN')
  @RequirePermissions(PERMISSIONS.CEDIS_MANAGE)
  async deactivate(@Param('id') id: string) {
    return {
      success: true,
      message: 'Location deactivated successfully',
      data: await this.locationsService.deactivate(id),
    };
  }
}
