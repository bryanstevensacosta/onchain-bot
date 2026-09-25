import { Module } from '@nestjs/common';
import { AddressModule } from 'address/address.module';
import { ChainModule } from 'chain/chain.module';
import { ProviderModule } from 'provider/provider.module';
import { GatewayRateLimitGuard } from './gateway-rate-limit.guard';
import { AddressesController } from './api/http/addresses.controller';
import { ChainsController } from './api/http/chains.controller';
import { ProvidersController } from './api/http/providers.controller';
import { TokensSnapshotController } from './api/http/tokens-snapshot.controller';

/**
 * GatewayModule (Tramo 3, P45, P43).
 *
 * Aggregated-data edge: the ONLY controllers in the app outside health.
 * AddressesController owns the universal model
 * (GET /api/v1/addresses/:chain/:address); TokensSnapshotController
 * stays as a deprecated kind=token alias (referenced by consumers).
 * Composes address/chain/provider ports, applies rate-limit + cache
 * per endpoint; auth (x-api-key) is enforced globally by ApiKeyGuard.
 * Feature modules expose ports — no stray controllers.
 */
@Module({
  imports: [AddressModule, ChainModule, ProviderModule],
  controllers: [
    AddressesController,
    ChainsController,
    ProvidersController,
    TokensSnapshotController,
  ],
  providers: [GatewayRateLimitGuard],
  exports: [GatewayRateLimitGuard],
})
export class GatewayModule {}
