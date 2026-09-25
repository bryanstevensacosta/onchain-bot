import { Reflector } from '@nestjs/core';
import {
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { RequireScope } from './require-scope.decorator';
import { ServiceAuthGuard } from './service-auth.guard';
import { ClientRegistryService } from '../../application/client-registry.service';
import { HmacService } from '../../application/hmac.service';
import { NonceStore } from '../../application/nonce-store';

const SECRET = 'kol-system-test-secret-abcdef123456';
const ADMIN_SECRET = 'ops-admin-test-secret-abcdef123456';

function contextFor(req: unknown, handler: () => unknown) {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
    getHandler: () => handler,
  } as unknown as Parameters<ServiceAuthGuard['canActivate']>[0];
}

function signedHeaders(
  hmac: HmacService,
  secret: string,
  opts: {
    method?: string;
    path?: string;
    timestamp?: string;
    nonce?: string;
    body?: string;
    clientId?: string;
  } = {},
) {
  const method = opts.method ?? 'POST';
  const path = opts.path ?? '/api/bots/bot1/send';
  const timestamp =
    opts.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = opts.nonce ?? `nonce-${Math.random().toString(36).slice(2)}`;
  const body = opts.body ?? '';
  const signature = hmac.sign(secret, method, path, timestamp, nonce, body);
  return {
    req: {
      method,
      path,
      body: body ? JSON.parse(body) : undefined,
      rawBody: Buffer.from(body, 'utf8'),
      headers: {
        'x-api-key': opts.clientId ?? 'kol-system',
        'x-timestamp': timestamp,
        'x-nonce': nonce,
        'x-signature': signature,
      },
    },
    timestamp,
    nonce,
    signature,
  };
}

describe('ServiceAuthGuard (todo 2, red)', () => {
  let registry: ClientRegistryService;
  let guard: ServiceAuthGuard;
  let hmac: HmacService;

  class SendEndpoint {
    @RequireScope('send')
    public send() {
      return 'ok';
    }
  }

  class AdminEndpoint {
    @RequireScope('admin')
    public admin() {
      return 'ok';
    }
  }

  beforeEach(() => {
    registry = new ClientRegistryService();
    registry.registerClient('kol-system', SECRET, ['send']);
    registry.registerClient('ops-admin', ADMIN_SECRET, ['admin']);
    hmac = new HmacService();
    guard = new ServiceAuthGuard(
      registry,
      hmac,
      new NonceStore(),
      new Reflector(),
      300,
    );
  });

  it('fails open when no clients are registered (keyless dev)', () => {
    const openGuard = new ServiceAuthGuard(
      new ClientRegistryService(),
      hmac,
      new NonceStore(),
      new Reflector(),
      300,
    );
    const ctx = contextFor(
      { method: 'POST', path: '/', headers: {}, body: undefined },
      new SendEndpoint().send,
    );
    expect(openGuard.canActivate(ctx)).toBe(true);
  });

  it('passes a valid signed send request and binds the client', () => {
    const { req } = signedHeaders(hmac, SECRET, {
      body: '{"text":"hi"}',
    });
    const ctx = contextFor(req, new SendEndpoint().send);
    expect(guard.canActivate(ctx)).toBe(true);
    expect((req as { gatewayClient?: unknown }).gatewayClient).toMatchObject({
      id: 'kol-system',
    });
  });

  it('rejects a bad signature with 401', () => {
    const { req } = signedHeaders(hmac, SECRET, {
      body: '{"text":"hi"}',
    });
    (req.headers as Record<string, string>)['x-signature'] =
      '0'.repeat(64);
    expect(() => guard.canActivate(contextFor(req, new SendEndpoint().send))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an expired timestamp with 401', () => {
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    const { req } = signedHeaders(hmac, SECRET, { timestamp: old });
    expect(() => guard.canActivate(contextFor(req, new SendEndpoint().send))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a reused nonce (replay attack) with 401', () => {
    const first = signedHeaders(hmac, SECRET, { nonce: 'replay-me-1' });
    expect(
      guard.canActivate(contextFor(first.req, new SendEndpoint().send)),
    ).toBe(true);
    const replay = signedHeaders(hmac, SECRET, { nonce: 'replay-me-1' });
    expect(() =>
      guard.canActivate(contextFor(replay.req, new SendEndpoint().send)),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a send-scoped key on an admin endpoint with 403', () => {
    const { req } = signedHeaders(hmac, SECRET, {
      path: '/api/vault/bots',
      method: 'POST',
    });
    expect(() =>
      guard.canActivate(contextFor(req, new AdminEndpoint().admin)),
    ).toThrow(ForbiddenException);
  });

  it('lets an admin key reach admin endpoints (admin implies send)', () => {
    const { req } = signedHeaders(hmac, ADMIN_SECRET, {
      clientId: 'ops-admin',
      path: '/api/vault/bots',
      method: 'POST',
    });
    expect(
      guard.canActivate(contextFor(req, new AdminEndpoint().admin)),
    ).toBe(true);
    const { req: sendReq } = signedHeaders(hmac, ADMIN_SECRET, {
      clientId: 'ops-admin',
      nonce: 'admin-send-1',
    });
    expect(
      guard.canActivate(contextFor(sendReq, new SendEndpoint().send)),
    ).toBe(true);
  });

  it('rejects an unknown client with 401', () => {
    const { req } = signedHeaders(hmac, SECRET, { clientId: 'ghost' });
    expect(() => guard.canActivate(contextFor(req, new SendEndpoint().send))).toThrow(
      UnauthorizedException,
    );
  });

  it('never logs keys, secrets or signatures', () => {
    const seen: string[] = [];
    const spy = jest
      .spyOn(console, 'log')
      .mockImplementation((...args: unknown[]) => {
        seen.push(args.map(String).join(' '));
      });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { req, signature } = signedHeaders(hmac, SECRET);
      guard.canActivate(contextFor(req, new SendEndpoint().send));
      expect(() =>
        guard.canActivate(contextFor(req, new SendEndpoint().send)),
      ).toThrow(UnauthorizedException);
      const dump = seen.join('\n');
      expect(dump).not.toContain(SECRET);
      expect(dump).not.toContain(signature);
    } finally {
      spy.mockRestore();
      warn.mockRestore();
      err.mockRestore();
    }
  });
});
