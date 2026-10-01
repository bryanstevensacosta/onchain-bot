import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContentTemplateRepository } from './domain/ports/content-template.repository';
import { TemplateBotRepository } from './domain/ports/template-bot.repository';
import { TemplateEncryptionService } from './application/services/template-encryption.service';
import { ContentTemplateUseCases } from './application/use-cases/content-template.use-cases';
import { TemplateBotUseCases } from './application/use-cases/template-bot.use-cases';
import { InMemoryContentTemplateRepository } from './infrastructure/repositories/in-memory-content-template.repository';
import { InMemoryTemplateBotRepository } from './infrastructure/repositories/in-memory-template-bot.repository';
import { ContentTemplatesController } from './api/http/content-templates.controller';
import { TemplateBotsController } from './api/http/template-bots.controller';
import { ContentTemplatesHealthIndicator } from './health/content-templates-health.indicator';

/**
 * ContentTemplatesModule (Tramo 2, todo 12, P33).
 *
 * Owns the reusable publishing-profile BC: `PublishingContentTemplate`
 * (eligible sources + keywords, OWN content filters, reusable GLOBAL
 * prompt-template ref, telegram/threads/both targets, own
 * queue+matching+scheduling toggles, one-shot + recurring scheduling
 * posts, DB bot bindings) + the P23-like `TemplateBot` catalog
 * (AES-256-GCM tokens via `ENCRYPTION_KEY`, redacted reads) + 2
 * frontend-backed controllers + `ContentTemplatesHealthIndicator`
 * (P21 hook). Live bindings are the in-memory adapters; the TypeORM
 * shape ships unwired (GAP-1). Exports the repositories + encryption
 * so the sessions BC resolves templates and bot tokens.
 */
@Module({
  imports: [ConfigModule],
  controllers: [ContentTemplatesController, TemplateBotsController],
  providers: [
    TemplateEncryptionService,
    ContentTemplateUseCases,
    TemplateBotUseCases,
    ContentTemplatesHealthIndicator,
    InMemoryContentTemplateRepository,
    InMemoryTemplateBotRepository,
    {
      provide: ContentTemplateRepository,
      useClass: InMemoryContentTemplateRepository,
    },
    {
      provide: TemplateBotRepository,
      useClass: InMemoryTemplateBotRepository,
    },
  ],
  exports: [
    ContentTemplateRepository,
    TemplateBotRepository,
    TemplateEncryptionService,
    ContentTemplateUseCases,
    TemplateBotUseCases,
    ContentTemplatesHealthIndicator,
  ],
})
export class ContentTemplatesModule {}
