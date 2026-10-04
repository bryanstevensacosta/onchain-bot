import { TokenScanPipeline } from './token-scan.pipeline';
import type { MarketDataSnapshot } from '@/scan/infrastructure/market-data/market-data.client';

const EVM = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

function snapshot(
  chain: string,
  overrides: Partial<MarketDataSnapshot> = {},
): MarketDataSnapshot {
  return {
    chain,
    address: EVM,
    symbol: 'TKN',
    name: 'Token',
    priceUsd: 1,
    priceChange24h: null,
    marketCapUsd: null,
    fdvUsd: null,
    liquidityUsd: null,
    lockedLiquidityPercent: null,
    burnedPercent: null,
    volume24hUsd: null,
    holders: null,
    top10HolderPercent: null,
    status: 'pending',
    ...overrides,
  } as MarketDataSnapshot;
}

function makeClient(snapshots: Record<string, MarketDataSnapshot | null>) {
  return {
    detectChain: async () => null,
    getSnapshot: async (chain: string) => snapshots[chain] ?? null,
  };
}

describe('TokenScanPipeline best-pick with disclosure (plan todo 17)', () => {
  it('picks highest liquidity and lists every other chain as alternatives in pick order', async () => {
    const pipeline = new TokenScanPipeline(
      makeClient({
        ethereum: snapshot('ethereum', { liquidityUsd: 100, fdvUsd: 1000 }),
        base: snapshot('base', { liquidityUsd: 9000, fdvUsd: 500 }),
        bsc: snapshot('bsc', { liquidityUsd: 5000, fdvUsd: 7000 }),
      }) as never,
    );
    const detailed = await pipeline.resolveDetailed(EVM);
    expect(detailed.status).toBe('resolved');
    if (detailed.status !== 'resolved') throw new Error('expected resolved');
    expect(detailed.token.chain).toBe('base');
    expect(detailed.token.alternatives).toEqual([
      { chain: 'bsc', address: EVM, liquidityUsd: 5000 },
      { chain: 'ethereum', address: EVM, liquidityUsd: 100 },
    ]);
  });

  it('tiebreaks equal liquidity by higher FDV', async () => {
    const pipeline = new TokenScanPipeline(
      makeClient({
        ethereum: snapshot('ethereum', { liquidityUsd: 1000, fdvUsd: 100 }),
        base: snapshot('base', { liquidityUsd: 1000, fdvUsd: 999 }),
      }) as never,
    );
    const detailed = await pipeline.resolveDetailed(EVM);
    expect(detailed.status).toBe('resolved');
    if (detailed.status !== 'resolved') throw new Error('expected resolved');
    expect(detailed.token.chain).toBe('base');
    expect(detailed.token.alternatives).toEqual([
      { chain: 'ethereum', address: EVM, liquidityUsd: 1000 },
    ]);
  });

  it('tiebreaks full ties deterministically by first-seen sweep order', async () => {
    const first = new TokenScanPipeline(
      makeClient({
        ethereum: snapshot('ethereum', { liquidityUsd: 1000, fdvUsd: 100 }),
        base: snapshot('base', { liquidityUsd: 1000, fdvUsd: 100 }),
      }) as never,
    );
    const second = new TokenScanPipeline(
      makeClient({
        ethereum: snapshot('ethereum', { liquidityUsd: 1000, fdvUsd: 100 }),
        base: snapshot('base', { liquidityUsd: 1000, fdvUsd: 100 }),
      }) as never,
    );
    const a = await first.resolveDetailed(EVM);
    const b = await second.resolveDetailed(EVM);
    expect(a).toEqual(b);
    if (a.status !== 'resolved') throw new Error('expected resolved');
    expect(a.token.chain).toBe('ethereum');
  });

  it('treats null liquidity as weakest (a measured pool always wins)', async () => {
    const pipeline = new TokenScanPipeline(
      makeClient({
        ethereum: snapshot('ethereum', { liquidityUsd: null }),
        base: snapshot('base', { liquidityUsd: 1 }),
      }) as never,
    );
    const detailed = await pipeline.resolveDetailed(EVM);
    expect(detailed.status).toBe('resolved');
    if (detailed.status !== 'resolved') throw new Error('expected resolved');
    expect(detailed.token.chain).toBe('base');
    expect(detailed.token.alternatives).toEqual([
      { chain: 'ethereum', address: EVM, liquidityUsd: null },
    ]);
  });

  it('never auto-picks without alternatives attached (single hit carries [])', async () => {
    const pipeline = new TokenScanPipeline(
      makeClient({
        ethereum: snapshot('ethereum', { liquidityUsd: 100 }),
      }) as never,
    );
    const detailed = await pipeline.resolveDetailed(EVM);
    expect(detailed.status).toBe('resolved');
    if (detailed.status !== 'resolved') throw new Error('expected resolved');
    expect(detailed.token.alternatives).toEqual([]);
  });

  it('zero resolvable candidates stays not-found (invalid untouched)', async () => {
    const empty = new TokenScanPipeline(makeClient({}) as never);
    await expect(empty.resolveDetailed(EVM)).resolves.toEqual({
      status: 'not-found',
      address: EVM,
    });
    const garbage = new TokenScanPipeline(makeClient({}) as never);
    const invalid = await garbage.resolveDetailed('hello');
    expect(invalid.status).toBe('invalid');
  });
});
