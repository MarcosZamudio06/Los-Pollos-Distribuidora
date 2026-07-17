import { Module } from '@nestjs/common';
import { PointOfSaleDailyCloseController } from './point-of-sale-daily-close.controller';
import { PointOfSaleDailyCloseService } from './point-of-sale-daily-close.service';
import { AuthModule } from '../auth/auth.module';
@Module({
  controllers: [PointOfSaleDailyCloseController],
  providers: [PointOfSaleDailyCloseService],
  imports: [AuthModule],
})
export class PointOfSaleDailyCloseModule {}
