import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from './app.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProductsModule } from './modules/products/products.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { LocationsModule } from './modules/locations/locations.module';
import { InventoryModule } from './modules/inventory/inventory.module';

describe('AppModule', () => {
  it('registers backend modules without starter controllers or providers', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as
      | unknown[]
      | undefined;
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      AppModule,
    ) as unknown[] | undefined;
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      AppModule,
    ) as unknown[] | undefined;

    expect(imports).toContain(AuthModule);
    expect(imports).toContain(UsersModule);
    expect(imports).toContain(ProductsModule);
    expect(imports).toContain(CategoriesModule);
    expect(imports).toContain(LocationsModule);
    expect(imports).toContain(InventoryModule);
    expect(controllers).toEqual([]);
    expect(providers).toEqual([]);
  });
});
