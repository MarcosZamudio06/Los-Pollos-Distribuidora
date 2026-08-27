import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

const DEFAULT_DEPENDENCY_TIMEOUT_MS = 5_000;

type DependencyProbe = {
  status: 'up' | 'down';
  latencyMs: number;
  reason?: 'timeout' | 'unavailable';
};

class HealthProbeTimeout extends Error {
  constructor() {
    super('health probe timed out');
  }
}

@Injectable()
export class HealthService implements OnApplicationBootstrap, OnModuleDestroy {
  private started = false;
  private draining = false;
  private readonly dependencyTimeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const configuredTimeout = Number(
      config.get('HEALTH_DEPENDENCY_TIMEOUT_MS', DEFAULT_DEPENDENCY_TIMEOUT_MS),
    );
    this.dependencyTimeoutMs =
      Number.isInteger(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_DEPENDENCY_TIMEOUT_MS;
  }

  onApplicationBootstrap(): void {
    this.started = true;
  }

  onModuleDestroy(): void {
    this.draining = true;
  }

  getLiveness() {
    return {
      success: true,
      message: 'Application is live',
      data: { status: 'live' },
    };
  }

  getStartup() {
    if (!this.started) {
      throw new ServiceUnavailableException(
        'Application startup is incomplete',
      );
    }

    return {
      success: true,
      message: 'Application startup completed',
      data: { status: 'started' },
    };
  }

  async getReadiness() {
    if (!this.started || this.draining) {
      throw new ServiceUnavailableException('Application is not ready');
    }

    try {
      await this.withTimeout(
        this.prisma.$queryRawUnsafe('SELECT 1'),
        this.dependencyTimeoutMs,
      );
    } catch {
      throw new ServiceUnavailableException('Application is not ready');
    }

    return {
      success: true,
      message: 'Application is ready',
      data: { status: 'ready' },
    };
  }

  async getDependencies() {
    const [database, fiscal, photon, osrm, vroom, tileserver, objectStorage] =
      await Promise.all([
        this.probe('database', async () => {
          await this.withTimeout(
            this.prisma.$queryRawUnsafe('SELECT 1'),
            this.dependencyTimeoutMs,
          );
        }),
        this.probe('fiscal', async () => {
          const rows = await this.withTimeout(
            this.prisma.$queryRawUnsafe<Array<{ invalidCount: number }>>(
              `SELECT COUNT(*)::int AS "invalidCount"
                 FROM "LegalEntity"
                WHERE "isActive" = TRUE
                  AND "cfdiEnabled" = TRUE
                  AND (
                    "certificateValidTo" IS NULL
                    OR "certificateValidTo" <= NOW()
                  )`,
            ),
            this.dependencyTimeoutMs,
          );
          if ((rows[0]?.invalidCount ?? 0) > 0) {
            throw new Error('fiscal issuer metadata requires attention');
          }
        }),
        this.probeHttp('PHOTON_URL', '/status'),
        this.probeHttp(
          'OSRM_URL',
          '/nearest/v1/driving/-96.1342,19.1738?number=1',
        ),
        this.probeHttp('VROOM_URL', '/health'),
        this.probeHttp('MAP_TILES_URL', '/health'),
        this.probeHttp('OBJECT_STORAGE_ENDPOINT', '/healthz'),
      ]);

    const dependencies = {
      database,
      fiscal,
      photon,
      osrm,
      vroom,
      tileserver,
      objectStorage,
    };
    const coreDown = database.status === 'down';
    const dependencyDown = Object.values(dependencies).some(
      (dependency) => dependency.status === 'down',
    );

    return {
      status: coreDown
        ? ('error' as const)
        : dependencyDown
          ? ('degraded' as const)
          : ('ok' as const),
      checkedAt: new Date().toISOString(),
      dependencies,
    };
  }

  private async probe(
    _name: string,
    check: () => Promise<void>,
  ): Promise<DependencyProbe> {
    const startedAt = Date.now();
    try {
      await this.withTimeout(check(), this.dependencyTimeoutMs);
      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: Date.now() - startedAt,
        reason: error instanceof HealthProbeTimeout ? 'timeout' : 'unavailable',
      };
    }
  }

  private async probeHttp(key: string, path: string): Promise<DependencyProbe> {
    return this.probe(key, async () => {
      const baseUrl = this.config.get<string>(key)?.trim();
      if (!baseUrl) throw new Error(`${key} is not configured`);

      let url: URL;
      try {
        url = new URL(path, baseUrl);
      } catch {
        throw new Error(`${key} is invalid`);
      }

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.dependencyTimeoutMs,
      );
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`${key} returned an error`);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new HealthProbeTimeout();
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new HealthProbeTimeout()),
        timeoutMs,
      );
      promise.then(
        (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timeout);
          reject(
            error instanceof Error ? error : new Error('health probe failed'),
          );
        },
      );
    });
  }
}
