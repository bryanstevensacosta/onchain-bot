import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { selectBestPairSummaryForSlug } from 'provider/infrastructure/dexscreener/dexscreener.service';
import type {
  DexScreenerPair,
  DexScreenerPairSummary,
} from 'provider/infrastructure/dexscreener/dexscreener.types';
import { DiscoveryCacheRepository } from '../infrastructure/discovery-cache.repository';
import { DiscoveryCacheService } from './discovery-cache.service';

const MINT = 'Mint1111111111111111111111111111111111111111';
const CURVE_PDA = 'CurvePDA111111111111111111111111111111111111';
const POOL_AMM = 'PoolAMM11111111111111111111111111111111111111';

function tripwirePair(overrides: Partial<DexScreenerPair>): DexScreenerPair {
  return {
    chainId: 'solana',
    dexId: 'pumpfun',
    url: 'https://dexscreener.com/solana/pair',
    pairAddress: CURVE_PDA,
    labels: [],
    baseToken: { address: MINT, name: 'PUMP', symbol: 'PUMP' },
    quoteToken: { address: null, name: null, symbol: null },
    priceNative: '0.0001',
    priceUsd: '0.012',
    txns: { h24: { buys: 10, sells: 5 } },
    volume: { h24: 1000 },
    priceChange: { h24: 2.5 },
    liquidity: { usd: 50000, base: 1, quote: 1 },
    fdv: 120000,
    marketCap: 110000,
    pairCreatedAt: null,
    ...overrides,
  };
}

function discoveredSummary(
  overrides: Partial<DexScreenerPairSummary> = {},
): DexScreenerPairSummary {
  return {
    pairAddress: CURVE_PDA,
    dexId: 'pumpfun',
    labels: [],
    baseToken: { address: MINT, name: 'PUMP', symbol: 'PUMP' },
    quoteToken: { address: null, name: null, symbol: null },
    priceUsd: '0.012',
    priceNative: '0.0001',
    liquidityUsd: 50000,
    volume24h: 1000,
    fdv: 120000,
    marketCap: 110000,
    priceChange24h: 2.5,
    txns24h: { buys: 10, sells: 5 },
    pairCreatedAt: null,
    volume1hUsd: null,
    priceChange1h: null,
    txns1h: null,
    ...overrides,
  };
}

function harness() {
  const dexscreener = {
    getPairByAddress: jest.fn(),
    getPairsByChain: jest.fn(),
    getBestPairSummaryForChain: jest.fn(),
  } as unknown as DexScreenerService & {
    getPairByAddress: jest.Mock;
    getPairsByChain: jest.Mock;
    getBestPairSummaryForChain: jest.Mock;
  };
  const cache = new DiscoveryCacheRepository();
  const service = new DiscoveryCacheService(cache, dexscreener);
  return { dexscreener, cache, service };
}

/**
 * Discovery cache service (dexter plan todo 30b).
 *
 * 2nd-scan proof: with a warm row the service verifies liveness with
 * exactly ONE `getPairByAddress` tripwire call and ZERO
 * `token-pairs` discovery calls (`getPairsByChain` /
 * `getBestPairSummaryForChain`).
 */
describe('DiscoveryCacheService', () => {
  it('empty-miss discovers once and pins (no tripwire on a miss)', async () => {
    const { dexscreener, cache, service } = harness();
    dexscreener.getBestPairSummaryForChain.mockResolvedValue(
      discoveredSummary(),
    );
    const out = await service.resolveDiscovery('solana', MINT);
    expect(out).toMatchObject({ pairAddress: CURVE_PDA, dexId: 'pumpfun' });
    expect(dexscreener.getBestPairSummaryForChain).toHaveBeenCalledTimes(1);
    expect(dexscreener.getPairByAddress).not.toHaveBeenCalled();
    const row = await cache.find('solana', MINT);
    expect(row).toMatchObject({ pairAddress: CURVE_PDA, dexId: 'pumpfun' });
  });

  it('2nd scan: tripwire exactly once + ZERO token-pairs calls', async () => {
    const { dexscreener, service } = harness();
    dexscreener.getBestPairSummaryForChain.mockResolvedValue(
      discoveredSummary(),
    );
    await service.resolveDiscovery('solana', MINT);
    dexscreener.getBestPairSummaryForChain.mockClear();
    dexscreener.getPairsByChain.mockClear();
    // Tripwire answers the live pair (same dexId, fresher numbers,
    // pair creation ms — todo 63 parity with the discovery mapper).
    dexscreener.getPairByAddress.mockResolvedValue(
      tripwirePair({
        priceUsd: '0.014',
        dexId: 'pumpfun',
        pairCreatedAt: 1791892874000,
      }),
    );
    const out = await service.resolveDiscovery('solana', MINT);
    expect(dexscreener.getPairByAddress).toHaveBeenCalledTimes(1);
    expect(dexscreener.getPairByAddress).toHaveBeenCalledWith(
      'solana',
      CURVE_PDA,
    );
    expect(dexscreener.getPairsByChain).not.toHaveBeenCalled();
    expect(dexscreener.getBestPairSummaryForChain).not.toHaveBeenCalled();
    // Numbers ride the live tripwire pair, never the stale pin.
    expect(out?.priceUsd).toBe('0.014');
    // Raw ms rides the tripwire mapper too (todo 63 byte-parity).
    expect(out?.pairCreatedAt).toBe(1791892874000);
    expect(out).toMatchObject({ pairAddress: CURVE_PDA, dexId: 'pumpfun' });
  });

  it('tripwire mismatch (graduation) drops the row, re-discovers, re-pins', async () => {
    const { dexscreener, cache, service } = harness();
    dexscreener.getBestPairSummaryForChain.mockResolvedValue(
      discoveredSummary(),
    );
    await service.resolveDiscovery('solana', MINT);
    // The pool graduates: same mint now lives on a Raydium AMM.
    dexscreener.getPairByAddress.mockResolvedValue(
      tripwirePair({ pairAddress: CURVE_PDA, dexId: 'raydium' }),
    );
    dexscreener.getBestPairSummaryForChain.mockResolvedValue(
      discoveredSummary({ pairAddress: POOL_AMM, dexId: 'raydium' }),
    );
    const out = await service.resolveDiscovery('solana', MINT);
    expect(dexscreener.getPairByAddress).toHaveBeenCalledTimes(1);
    expect(dexscreener.getBestPairSummaryForChain).toHaveBeenCalledTimes(2);
    expect(out).toMatchObject({ pairAddress: POOL_AMM, dexId: 'raydium' });
    const row = await cache.find('solana', MINT);
    expect(row).toMatchObject({ pairAddress: POOL_AMM, dexId: 'raydium' });
  });

  it('null tripwire (dead pair or transient error) re-discovers fail-open', async () => {
    const { dexscreener, service } = harness();
    dexscreener.getBestPairSummaryForChain.mockResolvedValue(
      discoveredSummary(),
    );
    await service.resolveDiscovery('solana', MINT);
    dexscreener.getPairByAddress.mockResolvedValue(null);
    dexscreener.getBestPairSummaryForChain.mockResolvedValue(
      discoveredSummary({ pairAddress: POOL_AMM, dexId: 'raydium' }),
    );
    const out = await service.resolveDiscovery('solana', MINT);
    expect(out).toMatchObject({ pairAddress: POOL_AMM, dexId: 'raydium' });
  });

  it('null discovery is never pinned (honest empty re-probes next scan)', async () => {
    const { dexscreener, cache, service } = harness();
    dexscreener.getBestPairSummaryForChain.mockResolvedValue(null);
    await expect(service.resolveDiscovery('base', MINT)).resolves.toBeNull();
    await expect(cache.find('base', MINT)).resolves.toBeNull();
    expect(dexscreener.getPairByAddress).not.toHaveBeenCalled();
  });

  it('unmapped chain answers null with zero network (never cross-chain)', async () => {
    const { dexscreener, service } = harness();
    await expect(
      service.resolveDiscovery('optimism', MINT),
    ).resolves.toBeNull();
    expect(dexscreener.getPairByAddress).not.toHaveBeenCalled();
    expect(dexscreener.getPairsByChain).not.toHaveBeenCalled();
    expect(dexscreener.getBestPairSummaryForChain).not.toHaveBeenCalled();
  });

  it('migration-invalidation (pump curve -> pool fixture): invalidate seam + next scan re-pins the pool', async () => {
    const { dexscreener, cache, service } = harness();
    // Pre-graduation pin: the curve PDA under the pumpfun dexId.
    await cache.save('solana', MINT, CURVE_PDA, 'pumpfun');
    // (ii) reader reports migrated=true -> the resolveDiscovery ->
    // cache delete(chain,mint) seam (this exact method is what the
    // Solana fast path calls on a migrated pool view).
    await service.invalidateDiscovery('solana', MINT);
    await expect(cache.find('solana', MINT)).resolves.toBeNull();
    // Next scan re-discovers the AMM pool and re-pins (promote-once).
    dexscreener.getBestPairSummaryForChain.mockResolvedValue(
      discoveredSummary({ pairAddress: POOL_AMM, dexId: 'raydium' }),
    );
    const out = await service.resolveDiscovery('solana', MINT);
    expect(out).toMatchObject({ pairAddress: POOL_AMM, dexId: 'raydium' });
    const row = await cache.find('solana', MINT);
    expect(row).toMatchObject({ pairAddress: POOL_AMM, dexId: 'raydium' });
  });

  it('partial DexScreenerService surface (no tripwire method) re-discovers fail-open (legacy hand-mocks stay green)', async () => {
    const cache = new DiscoveryCacheRepository();
    await cache.save('solana', MINT, CURVE_PDA, 'pumpfun');
    const partial = {
      getBestPairSummaryForChain: jest
        .fn()
        .mockResolvedValue(discoveredSummary()),
    } as unknown as DexScreenerService;
    const service = new DiscoveryCacheService(cache, partial);
    const out = await service.resolveDiscovery('solana', MINT);
    expect(out).toMatchObject({ pairAddress: CURVE_PDA, dexId: 'pumpfun' });
    expect(partial.getBestPairSummaryForChain).toHaveBeenCalledTimes(1);
  });

  it('separation: cached dexId never flows into launchpad.id (origin vocabulary untouched)', async () => {
    const { dexscreener, cache, service } = harness();
    dexscreener.getBestPairSummaryForChain.mockResolvedValue(
      discoveredSummary({ dexId: 'meteoradbc' }),
    );
    const out = await service.resolveDiscovery('solana', MINT);
    // The summary carries venue vocabulary only — no launchpad shape
    // (`{id, name, url}`) exists anywhere on it.
    expect(out).toMatchObject({ dexId: 'meteoradbc' });
    expect(out as unknown as { id?: unknown }).not.toHaveProperty('id');
    expect(out as unknown as { url?: unknown }).not.toHaveProperty('url');
    // The row itself is discovery-only keys (never id/name/url).
    const row = await cache.find('solana', MINT);
    expect(Object.keys(row ?? {}).sort()).toEqual(
      ['chain', 'dexId', 'mint', 'pairAddress', 'updatedAt'].sort(),
    );
    // Feeding the cached dexId as a launchpad id would conflate
    // vocabularies (`meteoradbc` venue vs `meteora-dbc` origin) —
    // the service exposes no such mapping (compile-level: no method
    // returns LaunchpadInfo; runtime: asserted above).
    expect(row?.dexId).toBe('meteoradbc');
  });
});

/**
 * 5-minute bucket (dexter `5M` row, `rick-compact-card` §10.16) —
 * tripwire mapper parity.
 *
 * The 30-day cache hit is the NORMAL path, so `toSummaryFromTripwire`
 * must emit the same four flat fields as the provider mapper
 * (`toPairSummary` in `dexscreener.service.ts`) on the same pair
 * fixture — the same byte-parity claim already pinned for the 1h
 * bucket. Real `0` survives; absent/non-finite → `null`; a partial
 * `txns.m5` nulls BOTH sides (never `{buys:0,sells:0}`).
 */
describe('DiscoveryCacheService — 5m bucket tripwire parity', () => {
  async function bothMappers(
    p: DexScreenerPair,
  ): Promise<[DexScreenerPairSummary, DexScreenerPairSummary]> {
    const cache = new DiscoveryCacheRepository();
    await cache.save('solana', MINT, p.pairAddress, p.dexId);
    const dexscreener = {
      getPairByAddress: jest.fn().mockResolvedValue(p),
      getPairsByChain: jest.fn(),
      getBestPairSummaryForChain: jest.fn(),
    } as unknown as DexScreenerService;
    const tripwire = await new DiscoveryCacheService(
      cache,
      dexscreener,
    ).resolveDiscovery('solana', MINT);
    const provider = selectBestPairSummaryForSlug([p], 'solana');
    if (tripwire === null || provider === null) {
      throw new Error('mapper returned null');
    }
    return [tripwire, provider];
  }

  it('carries volume.m5 / priceChange.m5 / txns.m5 verbatim (real 0 survives)', async () => {
    const [tripwire, provider] = await bothMappers(
      tripwirePair({
        dexId: 'pumpfun',
        volume: { h24: 1000, m5: 0 },
        priceChange: { h24: 2.5, m5: -1.25 },
        txns: { h24: { buys: 10, sells: 5 }, m5: { buys: 1, sells: 3 } },
      }),
    );
    expect(tripwire.volume5mUsd).toBe(0);
    expect(tripwire.priceChange5m).toBe(-1.25);
    expect(tripwire.txns5mBuys).toBe(1);
    expect(tripwire.txns5mSells).toBe(3);
    // Byte-parity with the provider mapper on the same fixture.
    expect(tripwire.volume5mUsd).toBe(provider.volume5mUsd);
    expect(tripwire.priceChange5m).toBe(provider.priceChange5m);
    expect(tripwire.txns5mBuys).toBe(provider.txns5mBuys);
    expect(tripwire.txns5mSells).toBe(provider.txns5mSells);
  });

  it('nulls every 5m field when the buckets are absent (provider parity)', async () => {
    const [tripwire, provider] = await bothMappers(
      tripwirePair({
        txns: { h24: { buys: 10, sells: 5 } },
        volume: { h24: 1000 },
        priceChange: { h24: 2.5 },
      }),
    );
    expect(tripwire.volume5mUsd).toBeNull();
    expect(tripwire.priceChange5m).toBeNull();
    expect(tripwire.txns5mBuys).toBeNull();
    expect(tripwire.txns5mSells).toBeNull();
    expect(provider.volume5mUsd).toBeNull();
    expect(provider.priceChange5m).toBeNull();
    expect(provider.txns5mBuys).toBeNull();
    expect(provider.txns5mSells).toBeNull();
  });

  it('nulls non-finite m5 values (provider parity, never 0)', async () => {
    const [tripwire, provider] = await bothMappers(
      tripwirePair({
        volume: { h24: 1000, m5: Number.NaN },
        priceChange: { h24: 2.5, m5: Number.POSITIVE_INFINITY },
        txns: { m5: { buys: 1, sells: 3 } },
      }),
    );
    expect(tripwire.volume5mUsd).toBeNull();
    expect(tripwire.priceChange5m).toBeNull();
    expect(provider.volume5mUsd).toBeNull();
    expect(provider.priceChange5m).toBeNull();
    // txns.m5 itself was finite — only the numeric buckets null.
    expect(tripwire.txns5mBuys).toBe(1);
    expect(tripwire.txns5mSells).toBe(3);
  });

  it('nulls BOTH txns sides when the m5 pair is partial (provider parity)', async () => {
    const [tripwire, provider] = await bothMappers(
      tripwirePair({
        txns: {
          h24: { buys: 10, sells: 5 },
          m5: { buys: 1 } as unknown as { buys: number; sells: number },
        },
      }),
    );
    expect(tripwire.txns5mBuys).toBeNull();
    expect(tripwire.txns5mSells).toBeNull();
    expect(provider.txns5mBuys).toBeNull();
    expect(provider.txns5mSells).toBeNull();
  });
});
