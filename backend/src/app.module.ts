import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard';
import { appConfig } from './config/app.config';
import { databaseConfig } from './config/database.config';
import { validateEnvironment } from './config/env.validation';
import { createHttpThrottlerOptions } from './config/http-throttler.config';
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
import { ReportsModule } from './modules/reports/reports.module';
import { BillingRequestsModule } from './modules/billing-requests/billing-requests.module';
import { PointOfSaleDailyCloseModule } from './modules/point-of-sale-daily-close/point-of-sale-daily-close.module';
import { BillingModule } from './modules/billing/billing.module';
import { CashManagementModule } from './modules/cash-management/cash-management.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      load: [appConfig, databaseConfig],
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createHttpThrottlerOptions,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
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
    ReportsModule,
    BillingRequestsModule,
    PointOfSaleDailyCloseModule,
    CashManagementModule,
    BillingModule,
  ],
  controllers: [],
  providers: [{ provide: APP_GUARD, useClass: HttpThrottlerGuard }],
})
export class AppModule {}
