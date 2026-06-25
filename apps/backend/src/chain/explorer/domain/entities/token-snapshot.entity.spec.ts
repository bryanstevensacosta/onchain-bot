import { TokenSnapshot } from '../entities/token-snapshot.entity';
import { Pair } from '../value-objects/pair.vo';
import { ChainId } from 'chain/identity/chain-id.vo';

const EVM = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

function buildSnapshot(
  overrides: {
    chain?: ChainId;
    pairs?: Pair[];
    priceUsd?: number | null;
    liquidityUsd?: number | null;
    volume24hUsd?: number | null;
    marketCapUsd?: number | null;
    fdvUsd?: number | null;
    priceChange24h?: number | null;
    holders?: number | null;
    top10HolderPercent?: number | null;
    name?: string | null;
    imageUrls?: ReadonlyArray<string>;
    lockedLiquidityPercent?: number | null;
    burnedPercent?: number | null;
    sources?: string[];
  } = {},
): TokenSnapshot {
  return TokenSnapshot.create({
    chain: overrides.chain ?? ChainId.ETHEREUM,
    address: EVM,
    pairs: overrides.pairs ?? [],
    priceUsd: overrides.priceUsd ?? null,
    liquidityUsd: overrides.liquidityUsd ?? null,
    volume24hUsd: overrides.volume24hUsd ?? null,
    marketCapUsd: overrides.marketCapUsd ?? null,
    fdvUsd: overrides.fdvUsd ?? null,
    priceChange24h: overrides.priceChange24h ?? null,
    holders: overrides.holders ?? null,
    top10HolderPercent: overrides.top10HolderPercent ?? null,
    name: overrides.name ?? null,
    imageUrls: overrides.imageUrls ?? [],
    lockedLiquidityPercent: overrides.lockedLiquidityPercent ?? null,
    burnedPercent: overrides.burnedPercent ?? null,
    sources: overrides.sources ?? ['dexscreener'],
  });
}

describe('TokenSnapshot', () => {
  describe('create', () => {
    it('builds with id=chain:address (lowercased)', () => {
      const s = buildSnapshot();
      expect(s.id).toBe(`ethereum:${EVM}`);
      expect(s.address).toBe(EVM);
    });

    it('initializes enrichedAt to current time', () => {
      const before = Date.now();
      const s = buildSnapshot();
      const after = Date.now();
      expect(s.enrichedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(s.enrichedAt.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('primaryPair', () => {
    it('null when no pairs', () => {
      expect(buildSnapshot().primaryPair).toBeNull();
    });

    it('picks the pair with highest reserveUsd', () => {
      const pairs = [
        Pair.create({
          address: 'a',
          dexId: 'uniswap',
          quoteToken: 'USDC',
          reserveUsd: 1_000,
        }),
        Pair.create({
          address: 'b',
          dexId: 'uniswap',
          quoteToken: 'USDC',
          reserveUsd: 50_000,
        }),
        Pair.create({
          address: 'c',
          dexId: 'uniswap',
          quoteToken: 'USDC',
          reserveUsd: 5_000,
        }),
      ];
      expect(buildSnapshot({ pairs }).primaryPair?.address).toBe('b');
    });
  });

  describe('completenessScore', () => {
    it('0 when all null', () => {
      expect(buildSnapshot().completenessScore()).toBe(0);
    });

    it('1 when all fields set', () => {
      const s = buildSnapshot({
        priceUsd: 0.0001,
        liquidityUsd: 50_000,
        volume24hUsd: 10_000,
        marketCapUsd: 100_000,
        fdvUsd: 1_000_000,
        priceChange24h: 5,
        holders: 1000,
        top10HolderPercent: 20,
      });
      expect(s.completenessScore()).toBe(1);
    });

    it('proportional when partial', () => {
      const s = buildSnapshot({ priceUsd: 0.0001, holders: 1000 });
      expect(s.completenessScore()).toBe(0.25); // 2 of 8
    });
  });

  describe('hasMarketData', () => {
    it('false when empty', () => {
      expect(buildSnapshot().hasMarketData()).toBe(false);
    });

    it('true when price set', () => {
      expect(buildSnapshot({ priceUsd: 0.0001 }).hasMarketData()).toBe(true);
    });

    it('true when pairs present', () => {
      const pairs = [
        Pair.create({
          address: 'a',
          dexId: 'uniswap',
          quoteToken: 'USDC',
          reserveUsd: 1000,
        }),
      ];
      expect(buildSnapshot({ pairs }).hasMarketData()).toBe(true);
    });
  });

  describe('isFresh', () => {
    it('true within maxAgeMs', () => {
      const s = buildSnapshot();
      expect(s.isFresh(60_000)).toBe(true);
    });

    it('false beyond maxAgeMs', async () => {
      const s = buildSnapshot();
      await new Promise((r) => setTimeout(r, 10));
      expect(s.isFresh(5)).toBe(false);
    });
  });

  describe('emitEnriched', () => {
    it('emits a TokenEnrichedEvent', () => {
      const s = buildSnapshot({ priceUsd: 0.0001, liquidityUsd: 50_000 });
      s.emitEnriched();
      const events = s.commit();
      expect(events).toHaveLength(1);
      expect(events[0].eventName).toBe('enrichment.token.enriched');
      const payload = events[0].toPayload() as {
        chain: string;
        priceUsd: number;
      };
      expect(payload.chain).toBe('ethereum');
      expect(payload.priceUsd).toBe(0.0001);
    });
  });
});
