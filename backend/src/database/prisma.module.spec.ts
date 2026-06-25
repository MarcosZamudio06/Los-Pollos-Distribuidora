import {
  GLOBAL_MODULE_METADATA,
  MODULE_METADATA,
} from '@nestjs/common/constants';

jest.mock('@prisma/client', () => ({
  PrismaClient: class {
    $connect = jest.fn().mockResolvedValue(undefined);
    $disconnect = jest.fn().mockResolvedValue(undefined);
  },
}));

import { AppModule } from '../app.module';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

describe('PrismaModule', () => {
  it('registers one shared PrismaService provider and exports it globally', () => {
    const isGlobal = Reflect.getMetadata(
      GLOBAL_MODULE_METADATA,
      PrismaModule,
    ) as boolean | undefined;
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      PrismaModule,
    ) as unknown[] | undefined;
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      PrismaModule,
    ) as unknown[] | undefined;
    const appImports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      AppModule,
    ) as unknown[] | undefined;

    expect(isGlobal).toBe(true);
    expect(providers).toEqual([PrismaService]);
    expect(exports).toEqual([PrismaService]);
    expect(appImports).toContain(PrismaModule);
  });
});

describe('PrismaService', () => {
  it('opens the shared Prisma connection when the Nest module initializes', async () => {
    const service = new PrismaService();
    const connect = jest
      .spyOn(service, '$connect')
      .mockResolvedValue(undefined);

    await service.onModuleInit();

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('closes the shared Prisma connection when the Nest module is destroyed', async () => {
    const service = new PrismaService();
    const disconnect = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);

    await service.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
