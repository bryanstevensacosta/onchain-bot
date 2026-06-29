import { Global, Module } from '@nestjs/common';
import { CoinMarketCapModule } from 'data-provider/coinmarketcap/coinmarketcap.module';
import { FluxRpcModule } from 'data-provider/fluxrpc/fluxrpc.module';
import { PumpDevModule } from 'data-provider/pumpdev/pumpdev.module';
import { AlchemyModule } from 'data-provider/alchemy/alchemy.module';
import { BirdeyeModule } from 'data-provider/birdeye/birdeye.module';
import { MobulaModule } from 'data-provider/mobula/mobula.module';
import { MoralisModule } from 'data-provider/moralis/moralis.module';
import { HeliusModule } from 'data-provider/helius/helius.module';
import { DexScreenerModule } from 'data-provider/dexscreener/dexscreener.module';
import { GeckoTerminalModule } from 'data-provider/geckoterminal/geckoterminal.module';
import { CoinGeckoModule } from 'data-provider/coingecko/coingecko.module';
import { RugCheckModule } from 'data-provider/rugcheck/rugcheck.module';
import { SolanaRpcModule } from 'data-provider/solana-rpc/solana-rpc.module';

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
