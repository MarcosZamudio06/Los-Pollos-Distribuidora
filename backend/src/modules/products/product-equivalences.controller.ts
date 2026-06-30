import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateProductEquivalenceDto, ListProductEquivalencesQueryDto, UpdateProductEquivalenceDto } from './dto';
import { ProductEquivalencesService } from './product-equivalences.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductEquivalencesController {
  constructor(private readonly productEquivalencesService: ProductEquivalencesService) {}

  @Get('products/:productId/equivalences')
  @Roles('ADMIN', 'WAREHOUSE', 'SELLER')
  async findAll(@Param('productId') productId: string, @Query() query: ListProductEquivalencesQueryDto) {
    return { success: true, message: 'Product equivalences retrieved successfully', data: await this.productEquivalencesService.findAll(productId, query) };
  }

  @Post('products/:productId/equivalences')
  @Roles('ADMIN')
  async create(@Param('productId') productId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: CreateProductEquivalenceDto) {
    return { success: true, message: 'Product equivalence created successfully', data: await this.productEquivalencesService.create(productId, user.id, body) };
  }

  @Patch('product-equivalences/:id')
  @Roles('ADMIN')
  async update(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() body: UpdateProductEquivalenceDto) {
    return { success: true, message: 'Product equivalence updated successfully', data: await this.productEquivalencesService.update(id, user.id, body) };
  }

  @Post('product-equivalences/:id/activate')
  @Roles('ADMIN')
  async activate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return { success: true, message: 'Product equivalence activated successfully', data: await this.productEquivalencesService.activate(id, user.id) };
  }

  @Post('product-equivalences/:id/deactivate')
  @Roles('ADMIN')
  async deactivate(@Param('id') id: string) {
    return { success: true, message: 'Product equivalence deactivated successfully', data: await this.productEquivalencesService.deactivate(id) };
  }
}
