import { resolveThreadsPublishMode } from './publish-mode';
import { signGatewayRequest } from './gateway-hmac-signer';
import { ThreadsMatchingEvaluator } from 'threads/application/threads-matching.evaluator';
import { ThreadsKeyword } from 'threads/domain/threads-keyword.entity';
import { ThreadsBlacklistPhrase } from 'threads/domain/threads-blacklist-phrase.entity';

describe('gateway + matching', () => {
  it('defaults publish mode to dual', () => {
    expect(resolveThreadsPublishMode({})).toBe('dual');
    expect(resolveThreadsPublishMode({ THREADS_PUBLISH_MODE: 'gateway' })).toBe(
      'gateway',
    );
    expect(resolveThreadsPublishMode({ THREADS_PUBLISH_MODE: 'bogus' })).toBe(
      'dual',
    );
  });

  it('signs nothing in keyless dev', () => {
    expect(
      signGatewayRequest({
        method: 'POST',
        path: '/api/threads/publish',
        rawBody: '{}',
        clientId: '',
        clientSecret: '',
      }),
    ).toEqual({});
  });

  it('signs with HMAC when keyed', () => {
    const headers = signGatewayRequest({
      method: 'POST',
      path: '/api/threads/publish',
      rawBody: '{"a":1}',
      clientId: 'c1',
      clientSecret: 's1',
      ts: '1',
      nonce: 'n1',
    });
    expect(headers['x-signature']).toHaveLength(64);
  });

  it('matches keywords and blocks blacklist', () => {
    const evaluator = new ThreadsMatchingEvaluator();
    const ok = evaluator.evaluate({
      text: 'Bitcoin ETF news',
      keywords: [new ThreadsKeyword({ id: 'k1', phrase: 'bitcoin, etf' })],
      blacklist: [],
    });
    expect(ok.matched).toBe(true);
    const blocked = evaluator.evaluate({
      text: 'Bitcoin scam alert',
      keywords: [new ThreadsKeyword({ id: 'k1', phrase: 'bitcoin' })],
      blacklist: [new ThreadsBlacklistPhrase('b1', 'scam')],
    });
    expect(blocked.blocked).toBe(true);
  });
});
