import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  GeocodingReverseQueryDto,
  GeocodingSearchQueryDto,
} from './dto/delivery-route-planning.dto';
import {
  GEOCODING_PROVIDER,
  type GeocodingProvider,
} from '../geospatial/contracts/geocoding-provider';

@Controller('geocoding')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class GeocodingController {
  constructor(
    @Inject(GEOCODING_PROVIDER)
    private readonly provider: GeocodingProvider,
  ) {}
  @Get('search') async search(@Query() query: GeocodingSearchQueryDto) {
    return {
      success: true,
      message: 'Addresses retrieved successfully',
      data: {
        items: await this.provider.search({
          query: query.q,
          limit: query.limit ?? 5,
          proximity:
            query.latitude !== undefined && query.longitude !== undefined
              ? { latitude: query.latitude, longitude: query.longitude }
              : undefined,
        }),
      },
    };
  }
  @Get('reverse') async reverse(@Query() query: GeocodingReverseQueryDto) {
    const result = await this.provider.reverse({
      latitude: query.latitude,
      longitude: query.longitude,
    });
    return {
      success: true,
      message: 'Address retrieved successfully',
      data: result,
    };
  }
}
