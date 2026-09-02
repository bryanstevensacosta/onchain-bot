import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  onModuleInit(): void {
    const enabled = this.config.get<boolean>('app.redis.enabled');
    if (!enabled) {
      this.logger.warn('Redis is disabled - skipping connection');
      return;
    }

    const host = this.config.get<string>('app.redis.host', 'localhost');
    const port = this.config.get<number>('app.redis.port', 6379);
    const password = this.config.get<string>('app.redis.password');
    const db = this.config.get<number>('app.redis.db', 0);

    this.client = new Redis({
      host,
      port,
      password: password || undefined,
      db,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null; // stop retrying
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    this.client.on('error', (err: Error) => {
      this.logger.warn(`Connection error: ${err.message}`);
    });

    this.client.on('ready', () => {
      this.logger.log(`Connected to ${host}:${port} db=${db}`);
    });

    this.client.connect().catch((err: Error) => {
      this.logger.error(`Initial connection failed: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  getClient(): Redis {
    if (!this.client) {
      throw new Error(
        'Redis client not initialized (disabled or not connected)',
      );
    }
    return this.client;
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  // Convenience methods for common operations
  async get(key: string): Promise<string | null> {
    return this.getClient().get(key);
  }

  async set(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<'OK' | null> {
    if (ttlSeconds) {
      return this.getClient().set(key, value, 'EX', ttlSeconds);
    }
    return this.getClient().set(key, value);
  }

  async del(key: string): Promise<number> {
    return this.getClient().del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.getClient().exists(key);
    return result === 1;
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.getClient().expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    return this.getClient().ttl(key);
  }

  async setnx(key: string, value: string): Promise<boolean> {
    const result = await this.getClient().setnx(key, value);
    return result === 1;
  }
}
