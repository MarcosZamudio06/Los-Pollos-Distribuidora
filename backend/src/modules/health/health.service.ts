import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class HealthService implements OnApplicationBootstrap, OnModuleDestroy {
  private started = false;
  private draining = false;

  constructor(private readonly prisma: PrismaService) {}

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
      await this.prisma.$queryRawUnsafe('SELECT 1');
    } catch {
      throw new ServiceUnavailableException('Application is not ready');
    }

    return {
      success: true,
      message: 'Application is ready',
      data: { status: 'ready' },
    };
  }
}
