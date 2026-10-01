import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DataProviderPort } from '../../domain/data-provider.port';
import type { ProviderRateLimitConfig } from '../../domain/provider-limiter-config';
import { CCXT_CONFIG, type CcxtConfig } from './ccxt.config';
import type { CcxtLibLoader, CcxtOhlcvCandle, CcxtTicker } from './ccxt.types';

const CEX_SYMBOL = /^[A-Z0-9]{2,20}\/[A-Z0-9]{2,20}$/i;

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

/**
 * ccxt REST adapter (Tramo 3, todo 16, P48).
 *
 * CEX tickers + OHLCV over the unified ccxt API (`enableRateLimit`).
 * Coverage is CEX pair symbols only (`BASE/QUOTE`) — onchain addresses
 * short-circuit to null before any network or quota touch. `ccxt` is an
 * OPTIONAL peer loaded with a dynamic require (same pattern as the
 * stream driver): missing package resolves to null, fail-open, so the
 * cascade keeps merging the other providers. Exchanges are allowlisted
 * per env (`MARKET_DATA_CCXT_EXCHANGES`).
 */
@Injectable()
export class CcxtService extends DataProviderPort {
  public readonly name = 'ccxt';

  protected readonly logger = new Logger(CcxtService.name);

  public readonly defaultExchange: string;

  private readonly allowlist: ReadonlySet<string>;

  private readonly loader: CcxtLibLoader;

  private warnedMissing = false;

  public constructor(
    @Inject(CCXT_CONFIG) config: CcxtConfig,
    @Optional() loader?: CcxtLibLoader,
  ) {
    super();
    this.defaultExchange = config.defaultExchange;
    this.allowlist = new Set(
      config.exchanges.map((exchange) => exchange.toLowerCase()),
    );
    this.loader = loader ?? CcxtService.defaultLoader;
  }

  public static isCexSymbol(value: string): boolean {
    return CEX_SYMBOL.test(value.trim());
  }

  public isAllowed(exchangeId: string): boolean {
    return this.allowlist.has(exchangeId.toLowerCase());
  }

  public override getRateLimitConfig(): ProviderRateLimitConfig {
    return {
      windowMs: 60_000,
      limitPerWindow: 600,
      endpointCosts: { ticker: 1, ohlcv: 5, quote: 1 },
      backoffInitialMs: 1_000,
      backoffMaxMs: 30_000,
    };
  }

  public async fetchTicker(
    exchangeId: string,
    symbol: string,
  ): Promise<CcxtTicker | null> {
    const client = this.clientFor(exchangeId);
    if (client === null || !CcxtService.isCexSymbol(symbol)) {
      return null;
    }
    try {
      const raw = (await client.fetchTicker(symbol)) as {
        symbol?: unknown;
        last?: unknown;
      };
      return {
        symbol: typeof raw.symbol === 'string' ? raw.symbol : symbol,
        last: toNumber(raw.last),
      };
    } catch {
      return null;
    }
  }

  public async fetchOHLCV(
    exchangeId: string,
    symbol: string,
    timeframe = '1m',
    limit = 20,
  ): Promise<ReadonlyArray<CcxtOhlcvCandle> | null> {
    const client = this.clientFor(exchangeId);
    if (client === null || !CcxtService.isCexSymbol(symbol)) {
      return null;
    }
    try {
      const raw = (await client.fetchOHLCV(
        symbol,
        timeframe,
        undefined,
        limit,
      )) as Array<Array<unknown>>;
      if (!Array.isArray(raw)) {
        return null;
      }
      return raw
        .map((candle) => ({
          timestamp: toNumber(candle[0]) ?? 0,
          open: toNumber(candle[1]) ?? 0,
          high: toNumber(candle[2]) ?? 0,
          low: toNumber(candle[3]) ?? 0,
          close: toNumber(candle[4]) ?? 0,
          volume: toNumber(candle[5]) ?? 0,
        }))
        .filter((candle) => candle.timestamp > 0);
    } catch {
      return null;
    }
  }

  private static defaultLoader(): unknown {
    const dynamicRequire = new Function('id', 'return require(id)') as (
      id: string,
    ) => unknown;
    return dynamicRequire('ccxt');
  }

  private clientFor(exchangeId: string): {
    fetchTicker(symbol: string): Promise<unknown>;
    fetchOHLCV(
      symbol: string,
      timeframe?: string,
      since?: number,
      limit?: number,
    ): Promise<unknown>;
  } | null {
    if (!this.isAllowed(exchangeId)) {
      return null;
    }
    let lib: unknown;
    try {
      lib = this.loader();
    } catch {
      if (!this.warnedMissing) {
        this.warnedMissing = true;
        this.logger.warn(
          'ccxt peer is not installed — CEX quotes resolve to null (fail-open)',
        );
      }
      return null;
    }
    const ExchangeClass = (lib as Record<string, unknown>)[exchangeId];
    if (typeof ExchangeClass !== 'function') {
      return null;
    }
    try {
      return new (ExchangeClass as new (opts: unknown) => {
        fetchTicker(symbol: string): Promise<unknown>;
        fetchOHLCV(
          symbol: string,
          timeframe?: string,
          since?: number,
          limit?: number,
        ): Promise<unknown>;
      })({ enableRateLimit: true });
    } catch {
      return null;
    }
  }
}
