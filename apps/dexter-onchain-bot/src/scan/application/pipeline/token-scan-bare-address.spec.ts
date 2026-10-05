import { TokenScanPipeline } from './token-scan.pipeline';
import type { MarketDataSnapshot } from '@/scan/infrastructure/market-data/market-data.client';

const SOL = 'So11111111111111111111111111111111111111112';
const EVM = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

function snapshot(
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
  };
}

function identity(chain: string, address: string): MarketDataSnapshot {
  return snapshot({
    chain,
    address,
    symbol: 'TKN',
    name: 'Token',
    priceUsd: 1,
  });
}

function makeClient(opts: {
  detect?: { chainId: string } | null;
  snapshots?: Record<string, MarketDataSnapshot | null>;
  detectThrows?: boolean;
}) {
  const calls: Array<string> = [];
  return {
    calls,
    client: {
      detectChain: async (address: string) => {
        calls.push(`detect:${address}`);
        if (opts.detectThrows === true) throw new Error('detect down');
        return opts.detect ?? null;
      },
      getSnapshot: async (chain: string, address: string) => {
        calls.push(`snapshot:${chain}:${address}`);
        return opts.snapshots?.[chain] ?? null;
      },
    },
  };
}

describe('TokenScanPipeline bare-address support', () => {
  it('resolves a bare Solana address via market-data chain-detect', async () => {
    const { client, calls } = makeClient({
      detect: { chainId: 'solana' },
      snapshots: { solana: identity('solana', SOL) },
    });
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(SOL);
    expect(token?.chain).toBe('solana');
    expect(token?.address).toBe(SOL);
    expect(calls[0]).toBe(`detect:${SOL}`);
    const detailed = await pipeline.resolveDetailed(SOL);
    expect(detailed.status).toBe('resolved');
  });

  it('resolves a bare EVM address via market-data chain-detect', async () => {
    const { client } = makeClient({
      detect: { chainId: 'ethereum' },
      snapshots: { ethereum: identity('ethereum', EVM) },
    });
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(EVM);
    expect(token?.chain).toBe('ethereum');
    const detailed = await pipeline.resolveDetailed(EVM);
    expect(detailed.status).toBe('resolved');
  });

  it('falls back to the solana-first sweep when chain-detect is down', async () => {
    const { client, calls } = makeClient({
      detectThrows: true,
      snapshots: { ethereum: identity('ethereum', EVM) },
    });
    const pipeline = new TokenScanPipeline(client as never);
    const detailed = await pipeline.resolveDetailed(EVM);
    expect(detailed.status).toBe('resolved');
    if (detailed.status === 'resolved') {
      expect(detailed.token.chain).toBe('ethereum');
    }
    const snapshotCalls = calls.filter((c) => c.startsWith('snapshot:'));
    expect(snapshotCalls.length).toBeGreaterThan(0);
    expect(snapshotCalls[0]).toBe(`snapshot:ethereum:${EVM}`);
  });

  it('best-pick with disclosure: identity on two EVM chains resolves highest liquidity', async () => {
    const { client } = makeClient({
      detect: { chainId: 'ethereum' },
      snapshots: {
        ethereum: {
          ...identity('ethereum', EVM),
          liquidityUsd: 100,
          fdvUsd: 1000,
        },
        base: { ...identity('base', EVM), liquidityUsd: 9000, fdvUsd: 500 },
      },
    });
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(EVM);
    expect(token?.chain).toBe('base');
    const detailed = await pipeline.resolveDetailed(EVM);
    expect(detailed.status).toBe('resolved');
    if (detailed.status === 'resolved') {
      expect(detailed.token.chain).toBe('base');
      expect(detailed.token.alternatives).toEqual([
        { chain: 'ethereum', address: EVM, liquidityUsd: 100 },
      ]);
    }
  });

  it('rejects garbage with an explicit invalid outcome, never a sweep', async () => {
    const { client, calls } = makeClient({ detect: { chainId: 'solana' } });
    const pipeline = new TokenScanPipeline(client as never);
    await expect(pipeline.resolve('hello')).resolves.toBeNull();
    const detailed = await pipeline.resolveDetailed('hello');
    expect(detailed.status).toBe('invalid');
    expect(calls).toEqual([]);
  });

  it('keeps resolving explicit chain:address qualifiers', async () => {
    const { client } = makeClient({
      snapshots: { solana: identity('solana', SOL) },
    });
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`solana:${SOL}`);
    expect(token?.chain).toBe('solana');
  });
});
