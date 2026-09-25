import { Module } from '@nestjs/common';
import { ProviderRegistryService } from './provider-registry.service';

/**
 * ProviderModule (Tramo 3, todo 2, P43).
 *
 * Exposes the health/latency registry as a PORT only — no controllers.
 * GET /api/v1/providers lives in src/gateway/. The 13 physical adapters
 * land in todo 4 (C-DATA-01, last move) under token/infrastructure/.
 */
@Module({
  providers: [ProviderRegistryService],
  exports: [ProviderRegistryService],
})
export class ProviderModule {}
