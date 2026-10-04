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
import { LaunchpadDetectorService } from 'provider/launchpad/application/launchpad-detector.service';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';

const nullFetcher = {
  name: 'dexscreener',
  supportsChains: ['solana', 'ethereum', 'bsc', 'base', 'arbitrum', 'polygon'],
  fetch: async () => null,
};

function items(n: number): Array<{ chain: string; address: string }> {
  return Array.from({ length: n }, (_, i) => ({
    chain: 'solana',
    address: `So111111111111111111111111111111111111111${String(i).padStart(2, '0')}`,
  }));
}

/**
 * Failing-first spec (Tramo 3, todo 5, G-17): batch edge.
 *
 * `POST /api/v1/addresses/batch` takes 1..50 items. One bad item
 * resolves to an explicit `{ chain, address, error }` while the rest
 * succeed — the batch never fails on a single bad address.
 */
describe('gateway addresses batch edge (todo 5)', () => {
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

  it('POST batch of 50 returns 50 snapshots', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/addresses/batch')
      .send({ items: items(50) });
    expect(res.status).toBe(200);
    expect(res.body.snapshots).toHaveLength(50);
    expect(res.body.snapshots[0].status).toBe('pending');
  });

  it('POST batch of 51 -> 400 (cap enforced)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/addresses/batch')
      .send({ items: items(51) });
    expect(res.status).toBe(400);
  });

  it('one bad item -> explicit error, rest succeed (no batch fail)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/addresses/batch')
      .send({
        items: [
          {
            chain: 'solana',
            address: 'So11111111111111111111111111111111111111112',
          },
          { chain: 'nope', address: 'abc' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.snapshots).toHaveLength(2);
    expect(res.body.snapshots[0].status).toBe('pending');
    expect(res.body.snapshots[1].error).toBeDefined();
  });
});
