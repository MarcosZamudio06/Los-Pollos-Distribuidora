import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CommercialPoliciesService } from './commercial-policies.service';
import { CreateCommercialPolicyDto, ListCommercialPoliciesQueryDto, UpdateCommercialPolicyDto } from './dto';

@Controller('commercial-policies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommercialPoliciesController {
  constructor(private readonly service: CommercialPoliciesService) {}

  @Get()
  @Roles('ADMIN', 'SELLER', 'COLLECTIONS')
  async findAll(@Query() query: ListCommercialPoliciesQueryDto) {
    return { success: true, message: 'Commercial policies retrieved successfully', data: await this.service.findAll(query) };
  }

  @Post()
  @Roles('ADMIN')
  async create(@Body() body: CreateCommercialPolicyDto, @CurrentUser() currentUser: AuthenticatedUser) {
    return { success: true, message: 'Commercial policy created successfully', data: await this.service.create(body, currentUser) };
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(@Param('id') id: string, @Body() body: UpdateCommercialPolicyDto, @CurrentUser() currentUser: AuthenticatedUser) {
    return { success: true, message: 'Commercial policy updated successfully', data: await this.service.update(id, body, currentUser) };
  }

  @Delete(':id')
  @Roles('ADMIN')
  async deactivate(@Param('id') id: string, @CurrentUser() currentUser: AuthenticatedUser) {
    return { success: true, message: 'Commercial policy deactivated successfully', data: await this.service.deactivate(id, currentUser) };
  }
}
