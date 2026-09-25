import { Module } from '@nestjs/common';
import { ExtractorPort } from './domain/ports/extractor.port';
import { RegexExtractorAdapter } from './infrastructure/adapters/regex-extractor.adapter';
import { ExtractionCandidateRepository } from './application/ports/extraction-candidate.repository';
import { InMemoryExtractionCandidateRepository } from './infrastructure/repositories/in-memory-extraction-candidate.repository';
import { ExtractFromMessageUseCase } from './application/handlers/extract-from-message.use-case';
import { ExtractionHealthIndicator } from './health/extraction-health.indicator';

/**
 * ExtractionModule — contract x mention (Tramo 1, todo 5, P5 + P26).
 *
 * `ExtractFromMessageUseCase` runs as a DIRECT call (fix-1, no event bus):
 * one `ExtractionCandidate` per contract occurrence (multi-tip never
 * collapses, repeats valid), each emitting a P26 snapshot base handed
 * directly to enrichment via the use-case return value.
 */
@Module({
  providers: [
    ExtractFromMessageUseCase,
    ExtractionHealthIndicator,
    {
      provide: ExtractorPort,
      useClass: RegexExtractorAdapter,
    },
    {
      provide: ExtractionCandidateRepository,
      useClass: InMemoryExtractionCandidateRepository,
    },
  ],
  exports: [
    ExtractFromMessageUseCase,
    ExtractionCandidateRepository,
    ExtractionHealthIndicator,
  ],
})
export class ExtractionModule {}
