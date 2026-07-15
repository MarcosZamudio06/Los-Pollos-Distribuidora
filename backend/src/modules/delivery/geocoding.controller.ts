import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { GeocodingReverseQueryDto, GeocodingSearchQueryDto } from './dto/delivery-route-planning.dto';
import { RoutingProvidersService } from './routing-providers.service';

@Controller('geocoding')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class GeocodingController {
  constructor(private readonly providers: RoutingProvidersService) {}
  @Get('search') async search(@Query() query: GeocodingSearchQueryDto) { return { success: true, message: 'Addresses retrieved successfully', data: { items: await this.providers.searchAddress(query.q, query.limit ?? 5, query.latitude, query.longitude) } }; }
  @Get('reverse') async reverse(@Query() query: GeocodingReverseQueryDto) { return { success: true, message: 'Address retrieved successfully', data: await this.providers.reverseAddress(query.latitude, query.longitude) }; }
}
