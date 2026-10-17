import { SnapshotAggregatorService } from 'aggregators/application/snapshot-aggregator.service';
import { EVM_CHAIN_TRANSPORTS } from 'provider/infrastructure/alchemy/alchemy.chains';
import type { MulticallResult } from 'provider/infrastructure/alchemy/multicall.service';
import {
  EVM_ONCHAIN_SUPPLY_CHAINS,
  QUOTE_FETCHER_COST_TIER,
  buildProviderQuoteFetchers,
} from './provider-quote.fetchers';
import {
  applyComputedFdv,
  computedFdvEpsilonBound,
} from 'snapshot/domain/snapshot-computed-fdv';

/**
 * EVM on-chain supply leg (dexter plan todo 54, research 52 verdict
 * "SHIP (a)"): `totalSupply()` (`0x18160ddd`) + `decimals()`
 * (`0x313ce567`) in ONE Multicall3 `tryAggregate` across the 8
 * multicall-verified chains; `ui = uint256_raw / 10^decimals` with
 * BigInt-mandatory normalization (`decimals > 255 | null` -> `null`).
 *
 * WENCAT fixture is the todo-52 live capture (notepad
 * `.omo/notepads/dexter-supply-legs.md`): raw word tail
 * `033b2e3c9fd0803ce8000000` = 10^27; decimals `0x12` = 18 ->
 * supply = 1,000,000,000, corroborated by DexScreener fdv 14029 /
 * price 0.00001402 (~1.0006e9). Specs are fixture-pinned (no network);
 * the live tryAggregate proof lives in the notepad + evidence log.
 */
const WENCAT = '0xB596fc1980BA251B25B1D4BED33CB0B91bc17777';
const WENCAT_RAW_SUPPLY = 10n ** 27n;
const WENCAT_TOTAL_SUPPLY_WORD = `0x${WENCAT_RAW_SUPPLY.toString(16).padStart(
  64,
  '0',
)}`;
const WENCAT_DECIMALS_WORD = `0x${18n.toString(16).padStart(64, '0')}`;
const WENCAT_SUPPLY_UI = 1_000_000_000;

const word = (value: bigint): string =>
  `0x${value.toString(16).padStart(64, '0')}`;

function stubDeps(overrides: Record<string, unknown> = {}): never {
  return {
    dexscreener: { getBestPairSummaryForChain: async () => null },
    geckoterminal: { getTokenInfo: async () => null },
    birdeye: { getTokenOverview: async () => null },
    coingecko: { getTokenContractInfo: async () => null },
    mobula: { getTokenMarkets: async () => null },
    moralis: {
      getTokenAnalytics: async () => null,
      getTokenHolders: async () => null,
    },
    rugcheck: { getSummary: async () => null },
    solanaRpc: {
      getTokenSupply: async () => null,
      getTokenLargestAccounts: async () => null,
    },
    ccxt: {
      defaultExchange: 'binance',
      fetchTicker: async () => null,
    },
    ...overrides,
  } as unknown as never;
}

function multicallStub(results: ReadonlyArray<MulticallResult>) {
  const tryAggregate = jest.fn(async () => results);
  return { multicall: { tryAggregate }, tryAggregate };
}

function evmRpc(deps: never) {
  return buildProviderQuoteFetchers(deps).find(
    (fetcher) => fetcher.name === 'evm-rpc',
  )!;
}

describe('evm-rpc supply leg (todo 54: eth_call totalSupply + decimals)', () => {
  it('pins coverage to the multicall-verified transport rows (table-equal, 8 chains)', () => {
    const verified = Object.entries(EVM_CHAIN_TRANSPORTS)
      .filter(([, transport]) => transport.multicall3 !== null)
      .map(([chain]) => chain)
      .sort();
    expect([...EVM_ONCHAIN_SUPPLY_CHAINS].sort()).toEqual(verified);
    expect(EVM_ONCHAIN_SUPPLY_CHAINS).toEqual([
      'ethereum',
      'base',
      'bsc',
      'arbitrum',
      'polygon',
      'optimism',
      'unichain',
      'robinhood',
    ]);
    expect(evmRpc(stubDeps()).supportsChains).toEqual(
      EVM_ONCHAIN_SUPPLY_CHAINS,
    );
    expect(QUOTE_FETCHER_COST_TIER['evm-rpc']).toBe('free');
  });

  it('WENCAT: raw 1e27 / 10^18 = 1,000,000,000 exactly (one 2-call batch, selectors pinned)', async () => {
    const { multicall, tryAggregate } = multicallStub([
      { ok: true, value: WENCAT_TOTAL_SUPPLY_WORD },
      { ok: true, value: WENCAT_DECIMALS_WORD },
    ]);
    const quote = await evmRpc(stubDeps({ multicall })).fetch('bsc', WENCAT);
    expect(quote?.totalSupply).toBe(WENCAT_SUPPLY_UI);
    // Captured-bytes pin: the todo-52 live raw word tail (1e27).
    expect(WENCAT_TOTAL_SUPPLY_WORD.endsWith('033b2e3c9fd0803ce8000000')).toBe(
      true,
    );
    expect(tryAggregate).toHaveBeenCalledTimes(1);
    expect(tryAggregate).toHaveBeenCalledWith('bsc', [
      { target: WENCAT, callData: '0x18160ddd' },
      { target: WENCAT, callData: '0x313ce567' },
    ]);
  });

  it.each<[string, string, string, number]>([
    ['decimals = 0 -> raw verbatim', word(1500000n), word(0n), 1500000],
    ['decimals = 6 -> /10^6', word(1500000n), word(6n), 1.5],
    [
      'decimals = 18 -> WENCAT 1B',
      WENCAT_TOTAL_SUPPLY_WORD,
      WENCAT_DECIMALS_WORD,
      1_000_000_000,
    ],
    ['decimals = 255 -> last valid uint8', word(1n), word(255n), 1e-255],
  ])(
    'decimals edge: %s',
    async (_label, supplyWord, decimalsWord, expected) => {
      const { multicall } = multicallStub([
        { ok: true, value: supplyWord },
        { ok: true, value: decimalsWord },
      ]);
      const quote = await evmRpc(stubDeps({ multicall })).fetch('bsc', WENCAT);
      expect(quote?.totalSupply).toBe(expected);
    },
  );

  it.each<[string, string | null, string | null]>([
    [
      'decimals word 256 (> uint8) -> null (cannot normalize)',
      WENCAT_TOTAL_SUPPLY_WORD,
      word(256n),
    ],
    ['decimals reverted (ok:false) -> null', WENCAT_TOTAL_SUPPLY_WORD, null],
    ['supply reverted (ok:false) -> null', null, WENCAT_DECIMALS_WORD],
    [
      'supply success with EMPTY return data -> null',
      '0x',
      WENCAT_DECIMALS_WORD,
    ],
    ['supply short/malformed word -> null', '0x1234', WENCAT_DECIMALS_WORD],
  ])('null edge: %s', async (_label, supplyWord, decimalsWord) => {
    const { multicall } = multicallStub([
      supplyWord === null
        ? { ok: false, value: null }
        : { ok: true, value: supplyWord },
      decimalsWord === null
        ? { ok: false, value: null }
        : { ok: true, value: decimalsWord },
    ]);
    const quote = await evmRpc(stubDeps({ multicall })).fetch('bsc', WENCAT);
    expect(quote).toBeNull();
  });

  it('proxy-safe: reads what the proxy delegates return, with ZERO extra round trips', async () => {
    // EIP-1967-style proxy address that is NOT the implementation. The
    // leg assumes no code shape: totalSupply()/decimals() execute the
    // proxy's OWN code (delegatecall target for a proxy) and this stub
    // returns implementation values, so the read resolves untouched.
    // The stub exposes ONLY `tryAggregate` — any getCode/storage poke
    // would throw instead of silently passing.
    const PROXY = '0x1111111111111111111111111111111111111111';
    const { multicall, tryAggregate } = multicallStub([
      { ok: true, value: word(500_000_000n * 10n ** 18n) },
      { ok: true, value: word(18n) },
    ]);
    const quote = await evmRpc(stubDeps({ multicall })).fetch(
      'ethereum',
      PROXY,
    );
    expect(quote?.totalSupply).toBe(500_000_000);
    expect(tryAggregate).toHaveBeenCalledTimes(1);
  });

  it('unknown-chain / all-ok:false aggregate shape (ALL_FALSE) -> null, never throws', async () => {
    const { multicall } = multicallStub([
      { ok: false, value: null },
      { ok: false, value: null },
    ]);
    await expect(
      evmRpc(stubDeps({ multicall })).fetch('bsc', WENCAT),
    ).resolves.toBeNull();
  });

  it('absent multicall dep -> null without network (byte-identical for old callers)', async () => {
    await expect(evmRpc(stubDeps()).fetch('bsc', WENCAT)).resolves.toBeNull();
  });

  it('throw from the transport stays fail-open at the aggregator (errors recorded, rest merges)', async () => {
    const tryAggregate = jest.fn(async () => {
      throw new Error('aggregate exploded');
    });
    const fetchers = buildProviderQuoteFetchers(
      stubDeps({
        multicall: { tryAggregate },
        dexscreener: {
          getBestPairSummaryForChain: async () => ({
            priceUsd: 0.00001402,
            marketCap: null,
            fdv: 14029,
            liquidityUsd: null,
            volume24h: null,
            priceChange24h: null,
            baseToken: { address: WENCAT, symbol: 'WENCAT', name: 'WenCat' },
            quoteToken: { address: null, symbol: null, name: null },
          }),
        },
      }),
    );
    const outcome = await new SnapshotAggregatorService().aggregate(
      'bsc',
      WENCAT,
      fetchers,
    );
    expect(outcome.quote.totalSupply).toBeNull();
    expect(outcome.errors['evm-rpc']).toContain('aggregate exploded');
    expect(outcome.quote.priceUsd).toBe(0.00001402);
    expect(outcome.sources).toContain('dexscreener');
  });

  describe('FDV invariant (todo 38) intact: fdv = price x total, NEVER circ', () => {
    it('leg emits ONLY totalSupply — it cannot bypass the computed-FDV seam', async () => {
      const { multicall } = multicallStub([
        { ok: true, value: WENCAT_TOTAL_SUPPLY_WORD },
        { ok: true, value: WENCAT_DECIMALS_WORD },
      ]);
      const quote = await evmRpc(stubDeps({ multicall })).fetch('bsc', WENCAT);
      expect(quote).toEqual({ totalSupply: WENCAT_SUPPLY_UI });
      expect(quote?.fdvUsd).toBeUndefined();
      expect(quote?.circulatingSupply).toBeUndefined();
      expect(quote?.maxSupply).toBeUndefined();
    });

    it('seam recomputes WENCAT fdv from the on-chain total; circ feeds MC only', () => {
      const price = 0.00001402; // DexScreener capture (4dp rounded)
      const product = price * WENCAT_SUPPLY_UI;
      const patch = applyComputedFdv({
        priceUsd: price,
        marketCapUsd: null,
        fdvUsd: 14029, // provider-reported — discarded by design
        dexscreenerFdvUsd: 14029, // dedicated DSC leg — computed wins anyway (todo 61)
        totalSupply: WENCAT_SUPPLY_UI,
        circulatingSupply: 500_000_000,
        maxSupply: null,
      });
      expect(patch.reportedFdvUsd).toBe(14029);
      expect(patch.fdvUsd).toBe(product);
      expect(Math.abs((patch.fdvUsd ?? 0) - product)).toBeLessThanOrEqual(
        computedFdvEpsilonBound(product),
      );
      expect(patch.fdvUsd).not.toBe(14029);
      // circ NEVER feeds FDV: MC is recomputed from circ instead.
      expect(patch.marketCapRecomputed).toBe(true);
      expect(patch.marketCapUsd).toBe(price * 500_000_000);
      expect(patch.fdvProvenance).toBe('computed');
      // Sanity vs the captured DexScreener fdv (rounding, not a parity pin):
      expect(Math.abs((patch.fdvUsd ?? 0) - 14029) / 14029).toBeLessThan(0.001);
    });

    it('end-to-end merge: dexscreener price + evm-rpc supply seal to computed fdv', async () => {
      const { multicall } = multicallStub([
        { ok: true, value: WENCAT_TOTAL_SUPPLY_WORD },
        { ok: true, value: WENCAT_DECIMALS_WORD },
      ]);
      const fetchers = buildProviderQuoteFetchers(
        stubDeps({
          multicall,
          dexscreener: {
            getBestPairSummaryForChain: async () => ({
              priceUsd: 0.00001402,
              marketCap: null,
              fdv: 14029,
              liquidityUsd: null,
              volume24h: null,
              priceChange24h: null,
              baseToken: { address: WENCAT, symbol: 'WENCAT', name: 'WenCat' },
              quoteToken: { address: null, symbol: null, name: null },
            }),
          },
        }),
      );
      const outcome = await new SnapshotAggregatorService().aggregate(
        'bsc',
        WENCAT,
        fetchers,
      );
      expect(outcome.quote.totalSupply).toBe(WENCAT_SUPPLY_UI);
      expect(outcome.quote.circulatingSupply).toBeNull();
      expect(outcome.sources).toContain('evm-rpc');
      expect(outcome.sources).toContain('dexscreener');
      // Dedicated DSC-leg field rides the merge (todo 61) but computed
      // supply is present → the seam must not import it.
      expect(outcome.quote.dexscreenerFdvUsd).toBe(14029);
      const sealed = applyComputedFdv({
        priceUsd: outcome.quote.priceUsd,
        marketCapUsd: outcome.quote.marketCapUsd,
        fdvUsd: outcome.quote.fdvUsd,
        dexscreenerFdvUsd: outcome.quote.dexscreenerFdvUsd,
        totalSupply: outcome.quote.totalSupply,
        circulatingSupply: outcome.quote.circulatingSupply,
        maxSupply: outcome.quote.maxSupply,
      });
      expect(sealed.fdvUsd).toBe(0.00001402 * WENCAT_SUPPLY_UI);
      expect(sealed.fdvProvenance).toBe('computed');
      expect(sealed.marketCapRecomputed).toBe(false); // no circ -> merged MC kept
    });
  });
});
