/**
 * @deprecated Moved to apps/market-data/src/provider/infrastructure/ (Tramo 3, todo 4, C-DATA-01).
 * Canonical owner is now market-data (ProvidersModule); this module stays
 * wired for dual-run so every backend BC keeps injecting provider services
 * without changes. Removed at cutover (todo 8). Do not extend it.
 *
 * New location: apps/market-data/src/provider/infrastructure/providers.module.ts
 * Reason: extracting market-data providers from backend monolith to dedicated app
 * Breaking change: Yes (removal at cutover)
 * Rollback: restore backend implementation from git history
 */
import { Global, Module } from '@nestjs/common';
import { AlchemyModule } from '../../../../market-data/src/provider/infrastructure/alchemy/alchemy.module';
import { BirdeyeModule } from '../../../../market-data/src/provider/infrastructure/birdeye/birdeye.module';
import { CoinGeckoModule } from '../../../../market-data/src/provider/infrastructure/coingecko/coingecko.module';
import { CoinMarketCapModule } from '../../../../market-data/src/provider/infrastructure/coinmarketcap/coinmarketcap.module';
import { DexScreenerModule } from '../../../../market-data/src/provider/infrastructure/dexscreener/dexscreener.module';
import { FluxRpcModule } from '../../../../market-data/src/provider/infrastructure/fluxrpc/fluxrpc.module';
import { GeckoTerminalModule } from '../../../../market-data/src/provider/infrastructure/geckoterminal/geckoterminal.module';
import { HeliusModule } from '../../../../market-data/src/provider/infrastructure/helius/helius.module';
import { MobulaModule } from '../../../../market-data/src/provider/infrastructure/mobula/mobula.module';
import { MoralisModule } from '../../../../market-data/src/provider/infrastructure/moralis/moralis.module';
import { PumpDevModule } from '../../../../market-data/src/provider/infrastructure/pumpdev/pumpdev.module';
import { RugCheckModule } from '../../../../market-data/src/provider/infrastructure/rugcheck/rugcheck.module';
import { SolanaRpcModule } from '../../../../market-data/src/provider/infrastructure/solana-rpc/solana-rpc.module';

/**
 * Global module that aggregates all data-provider modules.
 *
 * Import `DataProviderModule` once in the root `AppModule`; every BC can
 * then inject any provider service without additional imports.
 */
@Global()
@Module({
  imports: [
    CoinMarketCapModule,
    FluxRpcModule,
    PumpDevModule,
    AlchemyModule,
    BirdeyeModule,
    MobulaModule,
    MoralisModule,
    HeliusModule,
    DexScreenerModule,
    GeckoTerminalModule,
    CoinGeckoModule,
    RugCheckModule,
    SolanaRpcModule,
  ],
  exports: [
    CoinMarketCapModule,
    FluxRpcModule,
    PumpDevModule,
    AlchemyModule,
    BirdeyeModule,
    MobulaModule,
    MoralisModule,
    HeliusModule,
    DexScreenerModule,
    GeckoTerminalModule,
    CoinGeckoModule,
    RugCheckModule,
    SolanaRpcModule,
  ],
})
export class DataProviderModule {}
