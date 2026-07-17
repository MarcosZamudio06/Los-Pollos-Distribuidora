import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { BillingRequestsService } from './billing-requests.service';
import { CancelBillingRequestDto, CreateBillingRequestDto, ListBillingRequestsQueryDto, UpdateBillingRequestDto } from './dto';

@Controller('billing-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingRequestsController {
  constructor(private readonly service: BillingRequestsService) {}

  @Get()
  @Roles('ADMIN', 'SELLER', 'COLLECTIONS')
  async findAll(@Query() query: ListBillingRequestsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return { success: true, message: 'Billing requests retrieved successfully', data: await this.service.findAll(query, user) };
  }

  @Get(':id')
  @Roles('ADMIN', 'SELLER', 'COLLECTIONS')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return { success: true, message: 'Billing request retrieved successfully', data: await this.service.findOne(id, user) };
  }

  @Post()
  @Roles('ADMIN', 'SELLER')
  async create(@Body() body: CreateBillingRequestDto, @CurrentUser() user: AuthenticatedUser) {
    return { success: true, message: 'Billing request created successfully', data: await this.service.create(body, user) };
  }

  @Patch(':id')
  @Roles('ADMIN', 'SELLER')
  async update(@Param('id') id: string, @Body() body: UpdateBillingRequestDto, @CurrentUser() user: AuthenticatedUser) {
    return { success: true, message: 'Billing request updated successfully', data: await this.service.update(id, body, user) };
  }

  @Post(':id/cancel')
  @Roles('ADMIN')
  async cancel(@Param('id') id: string, @Body() body: CancelBillingRequestDto, @CurrentUser() user: AuthenticatedUser) {
    return { success: true, message: 'Billing request cancelled successfully', data: await this.service.cancel(id, body, user) };
  }
}
