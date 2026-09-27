import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ChainModule } from 'chain/chain.module';
import { ProviderModule } from 'provider/provider.module';
import { CacheModule } from 'cache/cache.module';
import { RateLimiterModule } from 'rate-limiter/rate-limiter.module';
import { GatewayModule } from 'gateway/gateway.module';
import { ChainLogoModule } from 'chain-logo/chain-logo.module';

/**
 * Failing-first spec (chain-logo): gateway logo edge.
 *
 * GET /api/v1/chains/:id/logo is public with a long cache and serves
 * PNG bytes; unknown chains get the placeholder (200, never 404).
 * POST /api/v1/chains/:id/logo/refresh is the explicit refresh path.
 */
describe('gateway chain logo', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.CHAIN_LOGO_DIR = '/tmp/chain-logo-gateway-spec';
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        ChainModule,
        ProviderModule,
        CacheModule,
        RateLimiterModule,
        ChainLogoModule,
        GatewayModule,
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    delete process.env.CHAIN_LOGO_DIR;
    await app?.close();
  });

  it('serves PNG logo bytes with a long public cache header', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/chains/solana/logo');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['cache-control']).toContain('max-age=86400');
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('serves the placeholder for an unknown chain (200, never 404)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/chains/nope/logo');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('exposes the explicit refresh endpoint', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/chains/solana/logo/refresh');
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('solana');
    expect(typeof res.body.source).toBe('string');
  });

  it('chain catalog entries reference their logoUrl', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/chains/solana');
    expect(res.status).toBe(200);
    expect(res.body.logoUrl).toBe('/api/v1/chains/solana/logo');
  });
});
