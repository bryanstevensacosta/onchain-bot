import { DataProviderPort as ShimPort } from './core/data-provider.port';
import { DataProviderModule as ShimModule } from './core/data-provider.module';
import { DataProviderPort as CanonicalPort } from '../../../market-data/src/provider/infrastructure/core/data-provider.port';
import {
  AlchemyService as CanonicalAlchemyService,
  BirdeyeService as CanonicalBirdeyeService,
  CoinGeckoService as CanonicalCoinGeckoService,
  CoinMarketCapService as CanonicalCoinMarketCapService,
  DexScreenerService as CanonicalDexScreenerService,
  FluxRpcService as CanonicalFluxRpcService,
  GeckoTerminalService as CanonicalGeckoTerminalService,
  HeliusService as CanonicalHeliusService,
  MobulaService as CanonicalMobulaService,
  MoralisService as CanonicalMoralisService,
  PumpDevService as CanonicalPumpDevService,
  RugCheckService as CanonicalRugCheckService,
  SolanaRpcService as CanonicalSolanaRpcService,
} from '../../../market-data/src/provider/infrastructure/index';
import { AlchemyService as ShimAlchemyService } from './alchemy/alchemy.service';
import { BirdeyeService as ShimBirdeyeService } from './birdeye/birdeye.service';
import { CoinGeckoService as ShimCoinGeckoService } from './coingecko/coingecko.service';
import { CoinMarketCapService as ShimCoinMarketCapService } from './coinmarketcap/coinmarketcap.service';
import { DexScreenerService as ShimDexScreenerService } from './dexscreener/dexscreener.service';
import { FluxRpcService as ShimFluxRpcService } from './fluxrpc/fluxrpc.service';
import { GeckoTerminalService as ShimGeckoTerminalService } from './geckoterminal/geckoterminal.service';
import { HeliusService as ShimHeliusService } from './helius/helius.service';
import { MobulaService as ShimMobulaService } from './mobula/mobula.service';
import { MoralisService as ShimMoralisService } from './moralis/moralis.service';
import { PumpDevService as ShimPumpDevService } from './pumpdev/pumpdev.service';
import { RugCheckService as ShimRugCheckService } from './rugcheck/rugcheck.service';
import { SolanaRpcService as ShimSolanaRpcService } from './solana-rpc/solana-rpc.service';

/**
 * Adversarial shim-identity suite (Tramo 3, todo 4, C-DATA-01).
 *
 * Every backend `data-provider/` file is a deprecated re-export shim. If any
 * shim drifts from the market-data canonical owner (removed at cutover,
 * todo 8), legacy consumers would silently inject a forked class. This suite
 * fails on the first drifted reference.
 */
describe('data-provider shims track market-data canonicals (todo 4)', () => {
  it('re-exports the shared DataProviderPort base', () => {
    expect(ShimPort).toBe(CanonicalPort);
  });

  it('keeps the global DataProviderModule wired', () => {
    expect(ShimModule).toBeDefined();
  });

  it.each([
    [ShimAlchemyService, CanonicalAlchemyService],
    [ShimBirdeyeService, CanonicalBirdeyeService],
    [ShimCoinGeckoService, CanonicalCoinGeckoService],
    [ShimCoinMarketCapService, CanonicalCoinMarketCapService],
    [ShimDexScreenerService, CanonicalDexScreenerService],
    [ShimFluxRpcService, CanonicalFluxRpcService],
    [ShimGeckoTerminalService, CanonicalGeckoTerminalService],
    [ShimHeliusService, CanonicalHeliusService],
    [ShimMobulaService, CanonicalMobulaService],
    [ShimMoralisService, CanonicalMoralisService],
    [ShimPumpDevService, CanonicalPumpDevService],
    [ShimRugCheckService, CanonicalRugCheckService],
    [ShimSolanaRpcService, CanonicalSolanaRpcService],
  ])('shim service is the canonical class (%d)', (shim, canonical) => {
    expect(shim).toBe(canonical);
  });
});
