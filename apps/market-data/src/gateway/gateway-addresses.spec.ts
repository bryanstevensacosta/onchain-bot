import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
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

/**
 * Failing-first spec (Tramo 3, P45): universal addresses edge.
 *
 * GET /api/v1/addresses/:chain/:address[?kind=] resolves the kind
 * (explicit hint wins, garbage resolves to explicit unknown) while
 * the /tokens/* shell stays as a deprecated kind=token alias.
 */
describe('gateway addresses edge (P45)', () => {
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
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/v1/addresses/solana/<addr>?kind=token resolves kind=token', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/v1/addresses/solana/So11111111111111111111111111111111111111112?kind=token',
    );
    expect(res.status).toBe(200);
    expect(res.body.chain).toBe('solana');
    expect(res.body.kind).toBe('token');
    expect(res.body.status).toBe('pending');
  });

  it('GET /api/v1/addresses/<chain>/<garbage> resolves explicit unknown (no crash)', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/v1/addresses/ethereum/not-an-address?vault=1',
    );
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('unknown');
  });

  it('GET /api/v1/addresses/nope/<addr> returns 404 (chain qualifier enforced)', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/v1/addresses/nope/abc',
    );
    expect(res.status).toBe(404);
  });

  it('GET /api/v1/tokens/solana/<addr> still answers as deprecated kind=token alias', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/v1/tokens/solana/So11111111111111111111111111111111111111112',
    );
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('token');
  });
});
