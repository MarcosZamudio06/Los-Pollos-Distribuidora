import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RouteOptimizationProvider } from '../contracts/route-optimization-provider';
import type {
  OptimizationInput,
  OptimizedStop,
} from '../contracts/geospatial.types';
import {
  configuredTimeout,
  requestProviderJson,
  requiredProviderUrl,
} from './provider-http';

type VroomStep = { id?: number; type?: string };
type VroomResponse = {
  unassigned?: Array<{ id?: number }>;
  routes?: Array<{ steps?: VroomStep[] }>;
};

@Injectable()
export class VroomRouteOptimizationProvider implements RouteOptimizationProvider {
  private readonly logger = new Logger(VroomRouteOptimizationProvider.name);
  private readonly vroomUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.vroomUrl = requiredProviderUrl(config, 'VROOM_URL');
    this.timeoutMs = configuredTimeout(
      config,
      'ROUTING_TIMEOUT_MS',
      'ROUTING_TIMEOUT_MS',
      10000,
    );
  }

  async optimize(input: OptimizationInput): Promise<OptimizedStop[]> {
    const url = new URL('/', this.vroomUrl);
    const payload = await requestProviderJson<VroomResponse>({
      logger: this.logger,
      provider: 'VROOM',
      operation: 'optimize',
      unavailableMessage: 'VROOM route optimization provider is unavailable',
      timeoutMs: this.timeoutMs,
      url,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          vehicles: [
            {
              id: 1,
              profile: 'car',
              start: [input.origin.longitude, input.origin.latitude],
              end: [input.origin.longitude, input.origin.latitude],
            },
          ],
          jobs: input.stops.map((stop, index) => ({
            id: index + 1,
            location: [stop.coordinates.longitude, stop.coordinates.latitude],
          })),
        }),
      },
      resultFor: (response) => {
        if (response.unassigned?.length) return 'unassigned';
        if (input.stops.length === 0) return 'empty';
        return response.routes?.[0]?.steps?.some((step) => step.type === 'job')
          ? 'optimized'
          : 'incomplete';
      },
    });

    if (payload.unassigned?.length) {
      const saleIds = payload.unassigned
        .map((job) =>
          typeof job.id === 'number' ? input.stops[job.id - 1]?.id : undefined,
        )
        .filter((id): id is string => Boolean(id));
      throw new UnprocessableEntityException({
        message: 'Some delivery stops are unreachable',
        saleIds,
      });
    }

    const steps =
      payload.routes?.[0]?.steps?.filter((step) => step.type === 'job') ?? [];
    if (steps.length !== input.stops.length) {
      throw new ServiceUnavailableException(
        'VROOM returned an incomplete route',
      );
    }

    const orderedStops = steps.map((step, index) => {
      const stop =
        typeof step.id === 'number' ? input.stops[step.id - 1] : undefined;
      if (!stop) {
        throw new ServiceUnavailableException(
          'VROOM returned an invalid route',
        );
      }
      return { id: stop.id, sequence: index + 1 };
    });

    return orderedStops;
  }
}
