import { Test } from '@nestjs/testing';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaModule } from '../../database/prisma.module';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ObjectStorageService } from '../object-storage/object-storage.service';
import { BrandingController } from './branding.controller';
import { BrandingModule } from './branding.module';

jest.mock('../../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('BrandingModule authentication composition', () => {
  it('resolves the real authentication service and guard through module imports', async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, BrandingModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(ObjectStorageService)
      .useValue({})
      .compile();

    try {
      expect(module.get(BrandingController)).toBeInstanceOf(BrandingController);
      expect(module.get(AuthService)).toBeInstanceOf(AuthService);
      expect(module.get(JwtAuthGuard)).toBeInstanceOf(JwtAuthGuard);
    } finally {
      await module.close();
    }
  });
});
