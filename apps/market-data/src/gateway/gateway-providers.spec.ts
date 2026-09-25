import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ChainModule } from 'chain/chain.module';
import { ProviderModule } from 'provider/provider.module';
import { CacheModule } from 'cache/cache.module';
import { RateLimiterModule } from 'rate-limiter/rate-limiter.module';
import { GatewayModule } from 'gateway/gateway.module';

/**
 * Failing-first spec (Tramo 3, todo 2, P43): gateway providers surface.
 */
describe('gateway providers (P43)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ChainModule, ProviderModule, CacheModule, RateLimiterModule, GatewayModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/v1/providers returns a status list', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/providers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('status');
  });

  it('GET /api/v1/providers/nope returns 404', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/providers/nope');
    expect(res.status).toBe(404);
  });
});
