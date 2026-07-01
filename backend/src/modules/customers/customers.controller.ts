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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateCustomerDto,
  ListCustomerPaymentsQueryDto,
  ListCustomerSalesQueryDto,
  ListCustomersQueryDto,
  UpdateCustomerDto,
} from './dto';
import { CustomersService } from './customers.service';
import type { AuthenticatedUser } from '../auth/auth.types';

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Roles('ADMIN', 'SELLER', 'COLLECTIONS')
  async findAll(@Query() query: ListCustomersQueryDto) {
    return {
      success: true,
      message: 'Customers retrieved successfully',
      data: await this.customersService.findAll(query),
    };
  }


  @Get(':id/credit-summary')
  @Roles('ADMIN', 'SELLER', 'COLLECTIONS')
  async getCreditSummary(@Param('id') id: string) {
    return {
      success: true,
      message: 'Customer credit summary retrieved successfully',
      data: await this.customersService.getCreditSummary(id),
    };
  }

  @Get(':id/sales')
  @Roles('ADMIN', 'SELLER', 'COLLECTIONS')
  async findSales(
    @Param('id') id: string,
    @Query() query: ListCustomerSalesQueryDto,
  ) {
    return {
      success: true,
      message: 'Customer sales retrieved successfully',
      data: await this.customersService.findSales(id, query),
    };
  }

  @Get(':id/payments')
  @Roles('ADMIN', 'COLLECTIONS')
  async findPayments(
    @Param('id') id: string,
    @Query() query: ListCustomerPaymentsQueryDto,
  ) {
    return {
      success: true,
      message: 'Customer payments retrieved successfully',
      data: await this.customersService.findPayments(id, query),
    };
  }

  @Get(':id')
  @Roles('ADMIN', 'SELLER', 'COLLECTIONS')
  async findOne(@Param('id') id: string) {
    return {
      success: true,
      message: 'Customer retrieved successfully',
      data: await this.customersService.findOne(id),
    };
  }

  @Post()
  @Roles('ADMIN', 'SELLER')
  async create(
    @Body() body: CreateCustomerDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Customer created successfully',
      data: await this.customersService.create(body, currentUser),
    };
  }

  @Patch(':id')
  @Roles('ADMIN', 'SELLER')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateCustomerDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Customer updated successfully',
      data: await this.customersService.update(id, body, currentUser),
    };
  }

  @Delete(':id')
  @Roles('ADMIN')
  async deactivate(@Param('id') id: string) {
    return {
      success: true,
      message: 'Customer deactivated successfully',
      data: await this.customersService.deactivate(id),
    };
  }
}
