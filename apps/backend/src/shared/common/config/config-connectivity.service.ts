import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import { Redis } from 'ioredis';
import type { AppConfig } from './app.config';

@Injectable()
export class ConfigConnectivityService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ConfigConnectivityService.name);

  constructor(private readonly configService: ConfigService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.checkPostgres();
      await this.checkRedis();
      await this.checkTelegramBot('vipCalls');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Connectivity check failed unexpectedly: ${message}`);
    }
  }

  private async checkPostgres(): Promise<void> {
    const appConfig = this.configService.get<AppConfig>('app');
    if (!appConfig?.database?.enabled) {
      this.logger.debug('Postgres check skipped: database not enabled');
      return;
    }

    const { host, port, username, password, database } = appConfig.database;
    const client = new Client({
      host,
      port,
      user: username,
      password,
      database,
      connectionTimeoutMillis: 3000,
    });

    try {
      await client.connect();
      await client.query('SELECT 1');
      this.logger.log('Postgres connectivity check: OK');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Postgres unreachable: ${message}`);
    } finally {
      await client.end().catch(() => {
        // Ignore errors during cleanup
      });
    }
  }

  private async checkRedis(): Promise<void> {
    const appConfig = this.configService.get<AppConfig>('app');
    if (!appConfig?.redis?.enabled) {
      this.logger.debug('Redis check skipped: redis not enabled');
      return;
    }

    const { host, port, password, db } = appConfig.redis;
    const redis = new Redis({
      host,
      port,
      password: password || undefined,
      db,
      connectTimeout: 3000,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });

    try {
      await redis.connect();
      await redis.ping();
      this.logger.log('Redis connectivity check: OK');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Redis unreachable: ${message}`);
    } finally {
      try {
        redis.disconnect();
      } catch {
        // Ignore errors during cleanup
      }
    }
  }

  private async checkTelegramBot(
    key: 'vipCalls' | 'cryptoNews' | 'chainDexterBot' = 'vipCalls',
  ): Promise<void> {
    const appConfig = this.configService.get<AppConfig>('app');
    const botToken = appConfig?.publishing?.[key]?.botToken;

    if (!botToken) {
      this.logger.debug(
        `Telegram Bot API check skipped (${key}): no bot token configured`,
      );
      return;
    }

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/getMe`,
        { signal: AbortSignal.timeout(5000) },
      );

      if (response.ok) {
        const data = (await response.json()) as {
          ok: boolean;
          result?: { username?: string };
        };
        if (data.ok && data.result?.username) {
          this.logger.log(
            `Telegram Bot API: connected as @${data.result.username}`,
          );
        } else {
          this.logger.warn('Telegram Bot API: responded with !ok');
        }
      } else {
        const message = `HTTP ${response.status}`;
        this.logger.warn(`Telegram Bot API unreachable: ${message}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Telegram Bot API unreachable: ${message}`);
    }
  }
}
