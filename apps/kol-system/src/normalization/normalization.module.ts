import { Module } from '@nestjs/common';
import { NormalizedMentionRepository } from './application/ports/normalized-mention.repository';
import { InMemoryNormalizedMentionRepository } from './infrastructure/repositories/in-memory-normalized-mention.repository';
import { NormalizeCallUseCase } from './application/handlers/normalize-call.use-case';
import { NormalizationHealthIndicator } from './health/normalization-health.indicator';

/**
 * NormalizationModule — mention index (Tramo 1, todo 7, P1 + G-12 + Ph6).
 *
 * `NormalizeCallUseCase` runs as a DIRECT call (fix-1, no event bus):
 * one `NormalizedMention` per parsed call, keyed
 * `(contract, kol, messageId)` — repeats are first-class rows, and one
 * `normalization.call.normalized` event is returned per mention (direct
 * return, no publisher). Illegible calls are discarded with a warn log;
 * the batch keeps going.
 */
@Module({
  providers: [
    NormalizeCallUseCase,
    NormalizationHealthIndicator,
    {
      provide: NormalizedMentionRepository,
      useClass: InMemoryNormalizedMentionRepository,
    },
  ],
  exports: [
    NormalizeCallUseCase,
    NormalizedMentionRepository,
    NormalizationHealthIndicator,
  ],
})
export class NormalizationModule {}
