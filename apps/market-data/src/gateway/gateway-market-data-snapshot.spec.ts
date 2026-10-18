import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { ChainModule } from 'chain/chain.module';
import { ProviderModule } from 'provider/provider.module';
import { CacheModule } from 'cache/cache.module';
import { RateLimiterModule } from 'rate-limiter/rate-limiter.module';
import { AddressModule } from 'address/address.module';
import { GatewayModule } from 'gateway/gateway.module';
import { SNAPSHOT_QUOTE_PROVIDERS } from 'snapshot/domain/snapshot-quote.types';
import { AddressExistenceService } from 'snapshot/application/address-existence.service';
import { PendingAgingService } from 'snapshot/application/pending-aging.service';
import { LaunchpadDetectorService } from 'launchpad/application/launchpad-detector.service';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
import { OnchainSolanaReaderService } from 'provider/infrastructure/onchain/onchain-solana.reader';

const nullFetcher = {
  name: 'dexscreener',
  supportsChains: ['solana', 'ethereum', 'bsc', 'base', 'arbitrum', 'polygon'],
  fetch: async () => null,
};

const SOL = 'So11111111111111111111111111111111111111112';

/**
 * Failing-first spec (Tramo 3, todo 5, G-17): compat snapshot edge.
 *
 * `GET /api/market-data/snapshot?chain=&address=` is the exact contract
 * the kol-system HttpMarketDataAdapter calls. Market fields stay null
 * with explicit `status: 'pending'` until the todo-3 aggregators land —
 * never a silent shape change, never a silent null (bad chain → 404).
 */
describe('gateway market-data snapshot compat edge (todo 5)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ChainModule,
        ProviderModule,
        CacheModule,
        RateLimiterModule,
        AddressModule,
        GatewayModule,
      ],
    })
      .overrideProvider(SNAPSHOT_QUOTE_PROVIDERS)
      .useValue([nullFetcher])
      .overrideProvider(LaunchpadDetectorService)
      .useValue({ detectLaunchpad: async () => null })
      .overrideProvider(DexScreenerService)
      .useValue({
        getBestPairSummary: async () => null,
        getBestPairSummaryForChain: async () => null,
      })
      .overrideProvider(GeckoTerminalService)
      .useValue({ getTokenPools: async () => null })
      // No live readers in edge-contract specs (todo 39 leg stubbed:
      // the suite pins the no-metadata shape, never live identity).
      .overrideProvider(OnchainSolanaReaderService)
      .useValue({
        getPoolView: async () => null,
        getTokenBasics: async () => null,
      })
      // Hermetic existence + aging (todo 21b/21d): fail-open existence
      // stub and a never-escalating aging stub — this edge suite pins
      // plumbing, not the counters (dedicated specs own those; the
      // third same-address call here must keep serving the pipeline).
      .overrideProvider(AddressExistenceService)
      .useValue({
        probe: async () => ({
          verdict: 'unresolved',
          reason: 'spec stub (fail-open)',
          ms: 0,
        }),
      })
      .overrideProvider(PendingAgingService)
      .useValue({
        record: () => ({ count: 1, escalated: false }),
        clear: () => {},
        size: () => 0,
        escalationThreshold: 99,
        escalationWindowMs: 600_000,
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/market-data/snapshot returns the 15 MarketData fields + echo', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/market-data/snapshot?chain=solana&address=${SOL}`,
    );
    expect(res.status).toBe(200);
    for (const field of [
      'priceUsd',
      'liquidityUsd',
      'volume24hUsd',
      'marketCapUsd',
      'fdvUsd',
      'priceChange24h',
      'holders',
      'top10HolderPercent',
      'symbol',
      'name',
      'lockedLiquidityPercent',
      'burnedPercent',
      'totalSupply',
      'circulatingSupply',
      'maxSupply',
    ]) {
      expect(res.body).toHaveProperty(field);
    }
    expect(res.body.chain).toBe('solana');
    expect(res.body.address).toBe(SOL.toLowerCase());
    expect(res.body.status).toBe('pending');
    expect(res.body).toHaveProperty('launchpad', null);
    expect(res.body).toHaveProperty('venue', null);
    expect(res.body).toHaveProperty('pairCreatedAt', null);
    expect(res.body).toHaveProperty('identityProvenance', null);
  });

  it('second GET of a pending shell is a cache MISS (no negative cache, plan todo 19a)', async () => {
    await request(app.getHttpServer()).get(
      '/api/market-data/snapshot?chain=solana&address=So11111111111111111111111111111111111111113',
    );
    const res = await request(app.getHttpServer()).get(
      '/api/market-data/snapshot?chain=solana&address=So11111111111111111111111111111111111111113',
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    expect(res.headers['x-cache']).toBe('MISS');
  });

  it('unknown chain -> 404 (never a silent null)', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/market-data/snapshot?chain=nope&address=abc',
    );
    expect(res.status).toBe(404);
  });
});

describe('gateway market-data snapshot launchpad plumbing (Lane D)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ChainModule,
        ProviderModule,
        CacheModule,
        RateLimiterModule,
        AddressModule,
        GatewayModule,
      ],
    })
      .overrideProvider(SNAPSHOT_QUOTE_PROVIDERS)
      .useValue([nullFetcher])
      .overrideProvider(LaunchpadDetectorService)
      .useValue({
        detectLaunchpad: async () => ({
          id: 'pump-fun',
          name: 'Pump.fun',
          url: `https://pump.fun/coin/${SOL}`,
        }),
      })
      .overrideProvider(DexScreenerService)
      .useValue({
        getBestPairSummaryForChain: async () => ({
          pairAddress: 'pair1',
          dexId: 'raydium',
          labels: ['CLMM'],
          pairCreatedAt: 1791892874000,
        }),
      })
      .overrideProvider(GeckoTerminalService)
      .useValue({ getTokenPools: async () => null })
      .overrideProvider(OnchainSolanaReaderService)
      .useValue({
        getPoolView: async () => null,
        getTokenBasics: async () => null,
      })
      // Hermetic existence + aging (todo 21b/21d): fail-open existence
      // stub and a never-escalating aging stub — this edge suite pins
      // plumbing, not the counters (dedicated specs own those; the
      // third same-address call here must keep serving the pipeline).
      .overrideProvider(AddressExistenceService)
      .useValue({
        probe: async () => ({
          verdict: 'unresolved',
          reason: 'spec stub (fail-open)',
          ms: 0,
        }),
      })
      .overrideProvider(PendingAgingService)
      .useValue({
        record: () => ({ count: 1, escalated: false }),
        clear: () => {},
        size: () => 0,
        escalationThreshold: 99,
        escalationWindowMs: 600_000,
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('exposes snapshot.launchpad from the detector (dexter contract)', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/market-data/snapshot?chain=solana&address=${SOL}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.launchpad).toEqual({
      id: 'pump-fun',
      name: 'Pump.fun',
      url: `https://pump.fun/coin/${SOL}`,
    });
  });

  it('exposes snapshot.venue from the dexscreener best pair (dexter contract)', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/market-data/snapshot?chain=solana&address=${SOL}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.venue).toEqual({ dexId: 'raydium', labels: ['CLMM'] });
  });

  it('exposes snapshot.pairCreatedAt as ISO from the best pair (dexter contract)', async () => {
    const res = await request(app.getHttpServer()).get(
      `/api/market-data/snapshot?chain=solana&address=${SOL}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.pairCreatedAt).toBe('2026-10-13T12:01:14.000Z');
  });
});
