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

/**
 * Redis connection state for circuit breaker
 */
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * RedisService - Robust Redis client with auto-reconnection and circuit breaker
 *
 * Features:
 * - Auto-reconnection with exponential backoff (1s → 30s cap)
 * - Circuit breaker: opens after 5 consecutive failures
 * - Graceful degradation: continues operating without Redis
 * - Operation retry: 3 attempts with 200ms delay
 * - Health monitoring: tracks connection state
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private enabled = false;
  private circuitState = CircuitState.CLOSED;
  private consecutiveFailures = 0;
  private readonly MAX_FAILURES = 5;
  private readonly RECOVERY_TIMEOUT_MS = 60_000;
  private recoveryTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_DELAY = 30_000;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.enabled = this.config.get<boolean>('app.redis.enabled', true);

    if (!this.enabled) {
      this.logger.warn(
        'Redis is disabled - operating in degraded mode (in-memory only)',
      );
      return;
    }

    this.initializeClient();
  }

  private initializeClient(): void {
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
      enableReadyCheck: true,
      enableOfflineQueue: true,
      connectTimeout: 10_000,
      commandTimeout: 5_000,
      retryStrategy: (times: number) => {
        const delay = Math.min(
          Math.pow(2, times - 1) * 1000,
          this.MAX_RECONNECT_DELAY,
        );
        this.reconnectAttempts = times;
        this.logger.log(
          `[REDIS-RECONNECT] Attempt ${times}, reconnecting in ${delay}ms`,
        );
        return delay;
      },
      lazyConnect: true,
    });

    this.client.on('error', (err: Error) => {
      this.logger.error(`[REDIS-ERROR] ${err.message}`);
      this.recordFailure();
    });

    this.client.on('ready', () => {
      this.reconnectAttempts = 0;
      this.consecutiveFailures = 0;
      this.circuitState = CircuitState.CLOSED;
      this.logger.log(
        `[REDIS-CONNECTED] Connected to ${host}:${port} db=${db}`,
      );

      if (this.recoveryTimer) {
        clearInterval(this.recoveryTimer);
        this.recoveryTimer = null;
      }
    });

    this.client.on('close', () => {
      this.logger.warn('[REDIS-DISCONNECTED] Connection closed');
    });

    this.client.on('reconnecting', (timeToReconnect: number) => {
      this.logger.log(
        `[REDIS-RECONNECTING] Reconnecting in ${timeToReconnect}ms`,
      );
    });

    this.client.on('end', () => {
      this.logger.warn('[REDIS-END] Connection ended permanently');
    });

    this.client.connect().catch((err: Error) => {
      this.logger.error(
        `[REDIS-INIT-FAILED] Initial connection failed: ${err.message}`,
      );
      this.recordFailure();
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = null;
    }

    if (this.client) {
      try {
        await this.client.quit();
      } catch (err) {
        this.logger.warn(
          `Graceful shutdown failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      this.client = null;
    }
  }

  private recordFailure(): void {
    this.consecutiveFailures++;

    if (
      this.consecutiveFailures >= this.MAX_FAILURES &&
      this.circuitState === CircuitState.CLOSED
    ) {
      this.circuitState = CircuitState.OPEN;
      this.logger.error(
        `[REDIS-CIRCUIT-OPEN] Circuit breaker opened after ${this.MAX_FAILURES} failures - degraded mode active`,
      );
      this.scheduleRecovery();
    }
  }

  private scheduleRecovery(): void {
    if (this.recoveryTimer) return;

    this.recoveryTimer = setInterval(() => {
      if (this.circuitState === CircuitState.OPEN) {
        this.logger.log('[REDIS-CIRCUIT-HALF-OPEN] Attempting recovery...');
        this.circuitState = CircuitState.HALF_OPEN;
        void this.testConnection();
      }
    }, this.RECOVERY_TIMEOUT_MS);
  }

  private async testConnection(): Promise<void> {
    if (!this.client) return;

    try {
      await this.client.ping();
      this.consecutiveFailures = 0;
      this.circuitState = CircuitState.CLOSED;
      this.logger.log(
        '[REDIS-CIRCUIT-CLOSED] Recovery successful - circuit closed',
      );

      if (this.recoveryTimer) {
        clearInterval(this.recoveryTimer);
        this.recoveryTimer = null;
      }
    } catch (err) {
      this.circuitState = CircuitState.OPEN;
      this.logger.warn('[REDIS-RECOVERY-FAILED] Recovery attempt failed');
    }
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries = 3,
  ): Promise<T | null> {
    if (this.circuitState === CircuitState.OPEN) {
      this.logger.debug(
        `[REDIS-CIRCUIT-OPEN] Operation ${operationName} skipped - circuit open`,
      );
      return null;
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();

        if (this.consecutiveFailures > 0) {
          this.consecutiveFailures = 0;
        }

        return result;
      } catch (err) {
        const isLastAttempt = attempt === maxRetries;

        if (isLastAttempt) {
          this.logger.warn(
            `[REDIS-OPERATION-FAILED] ${operationName} failed after ${maxRetries} attempts: ${err instanceof Error ? err.message : String(err)}`,
          );
          this.recordFailure();
          return null;
        }

        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      }
    }

    return null;
  }

  isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  isAvailable(): boolean {
    return this.isEnabled() && this.circuitState !== CircuitState.OPEN;
  }

  getStatus(): {
    enabled: boolean;
    connected: boolean;
    circuit: string;
    failures: number;
    reconnectAttempts: number;
  } {
    return {
      enabled: this.enabled,
      connected: this.client?.status === 'ready',
      circuit: this.circuitState,
      failures: this.consecutiveFailures,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  getClient(): Redis {
    if (!this.client) {
      throw new Error(
        'Redis client not initialized (disabled or not connected)',
      );
    }
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    if (!this.isAvailable()) return null;
    return this.executeWithRetry(() => this.getClient().get(key), `get(${key})`);
  }

  async set(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<'OK' | null> {
    if (!this.isAvailable()) return null;

    return this.executeWithRetry(() => {
      if (ttlSeconds) {
        return this.getClient().set(key, value, 'EX', ttlSeconds);
      }
      return this.getClient().set(key, value);
    }, `set(${key})`);
  }

  async del(key: string): Promise<number> {
    if (!this.isAvailable()) return 0;
    const result = await this.executeWithRetry(
      () => this.getClient().del(key),
      `del(${key})`,
    );
    return result ?? 0;
  }

  async exists(key: string): Promise<boolean> {
    if (!this.isAvailable()) return false;
    const result = await this.executeWithRetry(
      () => this.getClient().exists(key),
      `exists(${key})`,
    );
    return result === 1;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (!this.isAvailable()) return 0;
    const result = await this.executeWithRetry(
      () => this.getClient().expire(key, seconds),
      `expire(${key})`,
    );
    return result ?? 0;
  }

  async ttl(key: string): Promise<number> {
    if (!this.isAvailable()) return -2;
    const result = await this.executeWithRetry(
      () => this.getClient().ttl(key),
      `ttl(${key})`,
    );
    return result ?? -2;
  }

  async setnx(key: string, value: string): Promise<boolean> {
    if (!this.isAvailable()) return false;
    const result = await this.executeWithRetry(
      () => this.getClient().setnx(key, value),
      `setnx(${key})`,
    );
    return result === 1;
  }
}
