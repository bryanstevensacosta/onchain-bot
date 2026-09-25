import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ChainModule } from 'chain/chain.module';
import { ProviderModule } from 'provider/provider.module';
import { CacheModule } from 'cache/cache.module';
import { RateLimiterModule } from 'rate-limiter/rate-limiter.module';
import { GatewayModule } from 'gateway/gateway.module';

/**
 * Failing-first spec (Tramo 3, todo 2, P43): token snapshot shell.
 *
 * The full snapshot lands in todo 3 (token/ untouched here): the gateway
 * answers a composed shell (chain validation + provider hints) so the
 * edge contract is testable from day one.
 */
describe('gateway token snapshot shell (P43)', () => {
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

  it('GET /api/v1/tokens/solana/<addr> returns the pending shell', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/v1/tokens/solana/So11111111111111111111111111111111111111112',
    );
    expect(res.status).toBe(200);
    expect(res.body.chain).toBe('solana');
    expect(res.body.status).toBe('pending');
  });

  it('GET /api/v1/tokens/nope/<addr> returns 404', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/tokens/nope/abc');
    expect(res.status).toBe(404);
  });
});
