import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OperationalConfigController } from './operational-config.controller';
import { OperationalConfigService } from './operational-config.service';

@Module({ imports: [AuthModule], controllers: [OperationalConfigController], providers: [OperationalConfigService], exports: [OperationalConfigService] })
export class OperationalConfigModule {}
