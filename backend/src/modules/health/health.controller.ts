import { Controller, Get, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @Header('Cache-Control', 'no-store')
  getLiveness() {
    return this.healthService.getLiveness();
  }

  @Get('startup')
  @Header('Cache-Control', 'no-store')
  getStartup() {
    return this.healthService.getStartup();
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  getReadiness() {
    return this.healthService.getReadiness();
  }

  @Get('dependencies')
  @Header('Cache-Control', 'no-store')
  async getDependencies() {
    return {
      success: true,
      message: 'Dependency health retrieved successfully',
      data: await this.healthService.getDependencies(),
    };
  }
}
