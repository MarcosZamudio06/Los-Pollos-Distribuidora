import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryRouteStatus, DeliveryRouteType } from '@prisma/client';
import type { NavigationRouteStep } from '../geospatial/contracts/geospatial.types';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { DeliveryRouteNavigationDto } from './dto';
import { FINAL_DELIVERY_ORDER_STATUSES } from './delivery-order-statuses';
import { RoutingProvidersService } from './routing-providers.service';

type NavigationTarget = {
  kind: 'DELIVERY_ORDER' | 'LOGISTICS_STOP';
  id: string;
  stopSequence?: number;
  label: string;
  address?: string;
  latitude: number;
  longitude: number;
};

export type DeliveryRouteNavigationResult = {
  routeId: string;
  target: NavigationTarget;
  geometry: Record<string, unknown>;
  distanceMeters: number;
  durationSeconds: number;
  steps: NavigationRouteStep[];
};

@Injectable()
export class DeliveryRouteNavigationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routingProviders: RoutingProvidersService,
  ) {}

  async navigate(
    routeId: string,
    dto: DeliveryRouteNavigationDto,
    currentUser: AuthenticatedUser,
  ): Promise<DeliveryRouteNavigationResult> {
    if (currentUser.role !== 'DRIVER') {
      throw new ForbiddenException('Only drivers can request navigation');
    }

    const route = await this.prisma.deliveryRoute.findFirst({
      where: { id: routeId, driverId: currentUser.id },
      select: {
        id: true,
        type: true,
        status: true,
        logisticsStopCompletedAt: true,
        deliveryOrders: {
          where: { status: { notIn: FINAL_DELIVERY_ORDER_STATUSES } },
          orderBy: [{ stopSequence: 'asc' }, { createdAt: 'asc' }],
          take: 1,
          select: {
            id: true,
            deliveryAddress: true,
            latitude: true,
            longitude: true,
            stopSequence: true,
            sale: {
              select: {
                saleNumber: true,
                customer: { select: { name: true } },
              },
            },
          },
        },
        inventoryTransfer: {
          select: {
            id: true,
            transferNumber: true,
            destinationLocation: {
              select: {
                id: true,
                name: true,
                address: true,
                latitude: true,
                longitude: true,
              },
            },
          },
        },
      },
    });

    if (!route) {
      throw new NotFoundException('Delivery route not found');
    }
    if (route.status !== DeliveryRouteStatus.IN_PROGRESS) {
      this.throwConflict(
        'ROUTE_NOT_IN_PROGRESS',
        'Navigation is available only for an in-progress route',
      );
    }

    const target = this.resolveTarget(route);
    const routing = await this.routingProviders.buildNavigationRoute(
      [dto.longitude, dto.latitude],
      [target.longitude, target.latitude],
    );

    return {
      routeId: route.id,
      target,
      geometry: routing.geometry,
      distanceMeters: routing.distanceMeters,
      durationSeconds: routing.durationSeconds,
      steps: routing.steps ?? [],
    };
  }

  private resolveTarget(route: {
    type: DeliveryRouteType;
    logisticsStopCompletedAt: Date | null;
    deliveryOrders: Array<{
      id: string;
      deliveryAddress: string;
      latitude: unknown;
      longitude: unknown;
      stopSequence: number | null;
      sale: { saleNumber: string; customer: { name: string } | null };
    }>;
    inventoryTransfer: {
      id: string;
      transferNumber: string;
      destinationLocation: {
        name: string;
        address: string | null;
        latitude: unknown;
        longitude: unknown;
      };
    } | null;
  }): NavigationTarget {
    if (route.type === DeliveryRouteType.SALE_DELIVERY) {
      const order = route.deliveryOrders[0];
      if (!order) {
        this.throwConflict(
          'NO_PENDING_NAVIGATION_TARGET',
          'The route has no pending delivery stop',
        );
      }
      const coordinates = this.requireCoordinates(
        order.latitude,
        order.longitude,
      );
      return {
        kind: 'DELIVERY_ORDER',
        id: order.id,
        ...(order.stopSequence === null
          ? {}
          : { stopSequence: order.stopSequence }),
        label: order.sale.customer?.name.trim() || order.sale.saleNumber,
        address: order.deliveryAddress,
        ...coordinates,
      };
    }

    if (
      route.type === DeliveryRouteType.BRANCH_RETURN ||
      route.type === DeliveryRouteType.CEDIS_SUPPLY
    ) {
      if (route.logisticsStopCompletedAt) {
        this.throwConflict(
          'NO_PENDING_NAVIGATION_TARGET',
          'The logistics destination is already completed',
        );
      }
      const transfer = route.inventoryTransfer;
      if (!transfer?.destinationLocation) {
        this.throwConflict(
          'NAVIGATION_TARGET_DATA_MISSING',
          'The logistics route has no physical destination',
        );
      }
      const coordinates = this.requireCoordinates(
        transfer.destinationLocation.latitude,
        transfer.destinationLocation.longitude,
      );
      return {
        kind: 'LOGISTICS_STOP',
        id: transfer.id,
        label:
          transfer.destinationLocation.name.trim() || transfer.transferNumber,
        ...(transfer.destinationLocation.address
          ? { address: transfer.destinationLocation.address }
          : {}),
        ...coordinates,
      };
    }

    this.throwConflict(
      'NAVIGATION_ROUTE_TYPE_UNSUPPORTED',
      'The route type has no navigation target contract',
    );
  }

  private requireCoordinates(
    latitudeValue: unknown,
    longitudeValue: unknown,
  ): { latitude: number; longitude: number } {
    const latitude = this.toNumber(latitudeValue);
    const longitude = this.toNumber(longitudeValue);
    if (latitude === null || longitude === null) {
      this.throwConflict(
        'NAVIGATION_TARGET_COORDINATES_MISSING',
        'The next navigation target has no valid coordinates',
      );
    }
    return { latitude, longitude };
  }

  private toNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private throwConflict(code: string, message: string): never {
    throw new ConflictException({ code, message });
  }
}
