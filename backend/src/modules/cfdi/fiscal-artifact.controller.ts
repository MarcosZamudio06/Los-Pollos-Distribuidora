import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { FiscalArtifactService } from './fiscal-artifact.service';

@Controller('billing/invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FiscalArtifactController {
  constructor(private readonly service: FiscalArtifactService) {}

  @Get(':id/xml')
  @Roles('ADMIN', 'BILLING', 'SELLER', 'COLLECTIONS')
  async xml(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return {
      success: true,
      message: 'Fiscal XML download URL generated successfully',
      data: await this.service.getDownloadUrl(id, 'XML', user),
    };
  }

  @Get(':id/pdf')
  @Roles('ADMIN', 'BILLING', 'SELLER', 'COLLECTIONS')
  async pdf(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return {
      success: true,
      message: 'Fiscal PDF download URL generated successfully',
      data: await this.service.getDownloadUrl(id, 'PDF', user),
    };
  }
}
