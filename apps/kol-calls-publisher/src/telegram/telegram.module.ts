import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module';
import { ApprovalModule } from '../approval/approval.module';
import { PublishingJobRepository } from './application/ports/publishing-job.repository';
import { InMemoryPublishingJobRepository } from './infrastructure/repositories/in-memory-publishing-job.repository';
import { TelegramPublisherPort } from './domain/ports/telegram-publisher.port';
import { MultiBotPublisherAdapter } from './infrastructure/telegram/multi-bot-publisher.adapter';
import { BotTokenResolverPort } from './domain/ports/bot-token-resolver.port';
import { BotTokenResolverAdapter } from './infrastructure/security/bot-token-resolver.adapter';
import { BotsGatewaySenderPort } from './domain/ports/bots-gateway-sender.port';
import { GatewayHmacSigner } from './infrastructure/gateway/gateway-hmac-signer.service';
import { GatewaySendClient } from './infrastructure/gateway/gateway-send-client.service';
import { GatewayBotMappingService } from './infrastructure/gateway/gateway-bot-mapping.service';
import { DualSendParityService } from './application/services/dual-send-parity.service';
import { MigrateBotsToGatewayUseCase } from './application/use-cases/migrate-bots-to-gateway.use-case';
import { VipMessageFormatter } from './infrastructure/formatters/vip-message-formatter';
import { PublishFromTemplateUseCase } from './application/use-cases/publish-from-template.use-case';
import { ManualPublishUseCase } from './application/use-cases/manual-publish.use-case';
import { PublishAuditLogService } from './application/services/publish-audit-log.service';
import { PublishRateLimitService } from './application/services/publish-rate-limit.service';
import { PublishingController } from './api/http/publishing.controller';
import { GatewayMigrationController } from './api/http/gateway-migration.controller';
import { TelegramHealthIndicator } from './health/telegram-health.indicator';

/**
 * TelegramModule — per-template KOL-bot publishing (Tramo 1, todo 11,
 * Ph11 + C2 + first C-SHARED-01 move; gateway routing todo 4).
 *
 * `PublishingJob` (ticker non-null by construction) +
 * `PublishFromTemplateUseCase` (template `canPublish()` gate, catalog token
 * per call, dashboard-only degradation) + `ManualPublishUseCase` (explicit
 * bot + channel) + `MultiBotPublisherAdapter` (moved KOL-bot sender: per-call
 * token, 1 msg/min per bot, 4096 chunks) + `VipMessageFormatter` (moved card
 * formatter). Tokens come ONLY from the `telegram_bots` catalog via
 * `BotTokenResolverPort` (P23 — no env token exists). Imports
 * `TemplatesModule` (template + bot repos, `EncryptionService`) and
 * `ApprovalModule` (rejected approvals block publishing).
 *
 * @deprecated Publishing cut over to the telegram-bots-gateway (todo 4):
 * prefer the gateway path (`KOL_PUBLISH_MODE=gateway`,
 * `BotsGatewaySenderPort` → `POST /api/bots/:id/send`, vault ids via
 * `POST /api/telegram-bots/migrate-to-gateway`). The direct adapter +
 * catalog resolver below stay wired ONLY for the `dual` parity leg and
 * are removed at the global cutover (gateway todo 7). Do not extend them.
 */
@Module({
  imports: [TemplatesModule, ApprovalModule],
  controllers: [PublishingController, GatewayMigrationController],
  providers: [
    PublishFromTemplateUseCase,
    ManualPublishUseCase,
    PublishAuditLogService,
    PublishRateLimitService,
    VipMessageFormatter,
    TelegramHealthIndicator,
    GatewayHmacSigner,
    GatewaySendClient,
    GatewayBotMappingService,
    DualSendParityService,
    MigrateBotsToGatewayUseCase,
    {
      provide: PublishingJobRepository,
      useClass: InMemoryPublishingJobRepository,
    },
    {
      provide: TelegramPublisherPort,
      useClass: MultiBotPublisherAdapter,
    },
    {
      provide: BotTokenResolverPort,
      useClass: BotTokenResolverAdapter,
    },
    {
      provide: BotsGatewaySenderPort,
      useClass: GatewaySendClient,
    },
  ],
  exports: [
    PublishFromTemplateUseCase,
    ManualPublishUseCase,
    PublishAuditLogService,
    PublishRateLimitService,
    PublishingJobRepository,
    TelegramPublisherPort,
    BotTokenResolverPort,
    BotsGatewaySenderPort,
    GatewayBotMappingService,
    DualSendParityService,
    MigrateBotsToGatewayUseCase,
    TelegramHealthIndicator,
  ],
})
export class TelegramModule {}
