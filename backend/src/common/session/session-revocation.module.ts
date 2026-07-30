import { Global, Module } from '@nestjs/common';
import { SessionRevocationRegistry } from './session-revocation.registry';

@Global()
@Module({
  providers: [SessionRevocationRegistry],
  exports: [SessionRevocationRegistry],
})
export class SessionRevocationModule {}
