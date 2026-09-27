import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedPrincipal } from '../auth/auth.types';
import {
  BrandingVersionDto,
  UpdateBrandingDto,
} from './dto/branding.dto';
import {
  BrandingService,
  MAX_BRANDING_LOGO_BYTES,
  type UploadedBrandingLogo,
} from './branding.service';

@Controller('branding')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BrandingController {
  constructor(private readonly brandingService: BrandingService) {}

  @Get()
  @Public()
  @Header('Cache-Control', 'no-store')
  async getBranding() {
    return {
      success: true,
      message: 'Branding retrieved successfully',
      data: await this.brandingService.getBranding(),
    };
  }

  @Put()
  @Roles('ADMIN')
  async updateBranding(
    @Body() body: UpdateBrandingDto,
    @CurrentUser() currentUser: AuthenticatedPrincipal,
  ) {
    return {
      success: true,
      message: 'Branding updated successfully',
      data: await this.brandingService.updateBranding(body, currentUser),
    };
  }

  @Post('logo')
  @Roles('ADMIN')
  @UseInterceptors(
    FileInterceptor('logo', {
      limits: { fileSize: MAX_BRANDING_LOGO_BYTES },
    }),
  )
  async uploadLogo(
    @UploadedFile() file: UploadedBrandingLogo | undefined,
    @Body() body: BrandingVersionDto,
    @CurrentUser() currentUser: AuthenticatedPrincipal,
  ) {
    return {
      success: true,
      message: 'Branding logo uploaded successfully',
      data: await this.brandingService.uploadLogo(
        file,
        body.version,
        currentUser,
      ),
    };
  }

  @Delete('logo')
  @Roles('ADMIN')
  async removeLogo(
    @Query('version', ParseIntPipe) version: number,
    @CurrentUser() currentUser: AuthenticatedPrincipal,
  ) {
    return {
      success: true,
      message: 'Branding logo removed successfully',
      data: await this.brandingService.removeLogo(version, currentUser),
    };
  }
}
