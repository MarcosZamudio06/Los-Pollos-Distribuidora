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
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
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
  async findAll(@Query() query: ListLocationsQueryDto) {
    return {
      success: true,
      message: 'Locations retrieved successfully',
      data: await this.locationsService.findAll(query),
    };
  }

  @Get(':id')
  @Roles('ADMIN', 'WAREHOUSE', 'SELLER', 'DRIVER', 'COLLECTIONS')
  async findOne(@Param('id') id: string) {
    return {
      success: true,
      message: 'Location retrieved successfully',
      data: await this.locationsService.findOne(id),
    };
  }

  @Post()
  @Roles('ADMIN')
  async create(@Body() body: CreateLocationDto) {
    return {
      success: true,
      message: 'Location created successfully',
      data: await this.locationsService.create(body),
    };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(@Param('id') id: string, @Body() body: UpdateLocationDto) {
    return {
      success: true,
      message: 'Location updated successfully',
      data: await this.locationsService.update(id, body),
    };
  }

  @Delete(':id')
  @Roles('ADMIN')
  async deactivate(@Param('id') id: string) {
    return {
      success: true,
      message: 'Location deactivated successfully',
      data: await this.locationsService.deactivate(id),
    };
  }
}
