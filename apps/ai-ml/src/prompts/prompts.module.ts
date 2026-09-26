import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PromptTemplateRepository } from './domain/ports/prompt-template.repository';
import { InMemoryPromptTemplateRepository } from './infrastructure/persistence/in-memory/in-memory-prompt-template.repository';
import { LegacyFeedPromptSource } from './application/legacy-feed-prompt-source';
import { PromptCatalogService } from './application/prompt-catalog.service';
import { PromptsController } from './api/http/prompts.controller';

/**
 * PromptsModule (ai-ml, todo 1): versioned global prompt catalog.
 *
 * Any app references templates by name+version over HTTP
 * (`POST /api/prompts/resolve`); unknown names fall back to the
 * read-only feed-publisher migration snapshot until feed-publisher
 * todo 3 repoints it at this catalog. Live store is in-memory;
 * the TypeORM shape ships unwired (GAP-1 pattern).
 */
@Module({
  imports: [ConfigModule],
  controllers: [PromptsController],
  providers: [
    {
      provide: PromptTemplateRepository,
      useClass: InMemoryPromptTemplateRepository,
    },
    LegacyFeedPromptSource,
    PromptCatalogService,
  ],
  exports: [PromptTemplateRepository, PromptCatalogService],
})
export class PromptsModule {}
