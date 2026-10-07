import {
  parseRetryAfterMs,
  RetryableProviderError,
  throwIfRetryableProviderError,
  toRetryableProviderError,
} from './retryable-provider.error';

function axiosError(
  status: number | undefined,
  headers: Record<string, unknown> = {},
  code?: string,
): unknown {
  return {
    isAxiosError: true,
    code,
    response:
      status === undefined
        ? undefined
        : { status, headers, data: { status: { error_code: status } } },
  };
}

describe('parseRetryAfterMs (header format: seconds or HTTP-date)', () => {
  it('parses delay-seconds to ms', () => {
    expect(parseRetryAfterMs('0')).toBe(0);
    expect(parseRetryAfterMs('120')).toBe(120_000);
    expect(parseRetryAfterMs(2)).toBe(2_000);
  });

  it('parses an HTTP-date to the delta from now', () => {
    const future = new Date(Date.now() + 60_000).toUTCString();
    const parsed = parseRetryAfterMs(future);
    expect(parsed).not.toBeNull();
    expect(parsed as number).toBeGreaterThan(0);
    expect(parsed as number).toBeLessThanOrEqual(60_000);
  });

  it('returns null for absent / empty / negative / garbage', () => {
    expect(parseRetryAfterMs(undefined)).toBeNull();
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs('')).toBeNull();
    expect(parseRetryAfterMs('   ')).toBeNull();
    expect(parseRetryAfterMs('-5')).toBeNull();
    expect(parseRetryAfterMs('soon-ish')).toBeNull();
    expect(parseRetryAfterMs({})).toBeNull();
  });
});

describe('toRetryableProviderError (closed retryable taxonomy)', () => {
  it('retries 429 WITH a parseable Retry-After (live GeckoTerminal shape)', () => {
    const err = toRetryableProviderError(
      axiosError(429, { 'retry-after': '0' }),
      'geckoterminal',
    );
    expect(err).toBeInstanceOf(RetryableProviderError);
    expect(err?.kind).toBe('rate-limited');
    expect(err?.status).toBe(429);
    expect(err?.retryAfterMs).toBe(0);
  });

  it('retries 429 with a 120s header (cap applied downstream, not here)', () => {
    const err = toRetryableProviderError(
      axiosError(429, { 'Retry-After': '120' }),
      'dexscreener',
    );
    expect(err?.retryAfterMs).toBe(120_000);
  });

  it('NEVER retries 429 WITHOUT the header', () => {
    expect(toRetryableProviderError(axiosError(429, {}), 'dex')).toBeNull();
  });

  it('NEVER retries 429 with a garbage header', () => {
    expect(
      toRetryableProviderError(
        axiosError(429, { 'retry-after': 'later' }),
        'd',
      ),
    ).toBeNull();
  });

  it('retries 5xx (header parsed when present, else zero wait)', () => {
    const withHeader = toRetryableProviderError(
      axiosError(503, { 'retry-after': '5' }),
      'birdeye',
    );
    expect(withHeader?.kind).toBe('server');
    expect(withHeader?.retryAfterMs).toBe(5_000);
    const bare = toRetryableProviderError(axiosError(500, {}), 'birdeye');
    expect(bare?.kind).toBe('server');
    expect(bare?.retryAfterMs).toBe(0);
  });

  it('retries axios timeouts (ECONNABORTED / ETIMEDOUT, no response)', () => {
    for (const code of ['ECONNABORTED', 'ETIMEDOUT']) {
      const err = toRetryableProviderError(
        { isAxiosError: true, code, response: undefined },
        'mobula',
      );
      expect(err?.kind).toBe('timeout');
      expect(err?.retryAfterMs).toBe(0);
    }
  });

  it('NEVER retries 404 / 4xx (absence, not transient)', () => {
    for (const status of [400, 401, 403, 404]) {
      expect(
        toRetryableProviderError(axiosError(status, {}), 'moralis'),
      ).toBeNull();
    }
  });

  it('NEVER retries non-axios throws (opaque lib errors, gate deny, bugs)', () => {
    expect(toRetryableProviderError(new Error('down'), 'rugcheck')).toBeNull();
    expect(
      toRetryableProviderError(
        new Error(
          'rugcheck outbound budget exceeded (60/min, cost 1) — skipped, fail-open',
        ),
        'rugcheck',
      ),
    ).toBeNull();
    expect(toRetryableProviderError(null, 'x')).toBeNull();
    expect(toRetryableProviderError('boom', 'x')).toBeNull();
  });
});

describe('throwIfRetryableProviderError (adapter catch one-liner)', () => {
  it('throws the typed error when retryable, returns void otherwise', () => {
    expect(() =>
      throwIfRetryableProviderError(axiosError(503, {}), 'coingecko'),
    ).toThrow(RetryableProviderError);
    expect(() =>
      throwIfRetryableProviderError(axiosError(404, {}), 'coingecko'),
    ).not.toThrow();
    expect(() =>
      throwIfRetryableProviderError(new Error('down'), 'coingecko'),
    ).not.toThrow();
  });
});
