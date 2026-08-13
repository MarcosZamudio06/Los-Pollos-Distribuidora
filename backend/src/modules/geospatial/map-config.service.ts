import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  MapClientConfig,
  MapStyleConfigProvider,
} from './contracts/map-style-config-provider';

@Injectable()
export class MapConfigService implements MapStyleConfigProvider {
  constructor(private readonly config: ConfigService) {}

  getClientConfig(): Promise<MapClientConfig> {
    const renderingEnabled = this.booleanValue('MAP_RENDERING_ENABLED', true);
    const configuredStyleUrl =
      this.config.get<string>('MAP_STYLE_PUBLIC_URL') ??
      '/maps/styles/operations/style.json';
    const styleUrl = this.browserSafeStyleUrl(configuredStyleUrl);
    const styleProvider = this.config.get<string>(
      'MAP_STYLE_PROVIDER',
      'self-hosted',
    );

    return Promise.resolve({
      renderer: 'maplibre',
      available:
        renderingEnabled &&
        styleProvider === 'self-hosted' &&
        styleUrl === configuredStyleUrl,
      styleUrl,
      revision: this.config.get<string>('MAP_STYLE_REVISION', 'mexico-2026-08'),
      attribution: [
        {
          label: '© OpenStreetMap contributors',
          url: 'https://www.openstreetmap.org/copyright',
        },
      ],
      defaultViewport: {
        latitude: this.numberValue('MAP_DEFAULT_LATITUDE', 19.1738),
        longitude: this.numberValue('MAP_DEFAULT_LONGITUDE', -96.1342),
        zoom: this.numberValue('MAP_DEFAULT_ZOOM', 11),
      },
      capabilities: {
        geocoding:
          this.config.get<string>('GEOCODING_PROVIDER', 'photon') !== '',
        routing: this.config.get<string>('ROUTING_PROVIDER', 'osrm') !== '',
        optimization:
          this.config.get<string>('ROUTE_OPTIMIZATION_PROVIDER', 'vroom') !==
          '',
      },
    });
  }

  private booleanValue(key: string, fallback: boolean): boolean {
    const value = this.config.get<boolean | string>(key, fallback);
    if (typeof value === 'boolean') return value;
    return value?.toLowerCase() !== 'false';
  }

  private numberValue(key: string, fallback: number): number {
    const value = Number(this.config.get<number | string>(key, fallback));
    return Number.isFinite(value) ? value : fallback;
  }

  private browserSafeStyleUrl(value: string): string {
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    try {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase();
      const internalHost =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname === '::1' ||
        hostname === 'internal' ||
        hostname.endsWith('.internal') ||
        hostname.endsWith('.local') ||
        ['photon', 'osrm', 'vroom'].includes(hostname);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        internalHost
      ) {
        return '/maps/styles/operations/style.json';
      }
      return value;
    } catch {
      return '/maps/styles/operations/style.json';
    }
  }
}
