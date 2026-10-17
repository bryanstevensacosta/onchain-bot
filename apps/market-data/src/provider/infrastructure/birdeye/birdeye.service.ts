import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { throwIfRetryableProviderError } from '../../domain/retryable-provider.error';
import { DataProviderPort } from '../../domain/data-provider.port';
import type { BirdeyeConfig } from './birdeye.config';
import { BIRDEYE_CONFIG } from './birdeye.config';
import type {
  BirdeyeResponse,
  BirdeyeTokenOverviewData,
  BirdeyePriceData,
  BirdeyeTradesData,
  BirdeyeHolderProfileData,
  BirdeyeHolderPositionsData,
  BirdeyeTokenSecurityData,
  BirdeyeOhlcvData,
  BirdeyeOhlcvItem,
  BirdeyeOhlcvCandle,
} from './birdeye.types';

const BASE = 'https://public-api.birdeye.so';

/**
 * Our chain id -> Birdeye `x-chain` header value (dexter plan todo 31).
 *
 * Supported `x-chain` values per `birdeye/README.md` (docs.birdeye.so):
 * solana/ethereum/arbitrum/avalanche/bsc/optimism/polygon/base/zksync/
 * monad/hyperevm/aptos/fogo/mantle/megaeth/robinhood/sui. `optimism`
 * is mapped for catalog day (Birdeye serves it, but `STATIC_CHAINS`
 * has no row so snapshots 404 before any fetcher runs); `unichain`
 * is DELIBERATELY unmapped (Birdeye lists no such chain — never
 * invent coverage). Chains WITHOUT an entry resolve `null` WITHOUT
 * touching the network — never a wrong-`x-chain` query.
 */
export const BIRDEYE_CHAIN_SLUGS: Readonly<Record<string, string>> = {
  solana: 'solana',
  ethereum: 'ethereum',
  bsc: 'bsc',
  base: 'base',
  arbitrum: 'arbitrum',
  polygon: 'polygon',
  optimism: 'optimism',
  robinhood: 'robinhood',
};

/**
 * Our chains whose snapshots may consult Birdeye (dexter plan todo 31):
 * the `BIRDEYE_CHAIN_SLUGS` entries that also exist in `STATIC_CHAINS`
 * (1→7 effective chains — the biggest single coverage delta in the
 * audit matrix; optimism stays mapped-but-unqueried until the catalog
 * lands, same precedent as `GECKO_SUPPORTED_CHAINS`).
 */
export const BIRDEYE_SUPPORTED_CHAINS: ReadonlyArray<string> = [
  'solana',
  'ethereum',
  'bsc',
  'base',
  'arbitrum',
  'polygon',
  'robinhood',
];

/**
 * Resolve our chain id to its Birdeye `x-chain` value, or `null` when
 * the chain has no mapping (honest null — the caller must NOT fall
 * back to a default chain header).
 */
export function resolveBirdeyeChain(chain: string): string | null {
  return BIRDEYE_CHAIN_SLUGS[chain] ?? null;
}

/**
 * Coerce one v3 OHLCV cell to a finite number, or `null` (same liberal
 * mapping as the Gecko OHLCV mapper: numbers pass, numeric strings are
 * parsed, anything else — incl. NaN/Infinity — is dropped upstream).
 */
function toFiniteOhlcvNumber(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? parseFloat(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Birdeye market data provider — Solana focused.
 *
 * Public API (limited): price, overview, trades.
 * Premium API key required for full access.
 *
 * @see https://docs.birdeye.so/
 */
@Injectable()
export class BirdeyeService extends DataProviderPort {
  public readonly name = 'birdeye';
  protected readonly logger = new Logger(BirdeyeService.name);

  private readonly apiKey: string;

  public constructor(@Inject(BIRDEYE_CONFIG) config: BirdeyeConfig) {
    super();
    this.apiKey = config.apiKey;
    if (!this.apiKey) {
      this.logger.warn(
        'BIRDEYE_API_KEY missing — Birdeye provider will return null',
      );
    }
  }

  public async onModuleInit(): Promise<void> {
    if (this.apiKey) {
      this.logger.log('Birdeye provider initialized');
    }
  }

  // ─────────────────────────────────────────────
  //  Token data
  // ─────────────────────────────────────────────

  /**
   * Current token overview — price, volume, liquidity, market cap, holders.
   *
   * @param address - Token contract address
   * @param chain   - Chain slug (default: solana)
   */
  public async getTokenOverview(
    address: string,
    chain: string = 'solana',
  ): Promise<BirdeyeTokenOverviewData | null> {
    if (!this.apiKey) return null;
    const xChain = resolveBirdeyeChain(chain);
    if (xChain === null) return null;
    try {
      const { data } = await axios.get<
        BirdeyeResponse<BirdeyeTokenOverviewData>
      >(`${BASE}/defi/token_overview`, {
        params: { address },
        headers: { 'X-API-KEY': this.apiKey, 'x-chain': xChain },
        timeout: 8_000,
      });
      if (!data.success || !data.data) return null;
      return data.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      // 19b2: transient (timeout / 429-with-Retry-After / 5xx) surfaces
      // for the per-fetcher single retry; absence stays null.
      throwIfRetryableProviderError(err, 'birdeye');
      this.logger.debug(
        `Birdeye /token_overview failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Current price for a token.
   *
   * @param address - Token contract address
   * @param chain   - Chain slug (default: solana)
   */
  public async getTokenPrice(
    address: string,
    chain: string = 'solana',
  ): Promise<BirdeyePriceData | null> {
    if (!this.apiKey) return null;
    const xChain = resolveBirdeyeChain(chain);
    if (xChain === null) return null;
    try {
      const { data } = await axios.get<BirdeyeResponse<BirdeyePriceData>>(
        `${BASE}/defi/price`,
        {
          params: { address },
          headers: { 'X-API-KEY': this.apiKey, 'x-chain': xChain },
          timeout: 8_000,
        },
      );
      if (!data.success || !data.data) return null;
      return data.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`Birdeye /price failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Token-level OHLCV candles (dexter plan todo 55, keyed leg).
   *
   * The snapshot OHLC backfill derives its 24h change from POOL candles
   * (`getPoolOhlcv`, Gecko keyless) — but for tokens whose only venue
   * Gecko does not index the pool route returns `{"data":[]}` and there
   * is nothing to seed (WENCAT class). This token-level v3 route backs
   * that class from the keyed source instead: probe-verified live
   * 2026-10-17 (WENCAT bsc, `type=1H` → 18 hourly candles covering the
   * 24h window, `unix_time` epoch seconds).
   *
   * Rows map to the verbatim `[ts, o, h, l, c, v]` tuple (epoch
   * seconds) so the backfill consumes one candle shape regardless of
   * source. Malformed rows are skipped, empty/absent items resolve
   * `null`, keyless/unmapped chains resolve `null` zero-network, and
   * no error ever throws out (404 fast-path + 19b2 transient surfacing
   * like every leg above).
   *
   * @param address     - Token contract address
   * @param chain       - Chain slug (x-chain mapped)
   * @param type        - Candle type (default `1H` — the ≤1h granularity
   *                      the 24h window needs; v3 also serves 1s/15s/30s)
   * @param timeFromSec - Window start (epoch SECONDS, optional upstream)
   * @param timeToSec   - Window end (epoch SECONDS, optional upstream)
   */
  public async getTokenOhlcv(
    address: string,
    chain: string,
    type: string = '1H',
    timeFromSec?: number,
    timeToSec?: number,
  ): Promise<ReadonlyArray<BirdeyeOhlcvCandle> | null> {
    if (!this.apiKey) return null;
    const xChain = resolveBirdeyeChain(chain);
    if (xChain === null) return null;
    const params: Record<string, string> = { address, type };
    if (typeof timeFromSec === 'number' && Number.isFinite(timeFromSec)) {
      params.time_from = String(Math.floor(timeFromSec));
    }
    if (typeof timeToSec === 'number' && Number.isFinite(timeToSec)) {
      params.time_to = String(Math.floor(timeToSec));
    }
    try {
      const { data } = await axios.get<BirdeyeResponse<BirdeyeOhlcvData>>(
        `${BASE}/defi/v3/ohlcv`,
        {
          params,
          headers: { 'X-API-KEY': this.apiKey, 'x-chain': xChain },
          timeout: 8_000,
        },
      );
      if (!data.success || !data.data) return null;
      const rawItems = data.data.items;
      // Runtime guard against a non-array payload; annotation keeps the
      // element type (Array.isArray narrowing widens readonly arrays).
      const items: ReadonlyArray<BirdeyeOhlcvItem> = Array.isArray(rawItems)
        ? rawItems
        : [];
      if (items.length === 0) return null;
      const rows: BirdeyeOhlcvCandle[] = [];
      for (const item of items) {
        const ts = toFiniteOhlcvNumber(item.unix_time);
        const open = toFiniteOhlcvNumber(item.o);
        const high = toFiniteOhlcvNumber(item.h);
        const low = toFiniteOhlcvNumber(item.l);
        const close = toFiniteOhlcvNumber(item.c);
        const volume = toFiniteOhlcvNumber(item.v);
        if (
          ts === null ||
          open === null ||
          high === null ||
          low === null ||
          close === null ||
          volume === null
        ) {
          continue;
        }
        rows.push([ts, open, high, low, close, volume]);
      }
      return rows.length > 0 ? rows : null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      // 19b2: same transient surfacing as every leg above.
      throwIfRetryableProviderError(err, 'birdeye');
      this.logger.debug(
        `Birdeye /defi/v3/ohlcv failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Recent trades/swaps for a token.
   *
   * @param address - Token contract address
   * @param chain   - Chain slug (default: solana)
   * @param limit   - Max trades to return (default: 50)
   */
  public async getTokenTrades(
    address: string,
    chain: string = 'solana',
    limit: number = 50,
  ): Promise<BirdeyeTradesData | null> {
    if (!this.apiKey) return null;
    const xChain = resolveBirdeyeChain(chain);
    if (xChain === null) return null;
    try {
      const { data } = await axios.get<BirdeyeResponse<BirdeyeTradesData>>(
        `${BASE}/defi/txs/token`,
        {
          params: {
            address,
            limit: String(limit),
            offset: '0',
            txType: 'swap',
            sortType: 'desc',
          },
          headers: { 'X-API-KEY': this.apiKey, 'x-chain': xChain },
          timeout: 8_000,
        },
      );
      if (!data.success || !data.data) return null;
      return data.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(`Birdeye /txs/token failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Holder profile for a token — tag mix incl. dev (hold_amount,
   * percent_of_supply, PnL). No key -> null, never throws.
   */
  public async getHolderProfile(
    address: string,
    chain: string = 'solana',
  ): Promise<BirdeyeHolderProfileData | null> {
    if (!this.apiKey) return null;
    const xChain = resolveBirdeyeChain(chain);
    if (xChain === null) return null;
    try {
      const { data } = await axios.get<
        BirdeyeResponse<BirdeyeHolderProfileData>
      >(`${BASE}/token/v1/holder_profile`, {
        params: { address },
        headers: { 'X-API-KEY': this.apiKey, 'x-chain': xChain },
        timeout: 8_000,
      });
      if (!data.success || !data.data) return null;
      return data.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `Birdeye /holder_profile failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Holder positions filtered by label (default dev wallets).
   * No key -> null, never throws.
   */
  public async getDevPositions(
    address: string,
    chain: string = 'solana',
    limit: number = 10,
  ): Promise<BirdeyeHolderPositionsData | null> {
    if (!this.apiKey) return null;
    const xChain = resolveBirdeyeChain(chain);
    if (xChain === null) return null;
    try {
      const { data } = await axios.get<
        BirdeyeResponse<BirdeyeHolderPositionsData>
      >(`${BASE}/token/v1/holder_positions`, {
        params: { address, labels: 'dev', limit: String(limit), offset: '0' },
        headers: { 'X-API-KEY': this.apiKey, 'x-chain': xChain },
        timeout: 8_000,
      });
      if (!data.success || !data.data) return null;
      return data.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `Birdeye /holder_positions failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Token security scan — ownership/mint-freeze authorities, LP locks,
   * honeypot/sellability flags (dexter plan todo 31, keyed, 25 CU per
   * call — the spendiest Birdeye leg here, so it is NEVER called in
   * the per-snapshot quote fetcher; `SnapshotQuote` carries no
   * security columns and mapping it there would need a snapshot-core
   * change. Available as the security-aggregator input).
   *
   * No key or unmapped chain -> null, never throws. All chains except
   * Sui per the endpoint docs.
   *
   * @see https://docs.birdeye.so/reference/* (`/defi/token_security`)
   */
  public async getTokenSecurity(
    address: string,
    chain: string = 'solana',
  ): Promise<BirdeyeTokenSecurityData | null> {
    if (!this.apiKey) return null;
    const xChain = resolveBirdeyeChain(chain);
    if (xChain === null) return null;
    try {
      const { data } = await axios.get<
        BirdeyeResponse<BirdeyeTokenSecurityData>
      >(`${BASE}/defi/token_security`, {
        params: { address },
        headers: { 'X-API-KEY': this.apiKey, 'x-chain': xChain },
        timeout: 8_000,
      });
      if (!data.success || !data.data) return null;
      return data.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      this.logger.debug(
        `Birdeye /token_security failed: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
