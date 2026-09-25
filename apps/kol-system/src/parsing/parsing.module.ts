import { Module } from '@nestjs/common';
import { ParserPort } from './domain/ports/parser.port';
import { HeuristicParserAdapter } from './infrastructure/adapters/heuristic-parser.adapter';
import { ParsedCallRepository } from './application/ports/parsed-call.repository';
import { InMemoryParsedCallRepository } from './infrastructure/repositories/in-memory-parsed-call.repository';
import { ParseFromCandidatesUseCase } from './application/handlers/parse-from-candidates.use-case';
import { ParsingHealthIndicator } from './health/parsing-health.indicator';

/**
 * ParsingModule — structured call per mention (Tramo 1, todo 6, P5).
 *
 * `ParseFromCandidatesUseCase` runs as a DIRECT call (fix-1, no event bus):
 * one `ParsedCall` per extraction candidate (1:1, multi-tip never
 * collapses — override of the backend `ParsedContract.fromAddresses`
 * collapse-to-`addresses[0]`). Ticker is per-mention (candidate context
 * first, message-level heuristic fallback). Illegible candidates are
 * discarded with a warn log; the batch keeps going.
 */
@Module({
  providers: [
    ParseFromCandidatesUseCase,
    ParsingHealthIndicator,
    {
      provide: ParserPort,
      useClass: HeuristicParserAdapter,
    },
    {
      provide: ParsedCallRepository,
      useClass: InMemoryParsedCallRepository,
    },
  ],
  exports: [
    ParseFromCandidatesUseCase,
    ParsedCallRepository,
    ParsingHealthIndicator,
  ],
})
export class ParsingModule {}
