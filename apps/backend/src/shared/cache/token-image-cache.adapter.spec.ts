import { Readable } from 'stream';
import {
  createTokenImageCache,
  LruTokenImageCache,
  RedisTokenImageCache,
  resolveTokenImageCacheOptions,
} from './token-image-cache.adapter';

class FakeRedis {
  public readonly store = new Map<string, string>();
  public readonly setCalls: Array<{
    key: string;
    value: string;
    ttlMs: number;
  }> = [];
  public quitCalls = 0;
  public disconnectCalls = 0;
  public errorHandlers: Array<(err: Error) => void> = [];
  public scanResult: string[][] = [];

  public async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  public async set(
    key: string,
    value: string,
    _mode: 'PX',
    ttlMs: number,
  ): Promise<'OK'> {
    this.store.set(key, value);
    this.setCalls.push({ key, value, ttlMs });
    return 'OK';
  }

  public async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count += 1;
    }
    return count;
  }

  public scanStream(_opts: { match: string; count: number }): Readable {
    const batches = this.scanResult.length > 0 ? this.scanResult : [[]];
    return Readable.from(batches);
  }

  public on(event: 'error', handler: (err: Error) => void): this {
    if (event === 'error') this.errorHandlers.push(handler);
    return this;
  }

  public async quit(): Promise<'OK'> {
    this.quitCalls += 1;
    return 'OK';
  }

  public disconnect(): void {
    this.disconnectCalls += 1;
  }
}

describe('LruTokenImageCache', () => {
  let cache: LruTokenImageCache;

  beforeEach(() => {
    cache = new LruTokenImageCache();
  });

  it('returns null for missing keys', async () => {
    expect(await cache.get('missing')).toBeNull();
  });

  it('stores and retrieves a buffer + contentType', async () => {
    const buf = Buffer.from('png-data');
    await cache.set('k', buf, 'image/png', 60_000);
    const result = await cache.get('k');
    expect(result).not.toBeNull();
    expect(result?.contentType).toBe('image/png');
    expect(result?.buffer.equals(buf)).toBe(true);
  });

  it('invalidate() removes only entries matching the prefix', async () => {
    await cache.set(
      'eth:0xA:default:original',
      Buffer.from('a'),
      'image/png',
      60_000,
    );
    await cache.set(
      'eth:0xA:default:webp',
      Buffer.from('aw'),
      'image/webp',
      60_000,
    );
    await cache.set(
      'eth:0xB:default:original',
      Buffer.from('b'),
      'image/png',
      60_000,
    );

    await cache.invalidate('eth:0xA:');

    expect(await cache.get('eth:0xA:default:original')).toBeNull();
    expect(await cache.get('eth:0xA:default:webp')).toBeNull();
    const other = await cache.get('eth:0xB:default:original');
    expect(other?.buffer.toString()).toBe('b');
  });

  it('invalidate() with a prefix that matches nothing is a no-op', async () => {
    await cache.set('k', Buffer.from('x'), 'image/png', 60_000);
    await cache.invalidate('does-not-exist:');
    const result = await cache.get('k');
    expect(result?.buffer.toString()).toBe('x');
  });
});

describe('RedisTokenImageCache', () => {
  let fake: FakeRedis;
  let cache: RedisTokenImageCache;

  beforeEach(() => {
    fake = new FakeRedis();
    cache = new RedisTokenImageCache(fake as unknown as never);
  });

  it('returns null for missing keys', async () => {
    expect(await cache.get('missing')).toBeNull();
  });

  it('stores buffer as base64 inside a JSON envelope and roundtrips', async () => {
    const buf = Buffer.from('hello-bytes');
    await cache.set('eth:0xABC:default:original', buf, 'image/png', 60_000);

    expect(fake.setCalls).toHaveLength(1);
    const stored = fake.setCalls[0];
    expect(stored.key).toBe('token-image:eth:0xABC:default:original');
    expect(stored.ttlMs).toBe(60_000);
    const parsed = JSON.parse(stored.value) as {
      buffer: string;
      contentType: string;
    };
    expect(parsed.contentType).toBe('image/png');
    expect(Buffer.from(parsed.buffer, 'base64').toString()).toBe('hello-bytes');

    const result = await cache.get('eth:0xABC:default:original');
    expect(result?.contentType).toBe('image/png');
    expect(result?.buffer.toString()).toBe('hello-bytes');
  });

  it('returns null when stored payload is not valid JSON', async () => {
    fake.store.set('token-image:broken', 'not-json{');
    expect(await cache.get('broken')).toBeNull();
  });

  it('invalidate() scans with the full prefix and deletes matching keys', async () => {
    fake.store.set('token-image:eth:0xA:default:original', '{}');
    fake.store.set('token-image:eth:0xA:default:webp', '{}');
    fake.store.set('token-image:eth:0xB:default:original', '{}');
    fake.scanResult = [
      [
        'token-image:eth:0xA:default:original',
        'token-image:eth:0xA:default:webp',
      ],
    ];

    await cache.invalidate('eth:0xA:');

    expect(fake.store.has('token-image:eth:0xA:default:original')).toBe(false);
    expect(fake.store.has('token-image:eth:0xA:default:webp')).toBe(false);
    expect(fake.store.has('token-image:eth:0xB:default:original')).toBe(true);
  });

  it('invalidate() skips empty batches from scanStream', async () => {
    fake.scanResult = [[]];
    await expect(cache.invalidate('any:')).resolves.toBeUndefined();
  });

  it('onModuleDestroy() skips cleanup when the Redis instance was injected (not owned)', async () => {
    await cache.onModuleDestroy();
    expect(fake.quitCalls).toBe(0);
    expect(fake.disconnectCalls).toBe(0);
  });

  it('onModuleDestroy() calls redis.quit() when it owns the connection', async () => {
    const owningFake = new FakeRedis();
    const owningCache = new RedisTokenImageCache('redis://localhost:6379');
    (owningCache as unknown as { redis: FakeRedis }).redis = owningFake;
    await owningCache.onModuleDestroy();
    expect(owningFake.quitCalls).toBe(1);
    expect(owningFake.disconnectCalls).toBe(0);
  });

  it('onModuleDestroy() falls back to disconnect() when quit() rejects', async () => {
    const owningFake = new FakeRedis();
    owningFake.quit = async () => {
      throw new Error('shutdown error');
    };
    const owningCache = new RedisTokenImageCache('redis://localhost:6379');
    (owningCache as unknown as { redis: FakeRedis }).redis = owningFake;
    await owningCache.onModuleDestroy();
    expect(owningFake.disconnectCalls).toBe(1);
  });
});

describe('createTokenImageCache', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns LruTokenImageCache when redis flag is not set', () => {
    delete process.env.TOKEN_IMAGE_REDIS_ENABLED;
    delete process.env.REDIS_URL;
    expect(createTokenImageCache()).toBeInstanceOf(LruTokenImageCache);
  });

  it('returns LruTokenImageCache when redis flag is false', () => {
    process.env.TOKEN_IMAGE_REDIS_ENABLED = 'false';
    process.env.REDIS_URL = 'redis://localhost:6379';
    expect(createTokenImageCache()).toBeInstanceOf(LruTokenImageCache);
  });

  it('returns LruTokenImageCache when redis flag is true but REDIS_URL is missing', () => {
    process.env.TOKEN_IMAGE_REDIS_ENABLED = 'true';
    delete process.env.REDIS_URL;
    expect(createTokenImageCache()).toBeInstanceOf(LruTokenImageCache);
  });

  it('returns RedisTokenImageCache when redis flag is true and REDIS_URL is set', () => {
    process.env.TOKEN_IMAGE_REDIS_ENABLED = 'true';
    process.env.REDIS_URL = 'redis://localhost:6379';
    const fake = new FakeRedis();
    let capturedUrl: string | undefined;
    const cache = createTokenImageCache(
      { redisEnabled: true, redisUrl: 'redis://localhost:6379' },
      (url) => {
        capturedUrl = url;
        return new RedisTokenImageCache(fake as unknown as never);
      },
      () => new LruTokenImageCache(),
    );
    expect(cache).toBeInstanceOf(RedisTokenImageCache);
    expect(capturedUrl).toBe('redis://localhost:6379');
  });

  it('resolveTokenImageCacheOptions() reads env correctly', () => {
    process.env.TOKEN_IMAGE_REDIS_ENABLED = 'TRUE';
    process.env.REDIS_URL = 'redis://x:1';
    const opts = resolveTokenImageCacheOptions();
    expect(opts.redisEnabled).toBe(true);
    expect(opts.redisUrl).toBe('redis://x:1');

    process.env.TOKEN_IMAGE_REDIS_ENABLED = 'false';
    process.env.REDIS_URL = '';
    const opts2 = resolveTokenImageCacheOptions();
    expect(opts2.redisEnabled).toBe(false);
    expect(opts2.redisUrl).toBeUndefined();
  });
});
