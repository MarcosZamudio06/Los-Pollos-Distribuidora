import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RateLimitPolicy } from '../../common/decorators/rate-limit-policy.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  FleetLiveQueryDto,
  FleetHeatmapQueryDto,
  ListGeofenceEventsQueryDto,
  FleetRoutePositionsQueryDto,
  PublishFleetPositionDto,
} from './dto';
import { FleetService } from './fleet.service';
import { GeofenceService } from './geofence.service';

@Controller('fleet')
@UseGuards(RolesGuard)
export class FleetController {
  constructor(
    private readonly fleetService: FleetService,
    private readonly geofenceService: GeofenceService,
  ) {}

  @Post('positions')
  @Roles('DRIVER')
  @RequirePermissions(PERMISSIONS.FLEET_POSITION_PUBLISH)
  @RateLimitPolicy('fleet-position')
  async publishPosition(
    @Body() body: PublishFleetPositionDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Fleet position recorded successfully',
      data: await this.fleetService.publishPosition(body, currentUser),
    };
  }

  @Get('live')
  @RequirePermissions(PERMISSIONS.FLEET_VIEW)
  async live(
    @Query() query: FleetLiveQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Fleet live snapshot retrieved successfully',
      data: await this.fleetService.getLive(query, currentUser),
    };
  }

  @Get('analytics/heatmap')
  @RequirePermissions(PERMISSIONS.FLEET_VIEW)
  async heatmap(
    @Query() query: FleetHeatmapQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Fleet heatmap retrieved successfully',
      data: await this.fleetService.getHeatmap(query, currentUser),
    };
  }

  @Get('routes/:routeId/positions')
  @RequirePermissions(PERMISSIONS.FLEET_VIEW)
  async routePositions(
    @Param('routeId') routeId: string,
    @Query() query: FleetRoutePositionsQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Fleet route positions retrieved successfully',
      data: await this.fleetService.getRoutePositions(
        routeId,
        query,
        currentUser,
      ),
    };
  }

  @Get('geofence-events')
  @RequirePermissions(PERMISSIONS.FLEET_VIEW)
  async geofenceEvents(
    @Query() query: ListGeofenceEventsQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return {
      success: true,
      message: 'Fleet geofence events retrieved successfully',
      data: await this.geofenceService.findEvents(query, currentUser),
    };
  }
}
