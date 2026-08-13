import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import {
  TRAFFIC_PROVIDER,
  type TrafficProvider,
} from '../fleet/traffic/traffic-provider';

type ServiceStatus = {
  name: 'PostGIS' | 'Photon' | 'VROOM' | 'OSRM';
  status: 'up' | 'down';
  latencyMs: number;
};

type FleetPersistenceStatus = {
  status: 'up' | 'down';
};

type LatestPositionRow = {
  latestRecordedAt: Date | string | null;
};

@Injectable()
export class RoutingTechnicalStatusService {
  private readonly timeoutMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(TRAFFIC_PROVIDER)
    private readonly trafficProvider: TrafficProvider,
  ) {
    this.timeoutMs = Number(config.get('ROUTING_TIMEOUT_MS', 10_000));
  }

  async getStatus() {
    const [services, fleetPersistence, traffic] = await Promise.all([
      Promise.all([
        this.checkPostgis(),
        this.checkHttp(
          'Photon',
          new URL('/status', this.requiredUrl('PHOTON_URL')),
        ),
        this.checkHttp(
          'VROOM',
          new URL('/health', this.requiredUrl('VROOM_URL')),
        ),
        this.checkHttp(
          'OSRM',
          new URL(
            '/nearest/v1/driving/-96.1342,19.1738?number=1',
            this.requiredUrl('OSRM_URL'),
          ),
        ),
      ]),
      this.checkFleetPersistence(),
      this.checkTrafficCapabilities(),
    ]);
    const preparedAt = this.config.get<string>('MAP_DATA_PREPARED_AT') ?? null;
    const preparedTime = preparedAt ? Date.parse(preparedAt) : Number.NaN;
    const ageDays = Number.isFinite(preparedTime)
      ? Math.max(0, Math.floor((Date.now() - preparedTime) / 86_400_000))
      : null;
    const routingDataVersion =
      this.config.get<string>('MAP_DATA_VERSION') ?? 'unknown';

    return {
      status:
        services.every((service) => service.status === 'up') &&
        fleetPersistence.status === 'up'
          ? ('operational' as const)
          : ('degraded' as const),
      checkedAt: new Date().toISOString(),
      routingDataVersion,
      dataset: {
        version: routingDataVersion,
        preparedAt,
        ageDays,
        renewalRecommended: ageDays == null || ageDays >= 31,
      },
      services,
      fleetPersistence: {
        status: fleetPersistence.status,
      } satisfies FleetPersistenceStatus,
      latestVehiclePositionAgeSeconds:
        fleetPersistence.latestVehiclePositionAgeSeconds,
      traffic,
    };
  }

  private async checkTrafficCapabilities() {
    try {
      const capabilities = await this.trafficProvider.getCapabilities();
      return capabilities.available
        ? {
            available: true,
            provider: capabilities.provider,
          }
        : {
            available: false,
            provider: null,
          };
    } catch {
      return {
        available: false,
        provider: null,
      };
    }
  }

  private async checkFleetPersistence(): Promise<
    FleetPersistenceStatus & { latestVehiclePositionAgeSeconds: number | null }
  > {
    try {
      const rows = await this.prisma.$queryRaw<LatestPositionRow[]>`
        SELECT MAX("recordedAt") AS "latestRecordedAt"
        FROM "VehiclePosition"
      `;
      const latestRecordedAt = rows[0]?.latestRecordedAt
        ? new Date(rows[0].latestRecordedAt)
        : null;
      const latestTime = latestRecordedAt?.getTime() ?? Number.NaN;
      const ageSeconds = Number.isFinite(latestTime)
        ? Math.max(0, Math.floor((Date.now() - latestTime) / 1000))
        : null;
      return {
        status: 'up',
        latestVehiclePositionAgeSeconds: ageSeconds,
      };
    } catch {
      return {
        status: 'down',
        latestVehiclePositionAgeSeconds: null,
      };
    }
  }

  private async checkPostgis(): Promise<ServiceStatus> {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRawUnsafe('SELECT postgis_version() AS version');
      return {
        name: 'PostGIS',
        status: 'up',
        latencyMs: Date.now() - startedAt,
      };
    } catch {
      return {
        name: 'PostGIS',
        status: 'down',
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  private async checkHttp(
    name: ServiceStatus['name'],
    url: URL,
  ): Promise<ServiceStatus> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await fetch(url, { signal: controller.signal });
      return {
        name,
        status: response.ok ? 'up' : 'down',
        latencyMs: Date.now() - startedAt,
      };
    } catch {
      return { name, status: 'down', latencyMs: Date.now() - startedAt };
    } finally {
      clearTimeout(timeout);
    }
  }

  private requiredUrl(key: string) {
    const value = this.config.get<string>(key);
    if (!value) throw new Error(`${key} is required`);
    return value;
  }
}
