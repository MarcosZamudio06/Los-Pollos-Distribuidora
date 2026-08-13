import { Injectable } from '@nestjs/common';
import type {
  TrafficProvider,
  TrafficProviderCapabilities,
  TrafficProviderHealth,
  TrafficSegment,
} from './traffic-provider';

@Injectable()
export class NullTrafficProvider implements TrafficProvider {
  getTrafficSnapshot(): Promise<readonly TrafficSegment[]> {
    return Promise.resolve([]);
  }

  getCapabilities(): Promise<TrafficProviderCapabilities> {
    return Promise.resolve({
      available: false,
      provider: null,
    });
  }

  healthCheck(): Promise<TrafficProviderHealth> {
    return Promise.resolve({
      available: false,
      provider: null,
      status: 'unavailable',
    });
  }
}
