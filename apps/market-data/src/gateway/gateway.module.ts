import { Module } from '@nestjs/common';
import { AddressModule } from 'address/address.module';
import { ChainModule } from 'chain/chain.module';
import { ProviderModule } from 'provider/provider.module';
import { SnapshotModule } from 'snapshot/snapshot.module';
import { GatewayRateLimitGuard } from './application/gateway-rate-limit.guard';
import { AddressesController } from './infrastructure/http/addresses.controller';
import { AddressesBatchController } from './infrastructure/http/addresses-batch.controller';
import { MarketDataSnapshotController } from './infrastructure/http/market-data-snapshot.controller';
import { ChainsController } from './infrastructure/http/chains.controller';
import { ProvidersController } from './infrastructure/http/providers.controller';
import { TokensSnapshotController } from './infrastructure/http/tokens-snapshot.controller';

/**
 * GatewayModule (Tramo 3, P45, P43; hexagonal layout todo 12, P50).
 *
 * Aggregated-data edge: the ONLY controllers in the app outside health.
 * AddressesController owns the universal model
 * (GET /api/v1/addresses/:chain/:address); TokensSnapshotController
 * stays as a deprecated kind=token alias (referenced by consumers).
 * MarketDataSnapshotController serves the kol-system compat contract
 * (GET /api/market-data/snapshot, todo 5) + AddressesBatchController
 * the 50-item batch (POST /api/v1/addresses/batch, todo 5, G-17).
 * Composes address/chain/provider ports, applies rate-limit + cache
 * per endpoint; auth (x-api-key) is enforced globally by ApiKeyGuard.
 * Feature modules expose ports — no stray controllers.
 */
@Module({
  imports: [AddressModule, ChainModule, ProviderModule, SnapshotModule],
  controllers: [
    AddressesController,
    AddressesBatchController,
    MarketDataSnapshotController,
    ChainsController,
    ProvidersController,
    TokensSnapshotController,
  ],
  providers: [GatewayRateLimitGuard],
  exports: [GatewayRateLimitGuard],
})
export class GatewayModule {}
