import { TokenScanPipeline } from './token-scan.pipeline';
import type { MarketDataSnapshot } from '@/scan/infrastructure/market-data/market-data.client';

const SOL = 'So11111111111111111111111111111111111111112';
const EVM = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

function shell(
  overrides: Partial<MarketDataSnapshot> = {},
): MarketDataSnapshot {
  return {
    chain: 'solana',
    address: SOL,
    symbol: null,
    name: null,
    priceUsd: null,
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

function identity(chain: string, address: string): MarketDataSnapshot {
  return shell({
    chain,
    address,
    symbol: 'TKN',
    name: 'Token',
    priceUsd: 1,
    status: 'ready',
  });
}

function makeClient(snapshots: Record<string, MarketDataSnapshot | null>) {
  return {
    detectChain: async () => null,
    getSnapshot: async (chain: string) => snapshots[chain] ?? null,
  };
}

/**
 * Pending-vs-not-found split (plan todo 19a): `MarketDataSnapshot.
 * status` is read at the `hasIdentity` sites — pending shells answer
 * `pending`, everything else keeps its frozen verdict. `resolve()`
 * still collapses pending to null (bot generic message stands).
 */
describe('TokenScanPipeline pending outcome (plan todo 19a)', () => {
  it('answers pending for an explicit chain whose snapshot is a pending shell', async () => {
    const pipeline = new TokenScanPipeline(
      makeClient({ solana: shell({ chain: 'solana', address: SOL }) }) as never,
    );
    await expect(pipeline.resolveDetailed(`solana:${SOL}`)).resolves.toEqual({
      status: 'pending',
      address: SOL,
    });
  });

  it('keeps not-found for an explicit chain when the client returns null (fetch/timeout)', async () => {
    const pipeline = new TokenScanPipeline(makeClient({}) as never);
    await expect(pipeline.resolveDetailed(`solana:${SOL}`)).resolves.toEqual({
      status: 'not-found',
      address: SOL,
    });
  });

  it('keeps not-found for a ready shell with no identity', async () => {
    const pipeline = new TokenScanPipeline(
      makeClient({
        solana: shell({ chain: 'solana', address: SOL, status: 'ready' }),
      }) as never,
    );
    await expect(pipeline.resolveDetailed(`solana:${SOL}`)).resolves.toEqual({
      status: 'not-found',
      address: SOL,
    });
  });

  it('answers pending for a sweep where every candidate is a pending shell', async () => {
    const pipeline = new TokenScanPipeline(
      makeClient({
        ethereum: shell({ chain: 'ethereum', address: EVM }),
        base: shell({ chain: 'base', address: EVM }),
        bsc: shell({ chain: 'bsc', address: EVM }),
        arbitrum: shell({ chain: 'arbitrum', address: EVM }),
        polygon: shell({ chain: 'polygon', address: EVM }),
      }) as never,
    );
    await expect(pipeline.resolveDetailed(EVM)).resolves.toEqual({
      status: 'pending',
      address: EVM,
    });
  });

  it('keeps not-found for a sweep where every client call returns null', async () => {
    const pipeline = new TokenScanPipeline(makeClient({}) as never);
    await expect(pipeline.resolveDetailed(EVM)).resolves.toEqual({
      status: 'not-found',
      address: EVM,
    });
  });

  it('still resolves when one sweep candidate has identity beside pending shells', async () => {
    const pipeline = new TokenScanPipeline(
      makeClient({
        ethereum: shell({ chain: 'ethereum', address: EVM }),
        base: identity('base', EVM),
      }) as never,
    );
    const detailed = await pipeline.resolveDetailed(EVM);
    expect(detailed.status).toBe('resolved');
    if (detailed.status !== 'resolved') throw new Error('expected resolved');
    expect(detailed.token.chain).toBe('base');
  });

  it('resolve() collapses pending to null (bot generic message stands)', async () => {
    const pipeline = new TokenScanPipeline(
      makeClient({ solana: shell({ chain: 'solana', address: SOL }) }) as never,
    );
    await expect(pipeline.resolve(`solana:${SOL}`)).resolves.toBeNull();
    await expect(pipeline.resolve(SOL)).resolves.toBeNull();
  });
});
