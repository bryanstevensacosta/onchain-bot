/**
 * Canonical barrel for the 13 physical market-data adapters
 * (Tramo 3, todo 4, C-DATA-01, P45 path).
 *
 * Physically extracted from `apps/backend/src/data-provider/` — the backend
 * keeps deprecated re-export shims only (removed at cutover, todo 8).
 * Adapters are CODE (health-log + snapshots + rate-state go to DB per P44).
 */
export { DataProviderPort } from '../domain/data-provider.port';
export { ProvidersModule } from './providers.module';
export { AlchemyModule, AlchemyService } from './alchemy';
export { BirdeyeModule, BirdeyeService } from './birdeye';
export { CoinGeckoModule, CoinGeckoService } from './coingecko';
export { CoinMarketCapModule, CoinMarketCapService } from './coinmarketcap';
export { DexScreenerModule, DexScreenerService } from './dexscreener';
export { FluxRpcModule, FluxRpcService } from './fluxrpc';
export { GeckoTerminalModule, GeckoTerminalService } from './geckoterminal';
export { HeliusModule, HeliusService } from './helius';
export { MobulaModule, MobulaService } from './mobula';
export { MoralisModule, MoralisService } from './moralis';
export { PumpDevModule, PumpDevService } from './pumpdev';
export { RugCheckModule, RugCheckService } from './rugcheck';
export { SolanaRpcModule, SolanaRpcService } from './solana-rpc';
