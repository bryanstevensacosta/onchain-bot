import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SnapshotModule } from '../snapshot.module';
import { AddressSnapshotService } from './address-snapshot.service';
import { DirectFastPathService } from './direct-fast-path.service';
import { AddressExistenceService } from './address-existence.service';
import { GoplusService } from 'provider/infrastructure/goplus';
import { LaunchpadDetectorService } from 'launchpad/application/launchpad-detector.service';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
import { BirdeyeService } from 'provider/infrastructure/birdeye';
import { DevHoldingsPort } from 'holders/domain/holdings.port';
import { emptyDevHoldings } from 'holders/domain/dev-holdings.types';
import { RetryableProviderError } from 'provider/domain/retryable-provider.error';
import { launchpadInfo } from 'launchpad/domain/launchpad-table';
import { SNAPSHOT_QUOTE_PROVIDERS } from '../domain/snapshot-quote.types';

/**
 * Venue market fill + Gecko launchpad hint + ATH-seed 429 backoff
 * (dexter plan todo 72) — the fork-B seam in `AddressSnapshotService`.
 *
 * The fill is harvested from the SAME pool pick the OHLC-derivation leg
 * already fetches (`acquireDerivationCandles`), so these specs pin:
 *  - null-only fill of liquidity/volume/change from the picked pool;
 *  - the early return when the pick itself carries the 24h change
 *    (`geckoterminal-ohlcv` never claimed, zero hour calls);
 *  - provenance (`geckoterminal`, once) and `pairCreatedAt` fallback;
 *  - the allowlist/chain/kind gates of the `/info` hint and the
 *    detector-positive precedence;
 *  - the 60s 429 pause vs the 6h definitive memo.
 *
 * Fixtures reproduce the live PumpSwap numbers captured 2026-10-21
 * (reserve 2365.4217 / volume 0 / change 0 / pool_created_at
 * 2026-10-14T12:44:35Z).
 */

const STAGEVEIL = '0xcf7f00000000000000000000000000000000f3597';
const WETH = '0x0000000000000000000000000000000000000001';
const SOL_MINT = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const POOL = '0x926900000000000000000000000000000000ef60';
const POOL_CREATED_AT = '2026-10-14T12:44:35Z';
const POOL_CREATED_MS = Date.parse(POOL_CREATED_AT);
const SUPPLY = 939_036_613;
const LIVE_PRICE = 0.000002325209423;

interface Calls {
  pools: number;
  ohlcv: number;
  day: number;
}

interface HarnessOptions {
  readonly chain?: string;
  /** Quote returned by the stub-native fetcher (null = no contribution). */
  readonly quote?: Record<string, unknown> | null;
  readonly pools?: unknown;
  readonly searchPools?: unknown;
  readonly ohlcv?: unknown;
  /** When present, the stub exposes `getPoolOhlcvDay`. */
  readonly dayOhlcv?: () => Promise<unknown>;
  readonly detector?: unknown;
  readonly dsc?: unknown;
  readonly calls?: Calls;
}

function poolFixture(attrs: {
  readonly reserve?: string;
  readonly volume?: string | null;
  readonly volume1h?: string | null;
  readonly change?: string | null;
  readonly change1h?: string | null;
  readonly txns1h?: {
    readonly buys?: string | number | null;
    readonly sells?: string | number | null;
  };
  readonly createdAt?: string | null;
  readonly dex?: string;
}): unknown {
  return [
    {
      id: `robinhood_${POOL}`,
      type: 'pool',
      attributes: {
        address: POOL,
        base_token_price_usd: '0.000002325209423',
        quote_token_price_usd: '2692.72',
        fdv_usd: '2183.4567813695317',
        reserve_in_usd: attrs.reserve ?? '2365.4217',
        volume_usd:
          attrs.volume === null
            ? undefined
            : {
                h24: attrs.volume ?? '0',
                ...(attrs.volume1h !== undefined ? { h1: attrs.volume1h } : {}),
              },
        price_change_percentage:
          attrs.change === null
            ? undefined
            : {
                h24: attrs.change ?? '0',
                ...(attrs.change1h !== undefined ? { h1: attrs.change1h } : {}),
              },
        ...(attrs.txns1h !== undefined
          ? { transactions: { h1: attrs.txns1h } }
          : {}),
        pool_created_at:
          attrs.createdAt === null
            ? undefined
            : (attrs.createdAt ?? POOL_CREATED_AT),
      },
      relationships: {
        base_token: { data: { id: `robinhood_${STAGEVEIL}`, type: 'token' } },
        quote_token: { data: { id: `robinhood_${WETH}`, type: 'token' } },
        dex: { data: { id: attrs.dex ?? 'pumpswap', type: 'dex' } },
      },
    },
  ];
}

function solanaCandles(nowMs: number): unknown {
  return [
    [Math.floor((nowMs - 24 * 60 * 60 * 1000) / 1000), 100, 100, 100, 100, 1],
    [Math.floor((nowMs - 60 * 60 * 1000) / 1000), 50, 50, 50, 50, 1],
  ];
}

async function buildService(options: HarnessOptions = {}): Promise<{
  readonly service: AddressSnapshotService;
}> {
  const calls = options.calls;
  const gecko: Record<string, unknown> = {
    getTokenPools: async () => {
      if (calls !== undefined) calls.pools += 1;
      return options.pools ?? null;
    },
    searchPools: async () => options.searchPools ?? null,
    getPoolOhlcv: async () => {
      if (calls !== undefined) calls.ohlcv += 1;
      return options.ohlcv ?? null;
    },
  };
  if (options.dayOhlcv !== undefined) {
    const day = options.dayOhlcv;
    gecko.getPoolOhlcvDay = async () => {
      if (calls !== undefined) calls.day += 1;
      return day();
    };
  }
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      SnapshotModule,
    ],
  })
    .overrideProvider(SNAPSHOT_QUOTE_PROVIDERS)
    .useValue([
      {
        name: 'stub-native',
        supportsChains: [options.chain ?? 'robinhood'],
        fetch: async () => options.quote ?? null,
      },
    ])
    .overrideProvider(LaunchpadDetectorService)
    .useValue({ detectLaunchpad: async () => options.detector ?? null })
    .overrideProvider(DexScreenerService)
    .useValue({
      getBestPairSummaryForChain: async () => options.dsc ?? null,
      getPairsByToken: async () => null,
    })
    .overrideProvider(GeckoTerminalService)
    .useValue(gecko)
    .overrideProvider(BirdeyeService)
    .useValue({ getTokenOhlcv: async () => null })
    .overrideProvider(DirectFastPathService)
    .useValue({ tryResolve: async () => null })
    .overrideProvider(AddressExistenceService)
    .useValue({
      probe: async () => ({
        verdict: 'unresolved',
        reason: 'spec stub (fail-open)',
        ms: 0,
      }),
    })
    .overrideProvider(GoplusService)
    .useValue({
      getTokenSecurity: async () => ({ kind: 'definitive-absence' }),
    })
    .overrideProvider(DevHoldingsPort)
    .useValue({ resolve: async () => emptyDevHoldings() })
    .compile();
  return { service: module.get(AddressSnapshotService) };
}

describe('venue market fill (plan todo 72, fork B)', () => {
  it('fills liquidity/volume/change from the picked pool, skips the hour call and names geckoterminal', async () => {
    const calls: Calls = { pools: 0, ohlcv: 0, day: 0 };
    const { service } = await buildService({
      quote: {
        priceUsd: LIVE_PRICE,
        priceChange24h: null,
        totalSupply: SUPPLY,
      },
      pools: poolFixture({}),
      calls,
    });

    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });

    expect(snapshot.status).toBe('ready');
    expect(snapshot.liquidityUsd).toBe(2365.4217);
    // Real zeroes stay zeroes (never nullished away by the fill).
    expect(snapshot.volume24hUsd).toBe(0);
    expect(snapshot.priceChange24h).toBe(0);
    expect(snapshot.pairCreatedAt).toBe(
      new Date(POOL_CREATED_MS).toISOString(),
    );
    // Fork B: the pick answered the change, no candle series was fetched.
    expect(calls.ohlcv).toBe(0);
    expect(snapshot.sources).toContain('geckoterminal');
    expect(snapshot.sources).not.toContain('geckoterminal-ohlcv');
    expect(snapshot.providerErrors).not.toHaveProperty('ohlcv');
  });

  it('does not fill liquidity from a zero reserve (0 is not a usable measurement)', async () => {
    const { service } = await buildService({
      quote: {
        priceUsd: LIVE_PRICE,
        priceChange24h: null,
        totalSupply: SUPPLY,
      },
      pools: poolFixture({ reserve: '0' }),
    });

    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });

    expect(snapshot.liquidityUsd).toBeNull();
    expect(snapshot.volume24hUsd).toBe(0);
    expect(snapshot.priceChange24h).toBe(0);
  });

  it('still derives the change when the pick carries none, and appends both provenances', async () => {
    const nowMs = Date.now();
    const calls: Calls = { pools: 0, ohlcv: 0, day: 0 };
    const { service } = await buildService({
      quote: {
        priceUsd: LIVE_PRICE,
        priceChange24h: null,
        totalSupply: SUPPLY,
      },
      pools: poolFixture({ change: null, volume: '12.5' }),
      ohlcv: solanaCandles(nowMs),
      calls,
    });

    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });

    expect(snapshot.liquidityUsd).toBe(2365.4217);
    expect(snapshot.volume24hUsd).toBe(12.5);
    expect(calls.ohlcv).toBe(1);
    expect(snapshot.sources).toContain('geckoterminal');
    expect(snapshot.sources).toContain('geckoterminal-ohlcv');
    // Every source is listed ONCE even when the fill and the hour leg
    // both claim geckoterminal.
    expect(
      snapshot.sources.filter((source) => source === 'geckoterminal'),
    ).toHaveLength(1);
  });

  it('serves the 1h bucket harvested from the SAME pool pick, one geckoterminal source, zero extra calls', async () => {
    const calls: Calls = { pools: 0, ohlcv: 0, day: 0 };
    const { service } = await buildService({
      quote: {
        priceUsd: LIVE_PRICE,
        priceChange24h: null,
        totalSupply: SUPPLY,
      },
      pools: poolFixture({
        volume1h: '12.5',
        change1h: '3.25',
        txns1h: { buys: 7, sells: 3 },
      }),
      calls,
    });

    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });

    expect(snapshot.status).toBe('ready');
    expect(snapshot.volume1hUsd).toBe(12.5);
    expect(snapshot.priceChange1h).toBe(3.25);
    expect(snapshot.txns1hBuys).toBe(7);
    expect(snapshot.txns1hSells).toBe(3);
    // The 1h bucket rode the pool response the derivation already paid
    // for: no hourly call, no day-seed call, and the pool fetches stay
    // exactly the derivation + venue-leg pair (one each, unchanged).
    expect(calls.ohlcv).toBe(0);
    expect(calls.day).toBe(0);
    expect(calls.pools).toBe(2);
    expect(
      snapshot.sources.filter((source) => source === 'geckoterminal'),
    ).toHaveLength(1);
  });

  it('never harvests a pool when the merged quote already carries a native change', async () => {
    const calls: Calls = { pools: 0, ohlcv: 0, day: 0 };
    const { service } = await buildService({
      quote: {
        priceUsd: LIVE_PRICE,
        priceChange24h: -7.5,
        totalSupply: SUPPLY,
      },
      pools: poolFixture({}),
      calls,
    });

    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });

    expect(snapshot.priceChange24h).toBe(-7.5);
    expect(snapshot.liquidityUsd).toBeNull();
    expect(calls.ohlcv).toBe(0);
    expect(snapshot.sources).not.toContain('geckoterminal');
  });
});

describe('GeckoTerminal launchpad hint (plan todo 72)', () => {
  it('applies an allowlisted pump-fun hint on a solana token when the detector is null', async () => {
    const { service } = await buildService({
      chain: 'solana',
      quote: {
        priceUsd: LIVE_PRICE,
        priceChange24h: 1,
        totalSupply: SUPPLY,
        geckoLaunchpadHint: 'pump-fun',
      },
    });

    const snapshot = await service.getSnapshot({
      chain: 'solana',
      value: SOL_MINT,
      kindHint: 'token',
    });

    expect(snapshot.launchpad?.id).toBe('pump-fun');
    expect(snapshot.launchpad?.url).toBe(`https://pump.fun/coin/${SOL_MINT}`);
  });

  it('never overrides a detector positive', async () => {
    const detected = launchpadInfo('raydium-launchlab', 'solana', SOL_MINT);
    const { service } = await buildService({
      chain: 'solana',
      quote: {
        priceUsd: LIVE_PRICE,
        priceChange24h: 1,
        totalSupply: SUPPLY,
        geckoLaunchpadHint: 'pump-fun',
      },
      detector: detected,
    });

    const snapshot = await service.getSnapshot({
      chain: 'solana',
      value: SOL_MINT,
      kindHint: 'token',
    });

    expect(snapshot.launchpad?.id).toBe('raydium-launchlab');
  });

  it('ignores a hint outside the allowlist', async () => {
    const { service } = await buildService({
      chain: 'solana',
      quote: {
        priceUsd: LIVE_PRICE,
        priceChange24h: 1,
        totalSupply: SUPPLY,
        geckoLaunchpadHint: 'some-other-launchpad',
      },
    });

    const snapshot = await service.getSnapshot({
      chain: 'solana',
      value: SOL_MINT,
      kindHint: 'token',
    });

    expect(snapshot.launchpad).toBeNull();
  });

  it('applies the hint on solana only', async () => {
    const { service } = await buildService({
      chain: 'robinhood',
      quote: {
        priceUsd: LIVE_PRICE,
        priceChange24h: 1,
        totalSupply: SUPPLY,
        geckoLaunchpadHint: 'pump-fun',
      },
    });

    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });

    expect(snapshot.launchpad).toBeNull();
  });

  it('applies the hint to token kinds only', async () => {
    const { service } = await buildService({
      chain: 'solana',
      quote: {
        priceUsd: LIVE_PRICE,
        priceChange24h: 1,
        totalSupply: SUPPLY,
        geckoLaunchpadHint: 'pump-fun',
      },
    });

    const snapshot = await service.getSnapshot({
      chain: 'solana',
      value: SOL_MINT,
      kindHint: 'wallet',
    });

    expect(snapshot.launchpad).toBeNull();
  });
});

describe('ATH-seed 429 backoff (plan todo 72, P1)', () => {
  const seedArgs = {
    key: 'solana:seed-mint',
    chain: 'solana',
    address: 'seed-mint',
    kind: 'token',
    totalSupply: SUPPLY,
    maxSupply: null,
    pairAddress: 'pool-address',
    pairSide: 'base' as const,
  };

  function seedFn(
    service: AddressSnapshotService,
  ): (args: typeof seedArgs) => Promise<number> {
    return (
      service as unknown as {
        seedFdvAthHistory(args: typeof seedArgs): Promise<number>;
      }
    ).seedFdvAthHistory.bind(service);
  }

  it('pauses the token for 60s after a 429 and resumes after the pause', async () => {
    const calls: Calls = { pools: 0, ohlcv: 0, day: 0 };
    const { service } = await buildService({
      chain: 'solana',
      calls,
      dayOhlcv: async () => {
        throw new RetryableProviderError(
          'geckoterminal',
          'rate-limited',
          0,
          429,
        );
      },
    });
    const seed = seedFn(service);
    const nowSpy = jest.spyOn(Date, 'now');

    nowSpy.mockReturnValue(1_700_000_000_000);
    await expect(seed(seedArgs)).resolves.toBe(0);
    expect(calls.day).toBe(1);

    // 31s later: still inside the 60s throttle pause — no new network.
    nowSpy.mockReturnValue(1_700_000_031_000);
    await expect(seed(seedArgs)).resolves.toBe(0);
    expect(calls.day).toBe(1);

    // Past the pause: the seed is retried (the memo never claims absence).
    nowSpy.mockReturnValue(1_700_000_061_000);
    await expect(seed(seedArgs)).resolves.toBe(0);
    expect(calls.day).toBe(2);

    nowSpy.mockRestore();
  });

  it('does not memoize non-429 transients (timeouts/5xx retry next request)', async () => {
    const calls: Calls = { pools: 0, ohlcv: 0, day: 0 };
    const { service } = await buildService({
      chain: 'solana',
      calls,
      dayOhlcv: async () => {
        throw new RetryableProviderError('geckoterminal', 'server', 0, 503);
      },
    });
    const seed = seedFn(service);
    const nowSpy = jest.spyOn(Date, 'now');

    nowSpy.mockReturnValue(1_700_000_000_000);
    await expect(seed(seedArgs)).resolves.toBe(0);
    nowSpy.mockReturnValue(1_700_000_001_000);
    await expect(seed(seedArgs)).resolves.toBe(0);

    expect(calls.day).toBe(2);
    nowSpy.mockRestore();
  });
});
