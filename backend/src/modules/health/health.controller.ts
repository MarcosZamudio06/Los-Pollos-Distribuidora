import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  getLiveness() {
    return this.healthService.getLiveness();
  }

  @Get('startup')
  getStartup() {
    return this.healthService.getStartup();
  }

  @Get('ready')
  getReadiness() {
    return this.healthService.getReadiness();
  }

  @Get('dependencies')
  async getDependencies() {
    return {
      success: true,
      message: 'Dependency health retrieved successfully',
      data: await this.healthService.getDependencies(),
    };
  }
}
