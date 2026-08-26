import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SatCatalogQueryDto } from './dto/sat-catalog-query.dto';
import { SatCatalogService } from './sat-catalog.service';

@Controller('cfdi/catalogs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'BILLING')
export class SatCatalogController {
  constructor(private readonly catalogs: SatCatalogService) {}

  @Get()
  @Header('Cache-Control', 'private, max-age=300')
  async list(@CurrentUser() _user: AuthenticatedUser) {
    return {
      success: true,
      message: 'SAT catalogs retrieved successfully',
      data: await this.catalogs.list(),
    };
  }

  @Get(':key')
  @Header('Cache-Control', 'private, max-age=300')
  async get(
    @Param('key') key: string,
    @Query() query: SatCatalogQueryDto,
    @CurrentUser() _user: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'SAT catalog retrieved successfully',
      data: await this.catalogs.get(key, {
        code: query.code,
        asOf: query.asOf ? new Date(query.asOf) : undefined,
        limit: query.limit,
      }),
    };
  }
}
