import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GeocodingProvider,
  GeocodingSearchInput,
} from '../contracts/geocoding-provider';
import type {
  Coordinates,
  GeocodingResult,
} from '../contracts/geospatial.types';
import {
  configuredTimeout,
  requestProviderJson,
  requiredProviderUrl,
} from './provider-http';

type CoordinatePair = [number, number];
type PhotonFeature = {
  geometry?: { coordinates?: CoordinatePair };
  properties?: {
    name?: string;
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    label?: string;
    osm_type?: string | null;
    osm_id?: string | number | null;
  };
};
type PhotonResponse = { features?: PhotonFeature[] };

@Injectable()
export class PhotonGeocodingProvider implements GeocodingProvider {
  private readonly logger = new Logger(PhotonGeocodingProvider.name);
  private readonly photonUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.photonUrl = requiredProviderUrl(config, 'PHOTON_URL');
    this.timeoutMs = configuredTimeout(
      config,
      'GEOCODING_TIMEOUT_MS',
      'ROUTING_TIMEOUT_MS',
      5000,
    );
  }

  async search(input: GeocodingSearchInput): Promise<GeocodingResult[]> {
    const query = input.query.trim();
    if (!query) {
      this.logger.log({
        provider: 'Photon',
        operation: 'search',
        outcome: 'success',
        result: 'empty',
        latencyMs: 0,
      });
      return [];
    }

    const url = new URL('/api/', this.photonUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('lang', 'default');
    url.searchParams.set('countrycode', 'MX');
    url.searchParams.set('limit', String(input.limit));
    if (input.proximity) {
      url.searchParams.set('lat', String(input.proximity.latitude));
      url.searchParams.set('lon', String(input.proximity.longitude));
    }

    const payload = await requestProviderJson<PhotonResponse>({
      logger: this.logger,
      provider: 'Photon',
      operation: 'search',
      unavailableMessage: 'Photon geocoding provider is unavailable',
      timeoutMs: this.timeoutMs,
      url,
      resultFor: (response) =>
        response.features?.length ? 'results' : 'empty',
    });

    return (payload.features ?? [])
      .map((feature) => this.normalizeFeature(feature))
      .filter((result): result is GeocodingResult => result !== null);
  }

  async reverse(point: Coordinates): Promise<GeocodingResult> {
    const url = new URL('/reverse', this.photonUrl);
    url.searchParams.set('lat', String(point.latitude));
    url.searchParams.set('lon', String(point.longitude));
    url.searchParams.set('lang', 'default');

    const payload = await requestProviderJson<PhotonResponse>({
      logger: this.logger,
      provider: 'Photon',
      operation: 'reverse',
      unavailableMessage: 'Photon geocoding provider is unavailable',
      timeoutMs: this.timeoutMs,
      url,
      resultFor: (response) => (response.features?.length ? 'result' : 'empty'),
    });

    const result = this.normalizeFeature(payload.features?.[0]);
    if (!result) {
      throw new UnprocessableEntityException(
        'No address was found for the selected coordinates',
      );
    }
    return result;
  }

  private normalizeFeature(
    feature: PhotonFeature | undefined,
  ): GeocodingResult | null {
    const coordinates = feature?.geometry?.coordinates;
    if (
      !coordinates ||
      coordinates.length < 2 ||
      !Number.isFinite(coordinates[0]) ||
      !Number.isFinite(coordinates[1])
    ) {
      return null;
    }

    const [longitude, latitude] = coordinates;
    const properties = feature.properties ?? {};
    const label = properties.name
      ? [
          properties.name,
          properties.street,
          properties.city,
          properties.state,
          properties.country,
        ]
          .filter(Boolean)
          .filter((value, index, all) => all.indexOf(value) === index)
          .join(', ')
      : (properties.label ?? `${latitude}, ${longitude}`);

    return {
      label,
      latitude,
      longitude,
      osmType: properties.osm_type ?? null,
      osmId: properties.osm_id == null ? null : String(properties.osm_id),
    };
  }
}
