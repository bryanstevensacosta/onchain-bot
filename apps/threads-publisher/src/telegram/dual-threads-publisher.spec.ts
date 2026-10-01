import { DualThreadsPublisher } from './dual-threads-publisher';
import { ThreadsApiPublisherAdapter } from 'threads/infrastructure/threads-api-publisher.adapter';
import { GatewaySendClient } from './gateway-send-client';
import { isTokenExpiringSoon } from 'threads/domain/threads-oauth-token.entity';

describe('dual-run + oauth', () => {
  const OLD = { ...process.env };

  afterEach(() => {
    process.env = { ...OLD };
    jest.restoreAllMocks();
  });

  it('direct mode returns the direct leg', async () => {
    process.env.THREADS_PUBLISH_MODE = 'direct';
    process.env.THREADS_ACCESS_TOKEN = '';
    const dual = new DualThreadsPublisher(
      new ThreadsApiPublisherAdapter({}),
      new GatewaySendClient(),
    );
    const res = await dual.publish({ text: 'hi' });
    expect(res.ok).toBe(false);
  });

  it('gateway mode fails closed without bot id', async () => {
    process.env.THREADS_PUBLISH_MODE = 'gateway';
    delete process.env.THREADS_GATEWAY_BOT_ID;
    const dual = new DualThreadsPublisher(
      new ThreadsApiPublisherAdapter({}),
      new GatewaySendClient(),
    );
    const res = await dual.publish({ text: 'hi' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch('THREADS_GATEWAY_BOT_ID');
    }
  });

  it('dual without bot id skips the gateway leg', async () => {
    process.env.THREADS_PUBLISH_MODE = 'dual';
    process.env.THREADS_ACCESS_TOKEN = '';
    delete process.env.THREADS_GATEWAY_BOT_ID;
    const dual = new DualThreadsPublisher(
      new ThreadsApiPublisherAdapter({}),
      new GatewaySendClient(),
    );
    const res = await dual.publish({ text: 'hi' });
    expect(res.ok).toBe(false);
    expect(dual.ledger).toHaveLength(1);
    expect(() => dual.assertNoDivergence()).not.toThrow();
  });

  it('flags expiring tokens', () => {
    const soon = {
      id: 1,
      accessToken: 'x',
      threadsUserId: 'me',
      obtainedAt: new Date(Date.now() - 55 * 24 * 3600 * 1000),
      expiresInS: 60 * 24 * 3600,
    };
    expect(isTokenExpiringSoon(soon)).toBe(true);
    const fresh = {
      ...soon,
      obtainedAt: new Date(),
    };
    expect(isTokenExpiringSoon(fresh)).toBe(false);
  });
});
