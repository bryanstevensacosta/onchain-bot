import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module';
import { ApprovalModule } from '../approval/approval.module';
import { PublishingJobRepository } from './application/ports/publishing-job.repository';
import { InMemoryPublishingJobRepository } from './infrastructure/repositories/in-memory-publishing-job.repository';
import { TelegramPublisherPort } from './domain/ports/telegram-publisher.port';
import { MultiBotPublisherAdapter } from './infrastructure/telegram/multi-bot-publisher.adapter';
import { BotTokenResolverPort } from './domain/ports/bot-token-resolver.port';
import { BotTokenResolverAdapter } from './infrastructure/security/bot-token-resolver.adapter';
import { VipMessageFormatter } from './infrastructure/formatters/vip-message-formatter';
import { PublishFromTemplateUseCase } from './application/use-cases/publish-from-template.use-case';
import { ManualPublishUseCase } from './application/use-cases/manual-publish.use-case';
import { PublishingController } from './api/http/publishing.controller';
import { TelegramHealthIndicator } from './health/telegram-health.indicator';

/**
 * TelegramModule — per-template KOL-bot publishing (Tramo 1, todo 11,
 * Ph11 + C2 + first C-SHARED-01 move).
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
 */
@Module({
  imports: [TemplatesModule, ApprovalModule],
  controllers: [PublishingController],
  providers: [
    PublishFromTemplateUseCase,
    ManualPublishUseCase,
    VipMessageFormatter,
    TelegramHealthIndicator,
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
  ],
  exports: [
    PublishFromTemplateUseCase,
    ManualPublishUseCase,
    PublishingJobRepository,
    TelegramPublisherPort,
    BotTokenResolverPort,
    TelegramHealthIndicator,
  ],
})
export class TelegramModule {}
