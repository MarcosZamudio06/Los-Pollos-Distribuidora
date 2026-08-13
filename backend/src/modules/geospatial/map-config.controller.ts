import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { Authenticated } from '../../common/decorators/authenticated.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  MAP_STYLE_CONFIG_PROVIDER,
  type MapStyleConfigProvider,
} from './contracts/map-style-config-provider';

@Controller('maps')
@UseGuards(JwtAuthGuard)
@Authenticated()
export class MapConfigController {
  constructor(
    @Inject(MAP_STYLE_CONFIG_PROVIDER)
    private readonly configProvider: MapStyleConfigProvider,
  ) {}

  @Get('config')
  async getConfig() {
    return {
      success: true,
      message: 'Map configuration retrieved successfully',
      data: await this.configProvider.getClientConfig(),
    };
  }
}
