"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const app_config_1 = require("./config/app.config");
const database_config_1 = require("./config/database.config");
const env_validation_1 = require("./config/env.validation");
const prisma_module_1 = require("./database/prisma.module");
const auth_module_1 = require("./modules/auth/auth.module");
const users_module_1 = require("./modules/users/users.module");
const products_module_1 = require("./modules/products/products.module");
const categories_module_1 = require("./modules/categories/categories.module");
const locations_module_1 = require("./modules/locations/locations.module");
const inventory_module_1 = require("./modules/inventory/inventory.module");
const customers_module_1 = require("./modules/customers/customers.module");
const commercial_policies_module_1 = require("./modules/commercial-policies/commercial-policies.module");
const operational_config_module_1 = require("./modules/operational-config/operational-config.module");
const accounts_receivable_module_1 = require("./modules/accounts-receivable/accounts-receivable.module");
const payments_module_1 = require("./modules/payments/payments.module");
const sales_module_1 = require("./modules/sales/sales.module");
const suppliers_module_1 = require("./modules/suppliers/suppliers.module");
const purchases_module_1 = require("./modules/purchases/purchases.module");
const delivery_module_1 = require("./modules/delivery/delivery.module");
const reports_module_1 = require("./modules/reports/reports.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                cache: true,
                isGlobal: true,
                load: [app_config_1.appConfig, database_config_1.databaseConfig],
                validate: env_validation_1.validateEnvironment,
            }),
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            products_module_1.ProductsModule,
            categories_module_1.CategoriesModule,
            locations_module_1.LocationsModule,
            inventory_module_1.InventoryModule,
            customers_module_1.CustomersModule,
            commercial_policies_module_1.CommercialPoliciesModule,
            operational_config_module_1.OperationalConfigModule,
            accounts_receivable_module_1.AccountsReceivableModule,
            payments_module_1.PaymentsModule,
            sales_module_1.SalesModule,
            suppliers_module_1.SuppliersModule,
            purchases_module_1.PurchasesModule,
            delivery_module_1.DeliveryModule,
            reports_module_1.ReportsModule,
        ],
        controllers: [],
        providers: [],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map