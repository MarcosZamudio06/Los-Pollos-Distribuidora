import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateOperationalConfigDto, ListOperationalConfigQueryDto, UpdateOperationalConfigDto } from './dto';
import { OperationalConfigService } from './operational-config.service';

@Controller('operational-config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OperationalConfigController {
  constructor(private readonly service: OperationalConfigService) {}

  @Get()
  @Roles('ADMIN')
  async findAll(@Query() query: ListOperationalConfigQueryDto) {
    return { success: true, message: 'Operational config retrieved successfully', data: await this.service.findAll(query) };
  }

  @Post()
  @Roles('ADMIN')
  async create(@Body() body: CreateOperationalConfigDto, @CurrentUser() currentUser: AuthenticatedUser) {
    return { success: true, message: 'Operational config created successfully', data: await this.service.create(body, currentUser) };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(@Param('id') id: string, @Body() body: UpdateOperationalConfigDto, @CurrentUser() currentUser: AuthenticatedUser) {
    return { success: true, message: 'Operational config updated successfully', data: await this.service.update(id, body, currentUser) };
  }

  @Delete(':id')
  @Roles('ADMIN')
  async deactivate(@Param('id') id: string, @CurrentUser() currentUser: AuthenticatedUser) {
    return { success: true, message: 'Operational config deactivated successfully', data: await this.service.deactivate(id, currentUser) };
  }
}
