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
import { PERMISSIONS } from '../../common/authorization/permissions';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateLegalEntityDto,
  ListLegalEntitiesQueryDto,
  UpdateLegalEntityDto,
} from './dto';
import { LegalEntitiesService } from './legal-entities.service';

@Controller('legal-entities')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'BILLING')
@RequirePermissions(PERMISSIONS.CFDI_PROVIDER_MANAGE)
export class LegalEntitiesController {
  constructor(private readonly legalEntitiesService: LegalEntitiesService) {}

  @Get()
  async findAll(@Query() query: ListLegalEntitiesQueryDto) {
    return {
      success: true,
      message: 'Legal entities retrieved successfully',
      data: await this.legalEntitiesService.findAll(query),
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return {
      success: true,
      message: 'Legal entity retrieved successfully',
      data: await this.legalEntitiesService.findOne(id),
    };
  }

  @Post()
  async create(@Body() body: CreateLegalEntityDto) {
    return {
      success: true,
      message: 'Legal entity created successfully',
      data: await this.legalEntitiesService.create(body),
    };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateLegalEntityDto) {
    return {
      success: true,
      message: 'Legal entity updated successfully',
      data: await this.legalEntitiesService.update(id, body),
    };
  }

  @Delete(':id')
  async deactivate(@Param('id') id: string) {
    return {
      success: true,
      message: 'Legal entity deactivated successfully',
      data: await this.legalEntitiesService.deactivate(id),
    };
  }
}
