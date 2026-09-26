import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { HmacService } from '../auth/application/hmac.service';
import { DomainExceptionFilter } from '../shared/filters/domain-exception.filter';

const ADMIN_ID = 'ops-admin';
const ADMIN_SECRET = 'ops-admin-ingress-secret-abc123';

describe('ingress webhook + router HTTP integration (todo 3, red)', () => {
  let app: INestApplication;
  let hmac: HmacService;
  let nonceSeq = 0;

  const authHeaders = (
    method: string,
    path: string,
    body: string,
    opts: { nonce?: string; timestamp?: string } = {},
  ) => {
    const nonce =
      opts.nonce ?? `ingress-nonce-${Date.now()}-${(nonceSeq += 1)}`;
    const ts = opts.timestamp ?? String(Math.floor(Date.now() / 1000));
    return {
      'x-api-key': ADMIN_ID,
      'x-timestamp': ts,
      'x-nonce': nonce,
      'x-signature': hmac.sign(ADMIN_SECRET, method, path, ts, nonce, body),
    };
  };

  beforeAll(async () => {
    process.env.BOTS_GATEWAY_CLIENTS = JSON.stringify({
      [ADMIN_ID]: { secret: ADMIN_SECRET, scopes: ['admin'] },
    });
    process.env.BOTS_GATEWAY_FANOUT_BACKOFF_MS = '5,5,5';
    hmac = new HmacService();
    const received: Array<{ url: string; body: string }> = [];
    (globalThis as { __ingressReceived?: unknown }).__ingressReceived =
      received;
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      async (
        url: unknown,
        init: {
          body?: unknown;
        },
      ) => {
        const u = String(url);
        if (u.includes('mock-app-down')) {
          throw new Error('ECONNREFUSED');
        }
        if (u.includes('mock-app')) {
          received.push({ url: u, body: String(init?.body ?? '') });
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true }),
          } as unknown as Response;
        }
        if (u.includes('api.telegram.org')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, result: true }),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, result: true }),
        } as unknown as Response;
      },
    );

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    (globalThis.fetch as jest.Mock)?.mockRestore?.();
    delete process.env.BOTS_GATEWAY_CLIENTS;
    delete process.env.BOTS_GATEWAY_FANOUT_BACKOFF_MS;
    await app?.close();
  });

  function received() {
    return (
      globalThis as { __ingressReceived: Array<{ url: string; body: string }> }
    ).__ingressReceived;
  }

  async function upsertBot(
    botId: string,
    webhookSecret: string,
    subscribers: Array<{ appId: string; url: string }> = [],
  ) {
    const path = `/api/ingress/${botId}/subscriptions`;
    const raw = JSON.stringify({ webhookSecret, subscribers });
    await request(app.getHttpServer())
      .put(path)
      .set(authHeaders('PUT', path, raw))
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(200);
  }

  it('registers a bot route (admin) and fans out a signed webhook update to 2 apps', async () => {
    await upsertBot('bot-fanout', 'route-secret-1', [
      { appId: 'kol-system', url: 'http://mock-app/kol' },
      { appId: 'feed-publisher', url: 'http://mock-app/feed' },
    ]);
    received().length = 0;

    const update = { update_id: 42, message: { text: 'ping' } };
    const res = await request(app.getHttpServer())
      .post('/api/ingress/bot-fanout/updates')
      .set('x-telegram-bot-api-secret-token', 'route-secret-1')
      .send(update)
      .expect(201);

    expect(res.body.ok).toBe(true);
    expect(res.body.delivered.sort()).toEqual(['feed-publisher', 'kol-system']);
    expect(received()).toHaveLength(2);
    for (const hit of received()) {
      expect(JSON.parse(hit.body)).toEqual(update);
    }
  });

  it('rejects a webhook with a wrong per-route secret (401)', async () => {
    await upsertBot('bot-secret', 'correct-secret', []);
    await request(app.getHttpServer())
      .post('/api/ingress/bot-secret/updates')
      .set('x-telegram-bot-api-secret-token', 'wrong-secret')
      .send({ update_id: 1 })
      .expect(401);
  });

  it('never runs webhook + polling together: polling mode refuses webhook (409)', async () => {
    await upsertBot('bot-exclusive', 'route-secret-2', []);
    const modePath = '/api/ingress/bot-exclusive/mode';
    const raw = JSON.stringify({ mode: 'polling' });
    await request(app.getHttpServer())
      .post(modePath)
      .set(authHeaders('POST', modePath, raw))
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/ingress/bot-exclusive/updates')
      .set('x-telegram-bot-api-secret-token', 'route-secret-2')
      .send({ update_id: 2 })
      .expect(409);
  });

  it('dead-letters when a subscribed app is down', async () => {
    await upsertBot('bot-down', 'route-secret-3', [
      { appId: 'dexter', url: 'http://mock-app-down/dexter' },
    ]);
    const res = await request(app.getHttpServer())
      .post('/api/ingress/bot-down/updates')
      .set('x-telegram-bot-api-secret-token', 'route-secret-3')
      .send({ update_id: 3 })
      .expect(201);
    expect(res.body.failed).toHaveLength(1);

    const dlPath = '/api/ingress/bot-down/dead-letter';
    const dl = await request(app.getHttpServer())
      .get(dlPath)
      .set(authHeaders('GET', dlPath, ''))
      .expect(200);
    expect(dl.body.total).toBeGreaterThanOrEqual(1);
  });
});
