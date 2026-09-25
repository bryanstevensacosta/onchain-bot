import { Module } from '@nestjs/common';
import { KeywordRepository } from './application/ports/keyword.repository';
import { BlacklistPhraseRepository } from './application/ports/blacklist-phrase.repository';
import { AllowedKeywordMatcher } from './application/services/keyword-matcher.service';
import { BlacklistMatcher } from './application/services/blacklist-matcher.service';
import { PhraseRegistryService } from './application/services/phrase-registry.service';
import { KeywordUseCases } from './application/use-cases/keyword.use-cases';
import { BlacklistPhraseUseCases } from './application/use-cases/blacklist-phrase.use-cases';
import { InMemoryKeywordRepository } from './infrastructure/persistence/in-memory/in-memory-keyword.repository';
import { InMemoryBlacklistPhraseRepository } from './infrastructure/persistence/in-memory/in-memory-blacklist-phrase.repository';
import { KeywordsController } from './api/http/keywords.controller';
import { BlacklistController } from './api/http/blacklist.controller';
import { KeywordsHealthIndicator } from './health/keywords-health.indicator';

/**
 * KeywordsModule (Tramo 2, todo 3).
 *
 * Owns allowed keywords + blacklist phrases + OR/AND-group evaluators +
 * CRUD use-cases. TypeORM entities/repos ship unwired (GAP-1); the live
 * bindings are the in-memory adapters. Exports the repositories and
 * matchers for the matching module.
 */
@Module({
  controllers: [KeywordsController, BlacklistController],
  providers: [
    AllowedKeywordMatcher,
    BlacklistMatcher,
    PhraseRegistryService,
    KeywordUseCases,
    BlacklistPhraseUseCases,
    KeywordsHealthIndicator,
    {
      provide: KeywordRepository,
      useClass: InMemoryKeywordRepository,
    },
    {
      provide: BlacklistPhraseRepository,
      useClass: InMemoryBlacklistPhraseRepository,
    },
  ],
  exports: [
    KeywordRepository,
    BlacklistPhraseRepository,
    AllowedKeywordMatcher,
    BlacklistMatcher,
    PhraseRegistryService,
    KeywordUseCases,
    BlacklistPhraseUseCases,
    KeywordsHealthIndicator,
  ],
})
export class KeywordsModule {}
