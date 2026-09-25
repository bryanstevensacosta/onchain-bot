import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ChainModule } from 'chain/chain.module';
import { ProviderModule } from 'provider/provider.module';
import { CacheModule } from 'cache/cache.module';
import { RateLimiterModule } from 'rate-limiter/rate-limiter.module';
import { GatewayModule } from 'gateway/gateway.module';
import { ApiKeyGuard } from 'shared/guards/api-key.guard';

/**
 * Failing-first spec (Tramo 3, todo 2, P43): gateway edge policies.
 *
 * Auth (x-api-key) + rate-limit + cache HIT/MISS headers are applied
 * at the edge, in gateway — never inside the feature modules.
 */
describe('gateway edge policies (P43)', () => {
  const OLD_KEY = process.env.MARKET_DATA_API_KEY;
  let app: INestApplication;

  beforeAll(async () => {
    process.env.MARKET_DATA_API_KEY = 'edge-test-key';
    const module = await Test.createTestingModule({
      imports: [ChainModule, ProviderModule, CacheModule, RateLimiterModule, GatewayModule],
      providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    process.env.MARKET_DATA_API_KEY = OLD_KEY;
    await app?.close();
  });

  it('rejects requests without the api key', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/chains');
    expect([401, 403]).toContain(res.status);
  });

  it('serves requests with the api key and marks cache MISS then HIT', async () => {
    const server = app.getHttpServer();
    const first = await request(server).get('/api/v1/chains').set('x-api-key', 'edge-test-key');
    expect(first.status).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    const second = await request(server).get('/api/v1/chains').set('x-api-key', 'edge-test-key');
    expect(second.status).toBe(200);
    expect(second.headers['x-cache']).toBe('HIT');
  });
});
