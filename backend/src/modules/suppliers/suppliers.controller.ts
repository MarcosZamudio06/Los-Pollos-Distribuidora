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
  CreateSupplierDto,
  ListSuppliersQueryDto,
  UpdateSupplierDto,
} from './dto';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @Roles('ADMIN', 'WAREHOUSE')
  async findAll(@Query() query: ListSuppliersQueryDto) {
    return {
      success: true,
      message: 'Suppliers retrieved successfully',
      data: await this.suppliersService.findAll(query),
    };
  }

  @Get(':id')
  @Roles('ADMIN', 'WAREHOUSE')
  async findOne(@Param('id') id: string) {
    return {
      success: true,
      message: 'Supplier retrieved successfully',
      data: await this.suppliersService.findOne(id),
    };
  }

  @Post()
  @Roles('ADMIN', 'WAREHOUSE')
  async create(@Body() body: CreateSupplierDto) {
    return {
      success: true,
      message: 'Supplier created successfully',
      data: await this.suppliersService.create(body),
    };
  }

  @Patch(':id')
  @Roles('ADMIN', 'WAREHOUSE')
  async update(@Param('id') id: string, @Body() body: UpdateSupplierDto) {
    return {
      success: true,
      message: 'Supplier updated successfully',
      data: await this.suppliersService.update(id, body),
    };
  }

  @Delete(':id')
  @Roles('ADMIN')
  async deactivate(@Param('id') id: string) {
    return {
      success: true,
      message: 'Supplier deactivated successfully',
      data: await this.suppliersService.deactivate(id),
    };
  }
}
