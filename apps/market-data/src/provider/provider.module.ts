import { Module } from '@nestjs/common';
import { ProviderHealthChecker } from './application/provider-health-checker.service';
import { ProviderRegistryService } from './application/provider-registry.service';

/**
 * ProviderModule (Tramo 3, todos 2+4, provider-hex, P43).
 *
 * Exposes the health/latency registry as a PORT only — no controllers.
 * GET /api/v1/providers lives in src/gateway/. The 13 physical adapters
 * live under src/provider/infrastructure/ (C-DATA-01, todo 4,
 * P45 path), aggregated by ProvidersModule; this module tracks one
 * health descriptor per adapter. Hexagonal layout: domain/ (ports +
 * descriptors + health VOs) <- application/ (registry + checker +
 * failover) <- infrastructure/ (adapters). Root files re-export the
 * new homes so `provider/*` consumers (address, gateway) are untouched.
 */
@Module({
  providers: [ProviderHealthChecker, ProviderRegistryService],
  exports: [ProviderHealthChecker, ProviderRegistryService],
})
export class ProviderModule {}
