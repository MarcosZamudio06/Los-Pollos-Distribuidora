import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';

@Controller('health')
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
}
