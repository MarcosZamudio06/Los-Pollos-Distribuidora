import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OBJECT_STORAGE } from './object-storage.port';
import { ObjectStorageService } from './object-storage.service';

@Module({
  imports: [ConfigModule],
  providers: [
    ObjectStorageService,
    { provide: OBJECT_STORAGE, useExisting: ObjectStorageService },
  ],
  exports: [OBJECT_STORAGE, ObjectStorageService],
})
export class ObjectStorageModule {}
