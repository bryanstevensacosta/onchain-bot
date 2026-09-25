import { Module } from '@nestjs/common';
import { ChainModule } from 'chain/chain.module';
import { ProviderModule } from 'provider/provider.module';
import { GatewayRateLimitGuard } from './gateway-rate-limit.guard';
import { ChainsController } from './api/http/chains.controller';
import { ProvidersController } from './api/http/providers.controller';
import { TokensSnapshotController } from './api/http/tokens-snapshot.controller';

/**
 * GatewayModule (Tramo 3, todo 2, P43).
 *
 * Aggregated-data edge: the ONLY controllers in the app outside health.
 * Composes chain/provider ports, applies rate-limit + cache per
 * endpoint; auth (x-api-key) is enforced globally by ApiKeyGuard.
 * Feature modules expose ports — no stray controllers.
 */
@Module({
  imports: [ChainModule, ProviderModule],
  controllers: [ChainsController, ProvidersController, TokensSnapshotController],
  providers: [GatewayRateLimitGuard],
  exports: [GatewayRateLimitGuard],
})
export class GatewayModule {}
