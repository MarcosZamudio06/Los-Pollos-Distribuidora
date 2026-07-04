import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import { validateEnvironment } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProductsModule } from './modules/products/products.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { LocationsModule } from './modules/locations/locations.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CustomersModule } from './modules/customers/customers.module';
import { CommercialPoliciesModule } from './modules/commercial-policies/commercial-policies.module';
import { OperationalConfigModule } from './modules/operational-config/operational-config.module';
import { AccountsReceivableModule } from './modules/accounts-receivable/accounts-receivable.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SalesModule } from './modules/sales/sales.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { DeliveryModule } from './modules/delivery/delivery.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      load: [appConfig, databaseConfig],
      validate: validateEnvironment,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    CategoriesModule,
    LocationsModule,
    InventoryModule,
    CustomersModule,
    CommercialPoliciesModule,
    OperationalConfigModule,
    AccountsReceivableModule,
    PaymentsModule,
    SalesModule,
    SuppliersModule,
    PurchasesModule,
    DeliveryModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
