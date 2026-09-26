import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmModule } from '../llm/llm.module';
import { ContentTemplatesModule } from '../template/content-templates.module';
import { BotApiHttpClient } from './infrastructure/bot-api/bot-api-http-client';
import { CryptoNewsBotApiAdapter } from './infrastructure/bot-api/crypto-news-bot-api.adapter';
import { ThreadsBotApiAdapter } from './infrastructure/bot-api/threads-bot-api.adapter';
import { TelegramPublisherRouter } from './application/services/telegram-publisher-router.service';
import { TelegramQueuedArticleDispatcher } from './application/dispatch/telegram-queued-article.dispatcher';
import { TelegramScheduledAdDispatcher } from './application/dispatch/telegram-scheduled-ad.dispatcher';
import { TelegramHealthIndicator } from './health/telegram-health.indicator';
import { BotsGatewaySenderPort } from './domain/ports/bots-gateway-sender.port';
import { GatewayHmacSigner } from './infrastructure/gateway/gateway-hmac-signer.service';
import { GatewaySendClient } from './infrastructure/gateway/gateway-send-client.service';
import { GatewayBotMappingService } from './infrastructure/gateway/gateway-bot-mapping.service';
import { DualSendParityService } from './application/services/dual-send-parity.service';
import { MigrateBotsToGatewayUseCase } from './application/use-cases/migrate-bots-to-gateway.use-case';
import { GatewayMigrationController } from './api/http/gateway-migration.controller';

/**
 * TelegramModule (Tramo 2, todo 7 — second C-SHARED-01/C2 move;
 * gateway routing telegram-bots-gateway todo 5).
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
 *
 * @deprecated Publishing cut over to the telegram-bots-gateway (todo 5):
 * prefer the gateway path (`FEED_PUBLISH_MODE=gateway`,
 * `BotsGatewaySenderPort` → `POST /api/bots/:id/send`, vault ids via
 * `POST /api/content-template-bots/migrate-to-gateway`). The direct
 * adapters below stay wired ONLY for the `dual` parity leg and are
 * removed at the global cutover (gateway todo 7). Do not extend them.
 */
@Module({
  imports: [ConfigModule, forwardRef(() => LlmModule), ContentTemplatesModule],
  controllers: [GatewayMigrationController],
  providers: [
    BotApiHttpClient,
    CryptoNewsBotApiAdapter,
    ThreadsBotApiAdapter,
    TelegramPublisherRouter,
    TelegramQueuedArticleDispatcher,
    TelegramScheduledAdDispatcher,
    TelegramHealthIndicator,
    GatewayHmacSigner,
    GatewaySendClient,
    GatewayBotMappingService,
    DualSendParityService,
    MigrateBotsToGatewayUseCase,
    {
      provide: BotsGatewaySenderPort,
      useClass: GatewaySendClient,
    },
  ],
  exports: [
    CryptoNewsBotApiAdapter,
    ThreadsBotApiAdapter,
    TelegramPublisherRouter,
    TelegramQueuedArticleDispatcher,
    TelegramScheduledAdDispatcher,
    TelegramHealthIndicator,
    BotsGatewaySenderPort,
    GatewayBotMappingService,
    DualSendParityService,
    MigrateBotsToGatewayUseCase,
  ],
})
export class TelegramModule {}
