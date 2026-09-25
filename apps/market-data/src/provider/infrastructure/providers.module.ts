import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AlchemyModule } from './alchemy/alchemy.module';
import { BirdeyeModule } from './birdeye/birdeye.module';
import { CoinGeckoModule } from './coingecko/coingecko.module';
import { CoinMarketCapModule } from './coinmarketcap/coinmarketcap.module';
import { DexScreenerModule } from './dexscreener/dexscreener.module';
import { FluxRpcModule } from './fluxrpc/fluxrpc.module';
import { GeckoTerminalModule } from './geckoterminal/geckoterminal.module';
import { HeliusModule } from './helius/helius.module';
import { MobulaModule } from './mobula/mobula.module';
import { MoralisModule } from './moralis/moralis.module';
import { PumpDevModule } from './pumpdev/pumpdev.module';
import { RugCheckModule } from './rugcheck/rugcheck.module';
import { SolanaRpcModule } from './solana-rpc/solana-rpc.module';

/**
 * ProvidersModule (Tramo 3, todo 4, C-DATA-01).
 *
 * Aggregates the 13 physically extracted adapters (P45 path). Modules keep
 * their `forRoot`/`forRootAsync` ConfigService wiring byte-identical to the
 * backend originals, so `ConfigModule` (global in `AppModule`) must be in
 * scope. The health/latency view stays in `src/provider/` (port only, P43).
 */
@Module({
  imports: [
    ConfigModule,
    AlchemyModule,
    BirdeyeModule,
    CoinGeckoModule,
    CoinMarketCapModule,
    DexScreenerModule,
    FluxRpcModule,
    GeckoTerminalModule,
    HeliusModule,
    MobulaModule,
    MoralisModule,
    PumpDevModule,
    RugCheckModule,
    SolanaRpcModule,
  ],
  exports: [
    AlchemyModule,
    BirdeyeModule,
    CoinGeckoModule,
    CoinMarketCapModule,
    DexScreenerModule,
    FluxRpcModule,
    GeckoTerminalModule,
    HeliusModule,
    MobulaModule,
    MoralisModule,
    PumpDevModule,
    RugCheckModule,
    SolanaRpcModule,
  ],
})
export class ProvidersModule {}
