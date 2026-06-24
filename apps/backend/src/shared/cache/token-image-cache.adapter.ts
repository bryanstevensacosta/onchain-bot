import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { LRUCache } from 'lru-cache';
import Redis from 'ioredis';

export const TOKEN_IMAGE_CACHE = Symbol('TOKEN_IMAGE_CACHE');
export const TOKEN_IMAGE_REDIS_NAMESPACE = 'token-image:';

const DEFAULT_LRU_MAX_ENTRIES = 1000;
const DEFAULT_LRU_TTL_MS = 5 * 60 * 1000;

export interface CachedTokenImage {
  readonly buffer: Buffer;
  readonly contentType: string;
}

export interface TokenImageCache {
  get(key: string): Promise<CachedTokenImage | null>;
  set(
    key: string,
    buffer: Buffer,
    contentType: string,
    ttlMs: number,
  ): Promise<void>;
  invalidate(prefix: string): Promise<void>;
}

@Injectable()
export class LruTokenImageCache implements TokenImageCache {
  private readonly cache = new LRUCache<string, CachedTokenImage>({
    max: DEFAULT_LRU_MAX_ENTRIES,
    ttl: DEFAULT_LRU_TTL_MS,
  });

  public async get(key: string): Promise<CachedTokenImage | null> {
    return this.cache.get(key) ?? null;
  }

  public async set(
    key: string,
    buffer: Buffer,
    contentType: string,
    ttlMs: number,
  ): Promise<void> {
    this.cache.set(key, { buffer, contentType }, { ttl: ttlMs });
  }

  public async invalidate(prefix: string): Promise<void> {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
}

@Injectable()
export class RedisTokenImageCache implements TokenImageCache, OnModuleDestroy {
  private readonly logger = new Logger(RedisTokenImageCache.name);
  private readonly redis: Redis;
  private readonly namespace: string;
  private readonly ownsConnection: boolean;

  constructor(redisOrUrl?: Redis | string) {
    this.namespace = TOKEN_IMAGE_REDIS_NAMESPACE;
    if (typeof redisOrUrl === 'string') {
      const url = redisOrUrl;
      this.redis = new Redis(url, { lazyConnect: false });
      this.ownsConnection = true;
    } else if (redisOrUrl && typeof redisOrUrl.on === 'function') {
      this.redis = redisOrUrl;
      this.ownsConnection = false;
    } else {
      const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
      this.redis = new Redis(url, { lazyConnect: false });
      this.ownsConnection = true;
    }
    this.redis.on('error', (err: Error) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });
  }

  public async get(key: string): Promise<CachedTokenImage | null> {
    const raw = await this.redis.get(this.fullKey(key));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as {
        buffer: string;
        contentType: string;
      };
      return {
        buffer: Buffer.from(parsed.buffer, 'base64'),
        contentType: parsed.contentType,
      };
    } catch (err) {
      this.logger.warn(
        `Failed to parse cached entry for key="${key}": ${(err as Error).message}`,
      );
      return null;
    }
  }

  public async set(
    key: string,
    buffer: Buffer,
    contentType: string,
    ttlMs: number,
  ): Promise<void> {
    const value = JSON.stringify({
      buffer: buffer.toString('base64'),
      contentType,
    });
    await this.redis.set(this.fullKey(key), value, 'PX', ttlMs);
  }

  public async invalidate(prefix: string): Promise<void> {
    const fullPrefix = this.fullKey(prefix);
    const stream = this.redis.scanStream({
      match: `${fullPrefix}*`,
      count: 100,
    });
    for await (const keys of stream) {
      const batch: ReadonlyArray<string> = Array.isArray(keys)
        ? (keys as string[])
        : [];
      if (batch.length > 0) {
        await this.redis.del(...batch);
      }
    }
  }

  public async onModuleDestroy(): Promise<void> {
    if (!this.ownsConnection) return;
    await this.redis.quit().catch((err: Error) => {
      this.logger.warn(`Error during Redis shutdown: ${err.message}`);
      this.redis.disconnect();
    });
  }

  private fullKey(key: string): string {
    return `${this.namespace}${key}`;
  }
}

export interface TokenImageCacheOptions {
  redisEnabled: boolean;
  redisUrl?: string;
}

export function resolveTokenImageCacheOptions(): TokenImageCacheOptions {
  const redisEnabled =
    (process.env.TOKEN_IMAGE_REDIS_ENABLED ?? 'false').toLowerCase() === 'true';
  const redisUrl = process.env.REDIS_URL;
  return {
    redisEnabled,
    redisUrl: redisUrl && redisUrl.length > 0 ? redisUrl : undefined,
  };
}

export function createTokenImageCache(
  options: TokenImageCacheOptions = resolveTokenImageCacheOptions(),
  redisFactory: (url: string) => RedisTokenImageCache = (url) =>
    new RedisTokenImageCache(url),
  lruFactory: () => LruTokenImageCache = () => new LruTokenImageCache(),
): TokenImageCache {
  const logger = new Logger('TokenImageCache');
  if (options.redisEnabled && options.redisUrl) {
    logger.log(`Using Redis cache for token images (url=${options.redisUrl})`);
    return redisFactory(options.redisUrl);
  }
  logger.log('Using in-memory LRU cache for token images');
  return lruFactory();
}

export const tokenImageCacheProvider = {
  provide: TOKEN_IMAGE_CACHE,
  useFactory: (): TokenImageCache => createTokenImageCache(),
};
