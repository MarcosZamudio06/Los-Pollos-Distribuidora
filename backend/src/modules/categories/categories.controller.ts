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
  CreateCategoryDto,
  ListCategoriesQueryDto,
  UpdateCategoryDto,
} from './dto';
import { CategoriesService } from './categories.service';

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @Roles('ADMIN', 'WAREHOUSE', 'SELLER')
  async findAll(@Query() query: ListCategoriesQueryDto) {
    return {
      success: true,
      message: 'Categories retrieved successfully',
      data: await this.categoriesService.findAll(query),
    };
  }

  @Post()
  @Roles('ADMIN', 'WAREHOUSE')
  async create(@Body() body: CreateCategoryDto) {
    return {
      success: true,
      message: 'Category created successfully',
      data: await this.categoriesService.create(body),
    };
  }

  @Patch(':id')
  @Roles('ADMIN', 'WAREHOUSE')
  async update(@Param('id') id: string, @Body() body: UpdateCategoryDto) {
    return {
      success: true,
      message: 'Category updated successfully',
      data: await this.categoriesService.update(id, body),
    };
  }

  @Delete(':id')
  @Roles('ADMIN')
  async deactivate(@Param('id') id: string) {
    return {
      success: true,
      message: 'Category deactivated successfully',
      data: await this.categoriesService.deactivate(id),
    };
  }
}
