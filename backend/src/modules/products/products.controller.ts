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
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateProductDto,
  GetProductQueryDto,
  ListProductsQueryDto,
  UpdateProductDto,
} from './dto';
import { ProductsService } from './products.service';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Roles('ADMIN', 'WAREHOUSE', 'SELLER')
  async findAll(
    @Query() query: ListProductsQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Products retrieved successfully',
      data: await this.productsService.findAll(query, currentUser),
    };
  }

  @Get(':id')
  @Roles('ADMIN', 'WAREHOUSE', 'SELLER')
  async findOne(
    @Param('id') id: string,
    @Query() query: GetProductQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Product retrieved successfully',
      data: await this.productsService.findOne(id, query, currentUser),
    };
  }

  @Post()
  @Roles('ADMIN', 'WAREHOUSE')
  async create(@Body() body: CreateProductDto) {
    return {
      success: true,
      message: 'Product created successfully',
      data: await this.productsService.create(body),
    };
  }

  @Patch(':id')
  @Roles('ADMIN', 'WAREHOUSE')
  async update(@Param('id') id: string, @Body() body: UpdateProductDto) {
    return {
      success: true,
      message: 'Product updated successfully',
      data: await this.productsService.update(id, body),
    };
  }

  @Delete(':id')
  @Roles('ADMIN')
  async deactivate(@Param('id') id: string) {
    return {
      success: true,
      message: 'Product deactivated successfully',
      data: await this.productsService.deactivate(id),
    };
  }
}
