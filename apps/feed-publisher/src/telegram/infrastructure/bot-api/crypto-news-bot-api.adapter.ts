import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseBotApiAdapter } from './base-bot-api.adapter';
import { BotApiHttpClient } from './bot-api-http-client';
import {
  TelegramRateLimiter,
  resolveRateLimit,
} from '../../application/services/telegram-rate-limiter.service';

/**
 * Bot API publisher for the crypto-news feed bot (moved read-only
 * from the backend `BotApiCryptoNewsPublisherAdapter`, Tramo 2 todo 7
 * — second C-SHARED-01/C2 move).
 *
 * Identity: `CRYPTO_NEWS_BOT_TOKEN` + `CRYPTO_NEWS_OUTPUT_CHANNEL`
 * (explicit chatId, e.g. the DB-backed `LlmConfig.targetChannel`,
 * always wins over the env default). Own rate-limit budget via
 * `CRYPTO_NEWS_RATE_LIMIT_PER_MINUTE` falling back to
 * `TELEGRAM_RATE_LIMIT_PER_MINUTE`.
 */
@Injectable()
export class CryptoNewsBotApiAdapter extends BaseBotApiAdapter {
  public constructor(
    config: ConfigService,
    http: BotApiHttpClient,
    @Optional() limiter?: TelegramRateLimiter,
  ) {
    super(
      config,
      http,
      limiter ??
        new TelegramRateLimiter(
          resolveRateLimit(
            config.get<string>('CRYPTO_NEWS_RATE_LIMIT_PER_MINUTE'),
            config.get<string>('TELEGRAM_RATE_LIMIT_PER_MINUTE'),
          ),
        ),
      'CRYPTO_NEWS_BOT_TOKEN',
      'CRYPTO_NEWS_OUTPUT_CHANNEL',
    );
  }
}
