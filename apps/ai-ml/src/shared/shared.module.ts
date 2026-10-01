import { Global, Module } from '@nestjs/common';
import { AccessAuditService } from 'auth/application/access-audit.service';

/**
 * SharedModule (ai-ml, todo 0): global singletons with no HTTP surface
 * (access audit). The API-key guard is wired globally in AppModule via
 * APP_GUARD so feature modules stay auth-agnostic.
 */
@Global()
@Module({
  providers: [AccessAuditService],
  exports: [AccessAuditService],
})
export class SharedModule {}
