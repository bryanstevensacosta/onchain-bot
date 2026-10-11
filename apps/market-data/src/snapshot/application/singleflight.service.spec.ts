import {
  SINGLEFLIGHT_MAX_KEYS,
  SINGLEFLIGHT_TIMEOUT_MS_DEFAULT,
  SingleflightService,
  resolveSingleflightTimeoutMs,
} from './singleflight.service';

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (err: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('SingleflightService (plan todo 41a)', () => {
  it('collapses N concurrent same-key calls into ONE upstream run', async () => {
    const service = new SingleflightService();
    const upstream = jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { price: 1.5 };
    });
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        service.run('snapshot:solana:abc:token', upstream),
      ),
    );
    expect(upstream).toHaveBeenCalledTimes(1);
    for (const result of results) {
      expect(result).toEqual({ price: 1.5 });
    }
    expect(service.size()).toBe(0);
  });

  it('cleans the key on throw (a poisoned leader never wedges followers)', async () => {
    const service = new SingleflightService();
    const failing = jest.fn(async (): Promise<string> => {
      throw new Error('provider down');
    });
    await expect(
      service.run('snapshot:solana:abc:token', failing),
    ).rejects.toThrow('provider down');
    expect(service.size()).toBe(0);
    const recovery = jest.fn(async () => 'recovered');
    await expect(
      service.run('snapshot:solana:abc:token', recovery),
    ).resolves.toBe('recovered');
    expect(recovery).toHaveBeenCalledTimes(1);
  });

  it('cleans the key on synchronous throw too', async () => {
    const service = new SingleflightService();
    const syncThrow = jest.fn((): Promise<string> => {
      throw new Error('sync boom');
    });
    await expect(service.run('k', syncThrow)).rejects.toThrow('sync boom');
    expect(service.size()).toBe(0);
  });

  it('rejects slow adherents on its own timeout without poisoning the key', async () => {
    process.env['SNAPSHOT_SINGLEFLIGHT_TIMEOUT_MS'] = '25';
    const service = new SingleflightService();
    try {
      const leader = deferred<string>();
      const leaderFn = jest.fn(() => leader.promise);
      const adherent = service.run('snapshot:solana:slow:token', leaderFn);
      await expect(adherent).rejects.toThrow(/singleflight timeout/);
      expect(service.size()).toBe(0);
      // Late leader success does NOT resurrect the key (no poison):
      // the next caller re-runs upstream and warms whoever is next.
      leader.resolve('late-success');
      await leader.promise;
      const next = jest.fn(async () => 'fresh-run');
      await expect(
        service.run('snapshot:solana:slow:token', next),
      ).resolves.toBe('fresh-run');
      expect(next).toHaveBeenCalledTimes(1);
      expect(leaderFn).toHaveBeenCalledTimes(1);
    } finally {
      delete process.env['SNAPSHOT_SINGLEFLIGHT_TIMEOUT_MS'];
    }
  });

  it('bounds cardinality under enumeration (cap 1000, oldest evicted first)', async () => {
    const service = new SingleflightService();
    const gates = new Map<string, (value: string) => void>();
    const firstFn = jest.fn(() => {
      const gate = deferred<string>();
      gates.set('key-0', gate.resolve);
      return gate.promise;
    });
    const first = service.run('key-0', firstFn);
    // Fill past the cap with deferred leaders (none settle).
    const rest: Array<Promise<string>> = [];
    for (let i = 1; i <= SINGLEFLIGHT_MAX_KEYS; i += 1) {
      const gate = deferred<string>();
      gates.set(`key-${i}`, gate.resolve);
      const key = `key-${i}`;
      rest.push(service.run(key, () => gate.promise));
    }
    expect(service.size()).toBeLessThanOrEqual(SINGLEFLIGHT_MAX_KEYS);
    // `key-0` was evicted as oldest: a new call re-runs upstream.
    const retryFn = jest.fn(async () => 'key-0-rerun');
    const retry = service.run('key-0', retryFn);
    expect(firstFn).toHaveBeenCalledTimes(1);
    // Release everything; every caller (evicted or not) settles.
    for (const [, resolve] of gates) {
      resolve('served');
    }
    await expect(first).resolves.toBe('served');
    await expect(retry).resolves.toBe('key-0-rerun');
    await expect(Promise.all(rest)).resolves.toHaveLength(
      SINGLEFLIGHT_MAX_KEYS,
    );
    expect(service.size()).toBe(0);
  });

  it('pins the timeout default + resolver fallbacks', () => {
    expect(SINGLEFLIGHT_TIMEOUT_MS_DEFAULT).toBe(15_000);
    expect(resolveSingleflightTimeoutMs(undefined)).toBe(
      SINGLEFLIGHT_TIMEOUT_MS_DEFAULT,
    );
    expect(resolveSingleflightTimeoutMs('')).toBe(
      SINGLEFLIGHT_TIMEOUT_MS_DEFAULT,
    );
    expect(resolveSingleflightTimeoutMs('garbage')).toBe(
      SINGLEFLIGHT_TIMEOUT_MS_DEFAULT,
    );
    expect(resolveSingleflightTimeoutMs('-5')).toBe(
      SINGLEFLIGHT_TIMEOUT_MS_DEFAULT,
    );
    expect(resolveSingleflightTimeoutMs('5000')).toBe(5000);
  });
});
