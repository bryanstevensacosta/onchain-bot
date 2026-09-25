import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ChainModule } from 'chain/chain.module';
import { ProviderModule } from 'provider/provider.module';
import { CacheModule } from 'cache/cache.module';
import { RateLimiterModule } from 'rate-limiter/rate-limiter.module';
import { GatewayModule } from 'gateway/gateway.module';

/**
 * Failing-first spec (Tramo 3, todo 2, P43): gateway chains surface.
 *
 * Modules expose ports; the ONLY HTTP surface for chains lives in
 * src/gateway/ (aggregated-data controllers).
 */
describe('gateway chains (P43)', () => {
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

  it('GET /api/v1/chains returns a non-empty list', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/chains');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('GET /api/v1/chains/solana returns the entry', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/chains/solana');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('solana');
  });

  it('GET /api/v1/chains/nope returns 404', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/chains/nope');
    expect(res.status).toBe(404);
  });

  it('GET /api/v1/chains/detect?address= resolves ethereum', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/chains/detect')
      .query({ address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' });
    expect(res.status).toBe(200);
    expect(res.body.chainId).toBe('ethereum');
  });
});
