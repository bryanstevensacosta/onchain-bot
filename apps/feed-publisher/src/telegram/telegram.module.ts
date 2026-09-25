import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmModule } from '../llm/llm.module';
import { BotApiHttpClient } from './infrastructure/bot-api/bot-api-http-client';
import { CryptoNewsBotApiAdapter } from './infrastructure/bot-api/crypto-news-bot-api.adapter';
import { ThreadsBotApiAdapter } from './infrastructure/bot-api/threads-bot-api.adapter';
import { TelegramPublisherRouter } from './application/services/telegram-publisher-router.service';
import { TelegramQueuedArticleDispatcher } from './application/dispatch/telegram-queued-article.dispatcher';
import { TelegramScheduledAdDispatcher } from './application/dispatch/telegram-scheduled-ad.dispatcher';
import { TelegramHealthIndicator } from './health/telegram-health.indicator';

/**
 * TelegramModule (Tramo 2, todo 7 — second C-SHARED-01/C2 move).
 *
 * Owns the feed Bot API publishers: `CryptoNewsBotApiAdapter` (moved
 * read-only from the backend `BotApiCryptoNewsPublisherAdapter`) +
 * `ThreadsBotApiAdapter` (new, `THREADS_BOT_TOKEN`, same send
 * semantics, own rate budget) + `TelegramPublisherRouter` (routing by
 * `contentType` / scheduling target) + per-bot `TelegramRateLimiter`
 * budgets + the LIVE queue/scheduling dispatcher bindings + the
 * `TelegramHealthIndicator` P21 hook.
 *
 * P10: no legacy publisher, no KOL bot here — crypto + threads only.
 * Tokens stay OPTIONAL at boot (dashboard-only mode); every send
 * fails at CALL time with a clear `not configured` error, never at
 * construction. `LlmModule` is imported (forwardRef, cycle-safe) only
 * so the queue dispatcher can prefer the DB-backed
 * `LlmConfig.targetChannel`; the dependency is `@Optional()`, so the
 * module also compiles standalone.
 */
@Module({
  imports: [ConfigModule, forwardRef(() => LlmModule)],
  providers: [
    BotApiHttpClient,
    CryptoNewsBotApiAdapter,
    ThreadsBotApiAdapter,
    TelegramPublisherRouter,
    TelegramQueuedArticleDispatcher,
    TelegramScheduledAdDispatcher,
    TelegramHealthIndicator,
  ],
  exports: [
    CryptoNewsBotApiAdapter,
    ThreadsBotApiAdapter,
    TelegramPublisherRouter,
    TelegramQueuedArticleDispatcher,
    TelegramScheduledAdDispatcher,
    TelegramHealthIndicator,
  ],
})
export class TelegramModule {}
