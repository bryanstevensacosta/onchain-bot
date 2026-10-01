import type { DevHoldingsResult } from './dev-holdings.types';

/**
 * DevHoldingsPort (market-data restructure: holders via ports).
 *
 * Seam between the snapshot pipeline and dev-wallet resolution
 * (Birdeye holder profile/positions with Helius first-tx fallback,
 * solana-only, explicit nulls). The pipeline injects this port;
 * `HoldersModule` binds it to `DevHoldingsService`.
 */
export abstract class DevHoldingsPort {
  abstract resolve(chain: string, mint: string): Promise<DevHoldingsResult>;
}
