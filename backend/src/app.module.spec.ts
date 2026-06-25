import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from './app.module';
import { AuthModule } from './modules/auth/auth.module';

describe('AppModule', () => {
  it('registers the auth backend module without starter controllers or providers', () => {
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
    expect(controllers).toEqual([]);
    expect(providers).toEqual([]);
  });
});
