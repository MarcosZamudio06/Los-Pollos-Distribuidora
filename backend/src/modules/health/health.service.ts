import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

const DEFAULT_DEPENDENCY_TIMEOUT_MS = 5_000;
const READINESS_CACHE_MS = 1_000;
const DEPENDENCIES_CACHE_MS = 30_000;

type DependencyProbe = {
  status: 'up' | 'down';
  latencyMs: number;
  reason?: 'timeout' | 'unavailable';
};

type DependencyHealth = {
  status: 'ok' | 'degraded' | 'error';
  checkedAt: string;
  dependencies: Record<string, DependencyProbe>;
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
  private readinessCache?: { expiresAt: number; available: boolean };
  private readinessInFlight?: Promise<boolean>;
  private dependenciesCache?: { expiresAt: number; value: DependencyHealth };
  private dependenciesInFlight?: Promise<DependencyHealth>;
  private readonly underlyingProbes = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const configuredTimeout = Number(
      config.get('HEALTH_DEPENDENCY_TIMEOUT_MS', DEFAULT_DEPENDENCY_TIMEOUT_MS),
    );
    this.dependencyTimeoutMs =
      Number.isInteger(configuredTimeout) &&
      configuredTimeout > 0 &&
      configuredTimeout <= DEFAULT_DEPENDENCY_TIMEOUT_MS
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

    if (!(await this.readinessAvailable()) || this.draining) {
      throw new ServiceUnavailableException('Application is not ready');
    }

    return {
      success: true,
      message: 'Application is ready',
      data: { status: 'ready' },
    };
  }

  private async readinessAvailable(): Promise<boolean> {
    if (this.readinessCache && this.readinessCache.expiresAt > Date.now()) {
      return this.readinessCache.available;
    }
    this.readinessInFlight ??= this.probe('database', async () => {
      await this.queryDatabase('SELECT 1');
    })
      .then((probe) => {
        const available = probe.status === 'up';
        this.readinessCache = {
          expiresAt: Date.now() + READINESS_CACHE_MS,
          available,
        };
        return available;
      })
      .finally(() => {
        this.readinessInFlight = undefined;
      });
    return this.readinessInFlight;
  }

  async getDependencies(): Promise<DependencyHealth> {
    if (
      this.dependenciesCache &&
      this.dependenciesCache.expiresAt > Date.now()
    ) {
      return this.dependenciesCache.value;
    }
    this.dependenciesInFlight ??= this.probeDependencies()
      .then((value) => {
        this.dependenciesCache = {
          expiresAt: Date.now() + DEPENDENCIES_CACHE_MS,
          value,
        };
        return value;
      })
      .finally(() => {
        this.dependenciesInFlight = undefined;
      });
    return this.dependenciesInFlight;
  }

  private async probeDependencies(): Promise<DependencyHealth> {
    const [database, fiscal, photon, osrm, vroom, tileserver, objectStorage] =
      await Promise.all([
        this.probe('database', async () => {
          await this.withTimeout(
            this.queryDatabase('SELECT 1'),
            this.dependencyTimeoutMs,
          );
        }),
        this.probe('fiscal', async () => {
          const rows = await this.withTimeout(
            this.queryDatabase<Array<{ invalidCount: number }>>(
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
    return this.probe(key, () =>
      this.singleFlight(key, async () => {
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
      }),
    );
  }

  private queryDatabase<T = unknown>(sql: string): Promise<T> {
    return this.singleFlight(sql, () => this.prisma.$queryRawUnsafe<T>(sql));
  }

  private singleFlight<T>(key: string, check: () => Promise<T>): Promise<T> {
    let pending = this.underlyingProbes.get(key);
    if (!pending) {
      pending = Promise.resolve().then(check);
      this.underlyingProbes.set(key, pending);
      // A timeout does not cancel Prisma. Retain the actual promise until it settles,
      // so expiry/retries cannot accumulate more pending SQL or HTTP operations.
      const settled = () => {
        this.underlyingProbes.delete(key);
      };
      void pending.then(settled, settled);
    }
    return pending as Promise<T>;
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
