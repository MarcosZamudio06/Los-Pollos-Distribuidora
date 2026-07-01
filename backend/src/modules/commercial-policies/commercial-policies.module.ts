import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommercialPoliciesController } from './commercial-policies.controller';
import { CommercialPoliciesService } from './commercial-policies.service';

@Module({ imports: [AuthModule], controllers: [CommercialPoliciesController], providers: [CommercialPoliciesService], exports: [CommercialPoliciesService] })
export class CommercialPoliciesModule {}
