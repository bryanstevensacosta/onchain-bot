import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { VaultService } from '../vault/application/vault.service';
import { HmacService } from '../auth/application/hmac.service';
import { DomainExceptionFilter } from '../shared/filters/domain-exception.filter';

const CLIENT_ID = 'kol-system';
const CLIENT_SECRET = 'kol-system-integration-secret-abc123';
const ADMIN_ID = 'ops-admin';
const ADMIN_SECRET = 'ops-admin-integration-secret-abc123';

function sign(
  hmac: HmacService,
  secret: string,
  method: string,
  path: string,
  body: string,
  clientId: string,
  nonce: string,
  timestamp?: string,
) {
  const ts = timestamp ?? String(Math.floor(Date.now() / 1000));
  return {
    ts,
    signature: hmac.sign(secret, method, path, ts, nonce, body),
  };
}

describe('send gateway HTTP integration (todo 2, red)', () => {
  let app: INestApplication;
  let hmac: HmacService;
  let botId: string;
  let nonceSeq = 0;
  const nextNonce = () => `it-nonce-${Date.now()}-${(nonceSeq += 1)}`;

  const authHeaders = (
    secret: string,
    clientId: string,
    method: string,
    path: string,
    body: string,
    opts: { nonce?: string; timestamp?: string } = {},
  ) => {
    const nonce = opts.nonce ?? nextNonce();
    const { ts, signature } = sign(
      hmac,
      secret,
      method,
      path,
      body,
      clientId,
      nonce,
      opts.timestamp,
    );
    return {
      'x-api-key': clientId,
      'x-timestamp': ts,
      'x-nonce': nonce,
      'x-signature': signature,
    };
  };

  beforeAll(async () => {
    process.env.BOTS_GATEWAY_CLIENTS = JSON.stringify({
      [CLIENT_ID]: { secret: CLIENT_SECRET, scopes: ['send'] },
      [ADMIN_ID]: { secret: ADMIN_SECRET, scopes: ['admin'] },
    });
    hmac = new HmacService();
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
      async (url: unknown) => {
        const u = String(url);
        if (u.includes('/sendMessage')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, result: { message_id: 1001 } }),
          } as unknown as Response;
        }
        if (u.includes('/getMe')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              result: { id: 1, username: 'x', first_name: 'X' },
            }),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, result: true }),
        } as unknown as Response;
      },
    );
    (globalThis as { __fetchSpy?: unknown }).__fetchSpy = fetchSpy;

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
    const vault = app.get(VaultService);
    const created = await vault.register({
      label: 'it-bot',
      token: '111:AAA',
      ownerApp: 'kol-system',
    });
    botId = created.id;
  });

  afterAll(async () => {
    (
      globalThis as { __fetchSpy?: { mockRestore: () => void } }
    ).__fetchSpy?.mockRestore();
    delete process.env.BOTS_GATEWAY_CLIENTS;
    await app?.close();
  });

  it('GET /api/health stays public', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200);
  });

  it('POST /api/bots/:id/send delivers a message (signed, send scope)', async () => {
    const path = `/api/bots/${botId}/send`;
    const raw = JSON.stringify({
      kind: 'message',
      chat_id: '-1001',
      text: 'hello it',
      client_msg_id: 'it-1',
    });
    const res = await request(app.getHttpServer())
      .post(path)
      .set(authHeaders(CLIENT_SECRET, CLIENT_ID, 'POST', path, raw))
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(200);
    expect(res.body).toMatchObject({ ok: true, message_id: 1001 });
  });

  it('rejects an unsigned send with 401', async () => {
    await request(app.getHttpServer())
      .post(`/api/bots/${botId}/send`)
      .send({ kind: 'message', chat_id: '-1001', text: 'no auth' })
      .expect(401);
  });

  it('rejects a bad signature with 401', async () => {
    const path = `/api/bots/${botId}/send`;
    const raw = JSON.stringify({
      kind: 'message',
      chat_id: '-1001',
      text: 'bad sig',
    });
    const headers = authHeaders(CLIENT_SECRET, CLIENT_ID, 'POST', path, raw);
    headers['x-signature'] = 'f'.repeat(64);
    await request(app.getHttpServer())
      .post(path)
      .set(headers)
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(401);
  });

  it('rejects an expired timestamp with 401', async () => {
    const path = `/api/bots/${botId}/send`;
    const raw = JSON.stringify({
      kind: 'message',
      chat_id: '-1001',
      text: 'old',
    });
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    await request(app.getHttpServer())
      .post(path)
      .set(authHeaders(CLIENT_SECRET, CLIENT_ID, 'POST', path, raw, { timestamp: old }))
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(401);
  });

  it('rejects a replayed nonce with 401', async () => {
    const path = `/api/bots/${botId}/send`;
    const raw = JSON.stringify({
      kind: 'message',
      chat_id: '-1001',
      text: 'replay',
      client_msg_id: 'it-replay',
    });
    const nonce = nextNonce();
    const headers = authHeaders(CLIENT_SECRET, CLIENT_ID, 'POST', path, raw, {
      nonce,
    });
    await request(app.getHttpServer())
      .post(path)
      .set(headers)
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(200);
    await request(app.getHttpServer())
      .post(path)
      .set(headers)
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(401);
  });

  it('rejects a send-scoped key on the admin vault with 403', async () => {
    const path = '/api/vault/bots';
    const raw = JSON.stringify({
      label: 'x',
      token: 'y',
      ownerApp: 'kol-system',
    });
    await request(app.getHttpServer())
      .post(path)
      .set(authHeaders(CLIENT_SECRET, CLIENT_ID, 'POST', path, raw))
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(403);
  });

  it('lets an admin key use the vault', async () => {
    const path = '/api/vault/bots';
    const raw = JSON.stringify({
      label: 'admin-created',
      token: '222:BBB',
      ownerApp: 'feed-publisher',
    });
    const res = await request(app.getHttpServer())
      .post(path)
      .set(authHeaders(ADMIN_SECRET, ADMIN_ID, 'POST', path, raw))
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(201);
    expect(res.body.token).toBe('***');
  });

  it('exposes per-bot send stats (signed)', async () => {
    const path = `/api/bots/${botId}/stats`;
    const res = await request(app.getHttpServer())
      .get(path)
      .set(authHeaders(CLIENT_SECRET, CLIENT_ID, 'GET', path, ''))
      .expect(200);
    expect(res.body.sent).toBeGreaterThanOrEqual(1);
  });
});
