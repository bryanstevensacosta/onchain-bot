import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ScoringModule } from '../scoring/scoring.module';
import { ApprovalModule } from '../approval/approval.module';
import { TemplateRepository } from './domain/ports/template.repository';
import { TelegramBotRepository } from './domain/ports/telegram-bot.repository';
import { TelegramAdminVerifierPort } from './domain/ports/telegram-admin-verifier.port';
import { SourceValidatorPort } from './domain/ports/source-validator.port';
import { RankingEngine } from './application/services/ranking-engine.service';
import { TemplateOrchestratorService } from './application/services/template-orchestrator.service';
import { TemplateSeedService } from './application/services/template-seed.service';
import { CreateTemplateUseCase } from './application/use-cases/create-template.use-case';
import { UpdateTemplateUseCase } from './application/use-cases/update-template.use-case';
import { SetTemplateSourcesUseCase } from './application/use-cases/set-template-sources.use-case';
import { ActivateTemplateUseCase } from './application/use-cases/activate-template.use-case';
import { GetTemplateRankingsUseCase } from './application/use-cases/get-template-rankings.use-case';
import { AssignTemplateChannelUseCase } from './application/use-cases/assign-template-channel.use-case';
import { CreateTelegramBotUseCase } from './application/use-cases/create-telegram-bot.use-case';
import {
  GetTelegramBotUseCase,
  ListTelegramBotsUseCase,
} from './application/use-cases/list-telegram-bots.use-case';
import {
  DeleteTelegramBotUseCase,
  UpdateTelegramBotUseCase,
} from './application/use-cases/update-telegram-bot.use-case';
import { InMemoryTemplateRepository } from './infrastructure/repositories/in-memory-template.repository';
import { InMemoryTelegramBotRepository } from './infrastructure/repositories/in-memory-telegram-bot.repository';
import { EncryptionService } from './infrastructure/security/encryption.service';
import { HttpTelegramAdminVerifierAdapter } from './infrastructure/telegram/http-telegram-admin-verifier.adapter';
import { HttpSourceValidatorAdapter } from './infrastructure/ingestion/http-source-validator.adapter';
import { TemplatesController } from './api/http/templates.controller';
import { TelegramBotsController } from './api/http/telegram-bots.controller';
import { ThreadsStubController } from './api/http/threads-stub.controller';
import { TemplatesHealthIndicator } from './health/templates-health.indicator';

/**
 * TemplatesModule — templates CORE without threads (Tramo 1, todo 10,
 * Ph9 + P6/P9/P14/P16/P22/P23/P23-bis + C1).
 *
 * `PublishingTemplate` aggregate (kolSourceIds P16, classification config
 * from todo 9, `threadConfig: null` always) + `TemplateOrchestratorService`
 * (cron 1 min, per-template fail-open) + `RankingEngine` (4 strategies) +
 * CRUD use-cases + `TemplatesController` (11 endpoints) + threads stub
 * (`.../threads/*` → 501) + `telegram_bots` catalog (AES-256-GCM tokens,
 * redacted reads, admin-verified channel targets) + `vip-calls` seed
 * (P14, dashboard-only). Imports `ScoringModule` for the shared
 * `ScoredCallRepository` (rankings read gate-passing mentions only) and
 * `ApprovalModule` (forwardRef — the pending-approvals endpoint delegates
 * to `GetPendingApprovalsUseCase`, todo 11). Exports `EncryptionService`
 * so the telegram publisher resolves catalog tokens (P23).
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    ScoringModule,
    forwardRef(() => ApprovalModule),
  ],
  controllers: [
    TemplatesController,
    TelegramBotsController,
    ThreadsStubController,
  ],
  providers: [
    RankingEngine,
    TemplateOrchestratorService,
    TemplateSeedService,
    CreateTemplateUseCase,
    UpdateTemplateUseCase,
    SetTemplateSourcesUseCase,
    ActivateTemplateUseCase,
    GetTemplateRankingsUseCase,
    AssignTemplateChannelUseCase,
    CreateTelegramBotUseCase,
    ListTelegramBotsUseCase,
    GetTelegramBotUseCase,
    UpdateTelegramBotUseCase,
    DeleteTelegramBotUseCase,
    EncryptionService,
    TemplatesHealthIndicator,
    {
      provide: TemplateRepository,
      useClass: InMemoryTemplateRepository,
    },
    {
      provide: TelegramBotRepository,
      useClass: InMemoryTelegramBotRepository,
    },
    {
      provide: TelegramAdminVerifierPort,
      useClass: HttpTelegramAdminVerifierAdapter,
    },
    {
      provide: SourceValidatorPort,
      useClass: HttpSourceValidatorAdapter,
    },
  ],
  exports: [
    TemplateRepository,
    TelegramBotRepository,
    EncryptionService,
    RankingEngine,
    TemplatesHealthIndicator,
  ],
})
export class TemplatesModule {}
