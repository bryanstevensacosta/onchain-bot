import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SnapshotModule } from '../snapshot.module';
import { AddressSnapshotService } from './address-snapshot.service';
import { LaunchpadDetectorService } from 'provider/launchpad/application/launchpad-detector.service';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { DEXSCREENER_CONFIG } from 'provider/infrastructure/dexscreener/dexscreener.config';
import { SNAPSHOT_QUOTE_PROVIDERS } from '../domain/snapshot-quote.types';
import { toVenueOrNull } from '../domain/snapshot-venue';

const SOL = 'So11111111111111111111111111111111111111112';

const nullFetcher = {
  name: 'dexscreener',
  supportsChains: ['solana', 'ethereum', 'bsc', 'base', 'arbitrum', 'polygon'],
  fetch: async () => null,
};

async function buildService(
  bestPair: unknown,
): Promise<AddressSnapshotService> {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      SnapshotModule,
    ],
  })
    .overrideProvider(SNAPSHOT_QUOTE_PROVIDERS)
    .useValue([nullFetcher])
    .overrideProvider(LaunchpadDetectorService)
    .useValue({ detectLaunchpad: async () => null })
    .overrideProvider(DexScreenerService)
    .useValue({
      getBestPairSummary: async () => (bestPair === null ? null : bestPair),
    })
    .compile();
  return module.get(AddressSnapshotService);
}

describe('toVenueOrNull (snapshot venue boundary)', () => {
  it('passes a valid venue verbatim', () => {
    expect(toVenueOrNull({ dexId: 'pancakeswap', labels: ['v3'] })).toEqual({
      dexId: 'pancakeswap',
      labels: ['v3'],
    });
  });

  it.each([
    ['missing dexId', { labels: ['v3'] }],
    ['empty dexId', { dexId: '', labels: ['v3'] }],
    ['blank dexId', { dexId: '   ', labels: [] }],
    ['non-string dexId', { dexId: 42, labels: [] }],
    ['missing labels', { dexId: 'raydium' }],
    ['non-array labels', { dexId: 'raydium', labels: 'CLMM' }],
    ['null', null],
    ['string scalar', 'raydium'],
    ['array', [{ dexId: 'raydium', labels: [] }]],
  ])('resolves null for %s, never passes opaque JSON', (_label, raw) => {
    expect(toVenueOrNull(raw)).toBeNull();
  });

  it('drops non-string labels, keeps the venue', () => {
    expect(toVenueOrNull({ dexId: 'orca', labels: ['wp', 42, null] })).toEqual({
      dexId: 'orca',
      labels: ['wp'],
    });
  });

  it('trims a padded dexId', () => {
    expect(toVenueOrNull({ dexId: '  raydium ', labels: [] })).toEqual({
      dexId: 'raydium',
      labels: [],
    });
  });
});

describe('AddressSnapshotService venue plumbing (dexter venue-line)', () => {
  it('exposes snapshot.venue from the dexscreener best pair', async () => {
    const service = await buildService({
      dexId: 'pancakeswap',
      labels: ['v3'],
    });
    const snapshot = await service.getSnapshot({
      chain: 'solana',
      value: SOL,
      kindHint: 'token',
    });
    expect(snapshot.venue).toEqual({ dexId: 'pancakeswap', labels: ['v3'] });
  });

  it('resolves null when the best pair is absent', async () => {
    const service = await buildService(null);
    const snapshot = await service.getSnapshot({
      chain: 'solana',
      value: SOL,
      kindHint: 'token',
    });
    expect(snapshot.venue).toBeNull();
  });

  it('resolves null when the best pair carries no dexId, never crashes', async () => {
    const service = await buildService({ dexId: '', labels: [] });
    const snapshot = await service.getSnapshot({
      chain: 'solana',
      value: SOL,
      kindHint: 'token',
    });
    expect(snapshot.venue).toBeNull();
  });

  it('keeps launchpad and venue independent (dexId never feeds launchpad)', async () => {
    const service = await buildService({ dexId: 'meteoradbc', labels: [] });
    const snapshot = await service.getSnapshot({
      chain: 'solana',
      value: SOL,
      kindHint: 'token',
    });
    expect(snapshot.venue).toEqual({ dexId: 'meteoradbc', labels: [] });
    expect(snapshot.launchpad).toBeNull();
  });
});

describe('DexScreenerService.getBestPairSummary labels (venue source)', () => {
  it('carries the best pair labels through the summary', async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        DexScreenerService,
        { provide: DEXSCREENER_CONFIG, useValue: {} },
      ],
    }).compile();
    const service = module.get(DexScreenerService);
    jest.spyOn(service, 'getPairsByToken').mockResolvedValue([
      {
        chainId: 'bsc',
        dexId: 'pancakeswap',
        url: 'https://dexscreener.com/bsc/pair1',
        pairAddress: 'pair1',
        labels: ['v3'],
        baseToken: { address: '0xabc', name: 'Huma', symbol: 'HUMA' },
        quoteToken: { address: null, name: null, symbol: null },
        priceNative: '1',
        priceUsd: '2',
        txns: { h24: { buys: 1, sells: 1 } },
        volume: { h24: 100 },
        priceChange: { h24: 1 },
        liquidity: { usd: 1000, base: 1, quote: 1 },
        fdv: null,
        marketCap: null,
        pairCreatedAt: null,
      },
    ]);
    const summary = await service.getBestPairSummary('0xabc');
    expect(summary?.dexId).toBe('pancakeswap');
    expect(summary?.labels).toEqual(['v3']);
    await module.close();
  });

  it('defaults labels to [] when the pair carries none', async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        DexScreenerService,
        { provide: DEXSCREENER_CONFIG, useValue: {} },
      ],
    }).compile();
    const service = module.get(DexScreenerService);
    jest.spyOn(service, 'getPairsByToken').mockResolvedValue([
      {
        chainId: 'solana',
        dexId: 'raydium',
        url: 'https://dexscreener.com/solana/pair2',
        pairAddress: 'pair2',
        baseToken: { address: SOL, name: 'Wrapped SOL', symbol: 'SOL' },
        quoteToken: { address: null, name: null, symbol: null },
        priceNative: '1',
        priceUsd: '2',
        txns: { h24: { buys: 1, sells: 1 } },
        volume: { h24: 100 },
        priceChange: { h24: 1 },
        liquidity: { usd: 1000, base: 1, quote: 1 },
        fdv: null,
        marketCap: null,
        pairCreatedAt: null,
      },
    ]);
    const summary = await service.getBestPairSummary(SOL);
    expect(summary?.labels).toEqual([]);
    await module.close();
  });
});
