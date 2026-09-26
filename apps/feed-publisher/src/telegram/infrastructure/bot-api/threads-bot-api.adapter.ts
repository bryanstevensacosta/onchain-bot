import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseBotApiAdapter } from './base-bot-api.adapter';
import { BotApiHttpClient } from './bot-api-http-client';
import {
  TelegramRateLimiter,
  resolveRateLimit,
} from '../../application/services/telegram-rate-limiter.service';

/**
 * Bot API publisher for the threads feed bot (NEW, Tramo 2 todo 7).
 *
 * Same send semantics as the crypto adapter, separate identity:
 * `THREADS_BOT_TOKEN` + `THREADS_OUTPUT_CHANNEL`, with its OWN
 * rate-limit budget (`THREADS_RATE_LIMIT_PER_MINUTE` falling back to
 * `TELEGRAM_RATE_LIMIT_PER_MINUTE`) so one bot can never starve the
 * other.
 *
 * @deprecated Dual-leg only (telegram-bots-gateway todo 5): prefer the
 * gateway path (`FEED_PUBLISH_MODE=gateway`, vault id
 * `env:THREADS_BOT_TOKEN`). Removed at the global cutover
 * (gateway todo 7). Do not extend.
 */
@Injectable()
export class ThreadsBotApiAdapter extends BaseBotApiAdapter {
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
            config.get<string>('THREADS_RATE_LIMIT_PER_MINUTE'),
            config.get<string>('TELEGRAM_RATE_LIMIT_PER_MINUTE'),
          ),
        ),
      'THREADS_BOT_TOKEN',
      'THREADS_OUTPUT_CHANNEL',
    );
  }
}
