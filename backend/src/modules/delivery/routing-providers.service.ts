import { Injectable, Logger, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type Coordinate = [number, number];
type Stop = { saleId: string; longitude: number; latitude: number };

@Injectable()
export class RoutingProvidersService {
  private readonly logger = new Logger(RoutingProvidersService.name);
  private readonly timeoutMs: number;
  private readonly photonUrl: string;
  private readonly vroomUrl: string;
  private readonly osrmUrl: string;

  constructor(private readonly config: ConfigService) {
    this.timeoutMs = Number(config.get('ROUTING_TIMEOUT_MS', 10_000));
    this.photonUrl = this.requiredUrl('PHOTON_URL');
    this.vroomUrl = this.requiredUrl('VROOM_URL');
    this.osrmUrl = this.requiredUrl('OSRM_URL');
  }

  async searchAddress(query: string, limit = 5, latitude?: number, longitude?: number) {
    const url = new URL('/api/', this.photonUrl);
    url.searchParams.set('q', query.trim());
    url.searchParams.set('lang', 'default');
    url.searchParams.set('countrycode', 'MX');
    url.searchParams.set('limit', String(limit));
    if (latitude !== undefined) url.searchParams.set('lat', String(latitude));
    if (longitude !== undefined) url.searchParams.set('lon', String(longitude));
    const payload = await this.request(url, undefined, 'Photon');
    return (payload.features ?? []).map((feature: any) => this.normalizePhotonFeature(feature));
  }

  async reverseAddress(latitude: number, longitude: number) {
    const url = new URL('/reverse', this.photonUrl);
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('lang', 'default');
    const payload = await this.request(url, undefined, 'Photon');
    const feature = payload.features?.[0];
    if (!feature) throw new UnprocessableEntityException('No address was found for the selected coordinates');
    return this.normalizePhotonFeature(feature);
  }

  async optimizeStops(origin: Coordinate, stops: Stop[]) {
    const url = new URL('/', this.vroomUrl);
    const payload = await this.request(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        vehicles: [{ id: 1, profile: 'car', start: origin, end: origin }],
        jobs: stops.map((stop, index) => ({ id: index + 1, location: [stop.longitude, stop.latitude] })),
      }),
    }, 'VROOM');
    if (payload.unassigned?.length) {
      const saleIds = payload.unassigned.map((job: any) => stops[Number(job.id) - 1]?.saleId).filter(Boolean);
      throw new UnprocessableEntityException({ message: 'Some delivery stops are unreachable', saleIds });
    }
    const steps = payload.routes?.[0]?.steps?.filter((step: any) => step.type === 'job') ?? [];
    if (steps.length !== stops.length) throw new ServiceUnavailableException('VROOM returned an incomplete route');
    return steps.map((step: any, index: number) => ({ saleId: stops[Number(step.id) - 1].saleId, sequence: index + 1 }));
  }

  async buildRoute(coordinates: Coordinate[]) {
    const path = coordinates.map(([longitude, latitude]) => `${longitude},${latitude}`).join(';');
    const url = new URL(`/route/v1/driving/${path}`, this.osrmUrl);
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'full');
    url.searchParams.set('steps', 'false');
    const payload = await this.request(url, undefined, 'OSRM');
    const route = payload.routes?.[0];
    if (payload.code !== 'Ok' || !route?.geometry) throw new UnprocessableEntityException('OSRM could not build a route for the selected stops');
    return {
      geometry: route.geometry,
      distanceMeters: Math.round(route.distance),
      durationSeconds: Math.round(route.duration),
      legs: (route.legs ?? []).map((leg: any) => ({ distanceMeters: Math.round(leg.distance), durationSeconds: Math.round(leg.duration) })),
    };
  }

  private async request(url: URL, init: RequestInit | undefined, provider: string): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      this.logger.log({ provider, outcome: 'success', latencyMs: Date.now() - startedAt });
      return payload;
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      this.logger.warn({ provider, outcome: controller.signal.aborted ? 'timeout' : 'failure', latencyMs: Date.now() - startedAt });
      throw new ServiceUnavailableException(`${provider} routing provider is unavailable`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizePhotonFeature(feature: any) {
    const [longitude, latitude] = feature.geometry.coordinates;
    const properties = feature.properties ?? {};
    const label = properties.name
      ? [properties.name, properties.street, properties.city, properties.state, properties.country].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join(', ')
      : properties.label ?? `${latitude}, ${longitude}`;
    return { label, latitude, longitude, osmType: properties.osm_type ?? null, osmId: properties.osm_id == null ? null : String(properties.osm_id) };
  }

  private requiredUrl(key: string) {
    const value = this.config.get<string>(key);
    if (!value) throw new Error(`${key} is required`);
    return value;
  }
}
