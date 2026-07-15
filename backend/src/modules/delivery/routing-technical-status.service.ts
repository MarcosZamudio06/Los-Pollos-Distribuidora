import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

type ServiceStatus = { name: 'PostGIS' | 'Photon' | 'VROOM' | 'OSRM'; status: 'up' | 'down'; latencyMs: number };

@Injectable()
export class RoutingTechnicalStatusService {
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {
    this.timeoutMs = Number(config.get('ROUTING_TIMEOUT_MS', 10_000));
  }

  async getStatus() {
    const services = await Promise.all([
      this.checkPostgis(),
      this.checkHttp('Photon', new URL('/status', this.requiredUrl('PHOTON_URL'))),
      this.checkHttp('VROOM', new URL('/health', this.requiredUrl('VROOM_URL'))),
      this.checkHttp('OSRM', new URL('/nearest/v1/driving/-96.1342,19.1738?number=1', this.requiredUrl('OSRM_URL'))),
    ]);
    const preparedAt = this.config.get<string>('MAP_DATA_PREPARED_AT') ?? null;
    const preparedTime = preparedAt ? Date.parse(preparedAt) : Number.NaN;
    const ageDays = Number.isFinite(preparedTime) ? Math.max(0, Math.floor((Date.now() - preparedTime) / 86_400_000)) : null;

    return {
      status: services.every((service) => service.status === 'up') ? 'operational' as const : 'degraded' as const,
      checkedAt: new Date().toISOString(),
      dataset: {
        version: this.config.get<string>('MAP_DATA_VERSION') ?? 'unknown',
        preparedAt,
        ageDays,
        renewalRecommended: ageDays == null || ageDays >= 31,
      },
      services,
    };
  }

  private async checkPostgis(): Promise<ServiceStatus> {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRawUnsafe('SELECT postgis_version() AS version');
      return { name: 'PostGIS', status: 'up', latencyMs: Date.now() - startedAt };
    } catch {
      return { name: 'PostGIS', status: 'down', latencyMs: Date.now() - startedAt };
    }
  }

  private async checkHttp(name: ServiceStatus['name'], url: URL): Promise<ServiceStatus> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await fetch(url, { signal: controller.signal });
      return { name, status: response.ok ? 'up' : 'down', latencyMs: Date.now() - startedAt };
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
