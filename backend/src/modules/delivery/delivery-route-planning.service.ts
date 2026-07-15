import { createHash } from 'crypto';
import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DeliveryRouteStatus, Prisma, SaleStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateDeliveryRoutePlanDto, EligibleSalesQueryDto } from './dto/delivery-route-planning.dto';
import { RoutingProvidersService } from './routing-providers.service';

type Actor = Pick<AuthenticatedUser, 'id' | 'role'>;

@Injectable()
export class DeliveryRoutePlanningService {
  constructor(private readonly prisma: PrismaService, private readonly providers: RoutingProvidersService) {}

  async findEligibleSales(query: EligibleSalesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.SaleWhereInput = {
      status: SaleStatus.CONFIRMED, cancelledAt: null, routeId: null, deliveryOrder: null,
      ...(query.originLocationId ? { locationId: query.originLocationId } : {}),
      ...(query.search ? { OR: [
        { saleNumber: { contains: query.search, mode: 'insensitive' } },
        { customer: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      ] } : {}),
    };
    const [total, sales] = await Promise.all([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' }, include: { customer: true, accountReceivable: { select: { id: true } } } }),
    ]);
    return { items: sales.map((sale: any) => ({
      saleId: sale.id, saleNumber: sale.saleNumber, customerId: sale.customerId,
      customerName: sale.customer?.name ?? 'Public customer', accountReceivableId: sale.accountReceivable?.id ?? null,
      suggestedDeliveryAddress: sale.customer?.deliveryAddress ?? sale.customer?.address ?? '',
    })), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createPlan(dto: CreateDeliveryRoutePlanDto, currentUser: Actor) {
    if (currentUser.role !== 'ADMIN') throw new NotFoundException('Route planner not found');
    const saleIds = dto.stops.map((stop) => stop.saleId);
    if (new Set(saleIds).size !== saleIds.length) throw new BadRequestException('Delivery stops cannot contain duplicate sales');

    const [driver, origin, sales] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: dto.driverId, isActive: true, role: { name: 'DRIVER' } }, select: { id: true } }),
      this.prisma.operationalLocation.findFirst({ where: { id: dto.originLocationId, isActive: true }, select: { id: true, latitude: true, longitude: true } }),
      this.prisma.sale.findMany({ where: { id: { in: saleIds }, status: SaleStatus.CONFIRMED, cancelledAt: null }, include: { accountReceivable: { select: { id: true } } } }),
    ]);
    if (!driver) throw new UnprocessableEntityException('The selected driver is not active or does not have the DRIVER role');
    if (!origin?.latitude || !origin.longitude) throw new UnprocessableEntityException('The selected origin does not have valid coordinates');
    const invalidSales = saleIds.filter((id) => !sales.some((sale: any) => sale.id === id && (!sale.routeId || sale.routeId === dto.routeId)));
    if (invalidSales.length) throw new UnprocessableEntityException({ message: 'Some sales are no longer eligible for route planning', saleIds: invalidSales });
    for (const stop of dto.stops) {
      const sale: any = sales.find((candidate: any) => candidate.id === stop.saleId);
      if (stop.accountReceivableId && sale.accountReceivable?.id !== stop.accountReceivableId) throw new UnprocessableEntityException(`Account receivable does not belong to sale ${stop.saleId}`);
    }
    if (dto.routeId) await this.assertReoptimizationRoute(dto, currentUser);

    const originCoordinate: [number, number] = [Number(origin.longitude), Number(origin.latitude)];
    const optimized = await this.providers.optimizeStops(originCoordinate, dto.stops);
    const stopsById = new Map(dto.stops.map((stop) => [stop.saleId, stop]));
    const orderedInput = optimized.map((item) => stopsById.get(item.saleId)!);
    const route = await this.providers.buildRoute([originCoordinate, ...orderedInput.map((stop) => [stop.longitude, stop.latitude] as [number, number]), originCoordinate]);
    const orderedStops = optimized.map((item, index) => ({ ...stopsById.get(item.saleId)!, sequence: item.sequence, legDistanceMeters: route.legs[index]?.distanceMeters ?? 0, legDurationSeconds: route.legs[index]?.durationSeconds ?? 0 }));
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const requestHash = createHash('sha256').update(JSON.stringify(dto)).digest('hex');
    const draft = await this.prisma.deliveryRoutePlanDraft.create({ data: {
      createdByUserId: currentUser.id, sourceRouteId: dto.routeId ?? null, driverId: dto.driverId,
      scheduledDate: new Date(dto.scheduledDate), originLocationId: dto.originLocationId,
      orderedStops: orderedStops as unknown as Prisma.InputJsonValue, geometry: route.geometry as Prisma.InputJsonValue,
      distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds,
      routingProfile: 'driving', routingDataVersion: process.env.MAP_DATA_VERSION ?? 'unknown', requestHash, expiresAt, consumedAt: null,
    } });
    return { id: draft.id, expiresAt, orderedStops, geometry: route.geometry, distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds, routingProfile: 'driving', routingDataVersion: process.env.MAP_DATA_VERSION ?? 'unknown' };
  }

  private async assertReoptimizationRoute(dto: CreateDeliveryRoutePlanDto, currentUser: Actor) {
    const route = await this.prisma.deliveryRoute.findFirst({ where: { id: dto.routeId, status: DeliveryRouteStatus.PENDING, settlement: null }, include: { deliveryOrders: { select: { saleId: true } } } });
    if (!route || currentUser.role !== 'ADMIN') throw new NotFoundException('Delivery route not found');
    if (route.driverId !== dto.driverId || route.originLocationId !== dto.originLocationId || route.scheduledDate.toISOString().slice(0, 10) !== dto.scheduledDate.slice(0, 10)) throw new UnprocessableEntityException('The route plan context does not match the existing route');
    const planned = new Set(dto.stops.map((stop) => stop.saleId));
    const missing = route.deliveryOrders.filter((order) => !planned.has(order.saleId));
    if (missing.length) throw new UnprocessableEntityException({ message: 'A reoptimization plan must include every existing stop', saleIds: missing.map((order) => order.saleId) });
  }
}
