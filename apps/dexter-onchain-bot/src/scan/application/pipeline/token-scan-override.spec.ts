import { Logger } from '@nestjs/common';
import { TokenScanPipeline } from './token-scan.pipeline';
import { LaunchpadOverride } from '@/templates/domain/launchpad-override.entity';
import { InMemoryLaunchpadOverrideRepository } from '@/templates/infrastructure/persistence/in-memory/in-memory-launchpad-override.repository';
import type { MarketDataSnapshot } from '@/scan/infrastructure/market-data/market-data.client';

const SOL_MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';
const EVM_MIXED = '0x925061143Df8D59f5EB980A8cA33d649f0a4B4aC';

function snapshot(
  overrides: Partial<MarketDataSnapshot> = {},
): MarketDataSnapshot {
  return {
    chain: 'solana',
    address: SOL_MINT,
    symbol: 'OVR',
    name: 'Override',
    priceUsd: 0.001,
    priceChange24h: null,
    marketCapUsd: 1000,
    fdvUsd: 1000,
    liquidityUsd: 500,
    lockedLiquidityPercent: null,
    burnedPercent: null,
    volume24hUsd: 2000,
    holders: 100,
    top10HolderPercent: null,
    totalSupply: 1000000,
    circulatingSupply: 1000000,
    maxSupply: null,
    devWallets: null,
    devPctSupply: null,
    status: 'ready',
    ...overrides,
  };
}

const pumpSnapshot = (): MarketDataSnapshot =>
  snapshot({
    launchpad: {
      id: 'pump-fun',
      name: 'Pump.fun',
      url: `https://pump.fun/coin/${SOL_MINT}`,
    },
  });

const clientFor = (snap: MarketDataSnapshot) => ({
  detectChain: async () => null,
  getSnapshot: async () => snap,
});

describe('TokenScanPipeline launchpad override (plan todo 37, MAX precedence)', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('override BEATS a positive detection (snapshot pump-fun → curated believe)', async () => {
    const overrides = new InMemoryLaunchpadOverrideRepository();
    await overrides.save(
      LaunchpadOverride.create({ mint: SOL_MINT, launchpadId: 'believe' }),
    );
    const pipeline = new TokenScanPipeline(
      clientFor(pumpSnapshot()) as never,
      overrides,
    );
    const token = await pipeline.resolve(`solana:${SOL_MINT}`);
    expect(token?.launchpad).toEqual({
      id: 'believe',
      name: 'Believe',
      url: `https://defined.fi/token/solana/${SOL_MINT}`,
    });
  });

  it('override fills a detector null (team-launch snapshot → curated id)', async () => {
    const overrides = new InMemoryLaunchpadOverrideRepository();
    await overrides.save(
      LaunchpadOverride.create({ mint: SOL_MINT, launchpadId: 'pump-fun' }),
    );
    const pipeline = new TokenScanPipeline(
      clientFor(snapshot({ launchpad: null })) as never,
      overrides,
    );
    const token = await pipeline.resolve(`solana:${SOL_MINT}`);
    expect(token?.launchpad?.id).toBe('pump-fun');
  });

  it('delete restores detector behavior byte-identically', async () => {
    const overrides = new InMemoryLaunchpadOverrideRepository();
    const row = await overrides.save(
      LaunchpadOverride.create({ mint: SOL_MINT, launchpadId: 'believe' }),
    );
    const pipeline = new TokenScanPipeline(
      clientFor(pumpSnapshot()) as never,
      overrides,
    );
    expect((await pipeline.resolve(`solana:${SOL_MINT}`))?.launchpad?.id).toBe(
      'believe',
    );
    await overrides.delete(row.id);
    expect((await pipeline.resolve(`solana:${SOL_MINT}`))?.launchpad).toEqual({
      id: 'pump-fun',
      name: 'Pump.fun',
      url: `https://pump.fun/coin/${SOL_MINT}`,
    });
  });

  it('no row → snapshot passthrough untouched (zero behavior change)', async () => {
    const pipeline = new TokenScanPipeline(
      clientFor(pumpSnapshot()) as never,
      new InMemoryLaunchpadOverrideRepository(),
    );
    const token = await pipeline.resolve(`solana:${SOL_MINT}`);
    expect(token?.launchpad?.id).toBe('pump-fun');
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('launchpad override hit'),
    );
  });

  it('no repo binding (@Optional) → snapshot passthrough, never crashes', async () => {
    const pipeline = new TokenScanPipeline(clientFor(pumpSnapshot()) as never);
    const token = await pipeline.resolve(`solana:${SOL_MINT}`);
    expect(token?.launchpad?.id).toBe('pump-fun');
  });

  it('EVM lookup normalizes (row stored lowercase matches checksummed scan)', async () => {
    const overrides = new InMemoryLaunchpadOverrideRepository();
    await overrides.save(
      LaunchpadOverride.create({
        mint: EVM_MIXED.toLowerCase(),
        launchpadId: 'bankr',
      }),
    );
    const evmSnapshot = snapshot({
      chain: 'bsc',
      address: EVM_MIXED,
      launchpad: null,
    });
    const pipeline = new TokenScanPipeline(
      {
        detectChain: async () => null,
        getSnapshot: async () => evmSnapshot,
      } as never,
      overrides,
    );
    const token = await pipeline.resolve(`bsc:${EVM_MIXED}`);
    expect(token?.launchpad?.id).toBe('bankr');
  });

  it('each hit logs one `override` audit line (mint + curated id + snapshot id)', async () => {
    const overrides = new InMemoryLaunchpadOverrideRepository();
    await overrides.save(
      LaunchpadOverride.create({ mint: SOL_MINT, launchpadId: 'believe' }),
    );
    const pipeline = new TokenScanPipeline(
      clientFor(pumpSnapshot()) as never,
      overrides,
    );
    await pipeline.resolve(`solana:${SOL_MINT}`);
    const hits = logSpy.mock.calls.filter((call) =>
      String(call[0]).includes('launchpad override hit'),
    );
    expect(hits).toHaveLength(1);
    expect(String(hits[0][0])).toContain(`mint=${SOL_MINT}`);
    expect(String(hits[0][0])).toContain('id=believe');
    expect(String(hits[0][0])).toContain('snapshot=pump-fun');
  });

  it('unreadable store fails open to the snapshot value (never blanks the card)', async () => {
    const broken = {
      findAll: async () => [],
      findOne: async () => null,
      findByMint: async () => {
        throw new Error('store down');
      },
      save: async () => {
        throw new Error('store down');
      },
      delete: async () => false,
    };
    const pipeline = new TokenScanPipeline(
      clientFor(pumpSnapshot()) as never,
      broken,
    );
    const token = await pipeline.resolve(`solana:${SOL_MINT}`);
    expect(token?.launchpad?.id).toBe('pump-fun');
  });
});
