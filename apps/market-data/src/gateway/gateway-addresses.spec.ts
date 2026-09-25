import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ChainModule } from 'chain/chain.module';
import { ProviderModule } from 'provider/provider.module';
import { CacheModule } from 'cache/cache.module';
import { RateLimiterModule } from 'rate-limiter/rate-limiter.module';
import { AddressModule } from 'address/address.module';
import { GatewayModule } from 'gateway/gateway.module';

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
        ChainModule,
        ProviderModule,
        CacheModule,
        RateLimiterModule,
        AddressModule,
        GatewayModule,
      ],
    }).compile();
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
