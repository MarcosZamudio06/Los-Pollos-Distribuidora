"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const constants_1 = require("@nestjs/common/constants");
const app_module_1 = require("./app.module");
const auth_module_1 = require("./modules/auth/auth.module");
const users_module_1 = require("./modules/users/users.module");
const products_module_1 = require("./modules/products/products.module");
const categories_module_1 = require("./modules/categories/categories.module");
const locations_module_1 = require("./modules/locations/locations.module");
const inventory_module_1 = require("./modules/inventory/inventory.module");
const customers_module_1 = require("./modules/customers/customers.module");
describe('AppModule', () => {
    it('registers backend modules without starter controllers or providers', () => {
        const imports = Reflect.getMetadata(constants_1.MODULE_METADATA.IMPORTS, app_module_1.AppModule);
        const controllers = Reflect.getMetadata(constants_1.MODULE_METADATA.CONTROLLERS, app_module_1.AppModule);
        const providers = Reflect.getMetadata(constants_1.MODULE_METADATA.PROVIDERS, app_module_1.AppModule);
        expect(imports).toContain(auth_module_1.AuthModule);
        expect(imports).toContain(users_module_1.UsersModule);
        expect(imports).toContain(products_module_1.ProductsModule);
        expect(imports).toContain(categories_module_1.CategoriesModule);
        expect(imports).toContain(locations_module_1.LocationsModule);
        expect(imports).toContain(inventory_module_1.InventoryModule);
        expect(imports).toContain(customers_module_1.CustomersModule);
        expect(controllers).toEqual([]);
        expect(providers).toEqual([]);
    });
});
//# sourceMappingURL=app.module.spec.js.map