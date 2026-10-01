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
  });

  it('second GET is a cache HIT (SLO layer)', async () => {
    await request(app.getHttpServer()).get(
      '/api/market-data/snapshot?chain=solana&address=So11111111111111111111111111111111111111113',
    );
    const res = await request(app.getHttpServer()).get(
      '/api/market-data/snapshot?chain=solana&address=So11111111111111111111111111111111111111113',
    );
    expect(res.status).toBe(200);
    expect(res.headers['x-cache']).toBe('HIT');
  });

  it('unknown chain -> 404 (never a silent null)', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/market-data/snapshot?chain=nope&address=abc',
    );
    expect(res.status).toBe(404);
  });
});
