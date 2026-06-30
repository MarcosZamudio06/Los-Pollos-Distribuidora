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
  async findAll(@Query() query: ListProductsQueryDto) {
    return {
      success: true,
      message: 'Products retrieved successfully',
      data: await this.productsService.findAll(query),
    };
  }

  @Get(':id')
  @Roles('ADMIN', 'WAREHOUSE', 'SELLER')
  async findOne(@Param('id') id: string, @Query() query: GetProductQueryDto) {
    return {
      success: true,
      message: 'Product retrieved successfully',
      data: await this.productsService.findOne(id, query),
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
