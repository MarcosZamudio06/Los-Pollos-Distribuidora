import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProductEquivalencesController } from './product-equivalences.controller';
import { ProductsController } from './products.controller';
import { ProductEquivalencesService } from './product-equivalences.service';
import { ProductsService } from './products.service';

@Module({
  imports: [AuthModule],
  controllers: [ProductsController, ProductEquivalencesController],
  providers: [ProductsService, ProductEquivalencesService],
  exports: [ProductsService, ProductEquivalencesService],
})
export class ProductsModule {}
