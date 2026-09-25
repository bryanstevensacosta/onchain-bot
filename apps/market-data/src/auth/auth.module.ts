import { Module } from '@nestjs/common';
import { AccessAuditService } from './application/access-audit.service';
import { ApiKeyRateLimiter } from './application/api-key-rate-limiter';
import { ApiKeyService } from './application/api-key.service';
import { ApiKeyController } from './infrastructure/http/api-key.controller';

/**
 * AuthModule (Tramo 3, todo 10, P46 seguridad).
 *
 * Scoped API-key system: hash-only store, dual-key rotation,
 * per-key rate-limit, access audit. No controllers besides the
 * admin key-management edge; enforcement lives in the global
 * `ApiKeyGuard` (shared/).
 */
@Module({
  controllers: [ApiKeyController],
  providers: [ApiKeyService, AccessAuditService, ApiKeyRateLimiter],
  exports: [ApiKeyService, AccessAuditService, ApiKeyRateLimiter],
})
export class AuthModule {}
