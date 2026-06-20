import { Module } from '@nestjs/common';
import { ParserPort } from 'discovery/parsing/domain/ports/parser.port';
import { ParsingEventPublisher } from 'discovery/parsing/application/ports/parsing-event.publisher';
import { TokenCallRepository } from 'discovery/parsing/application/ports/token-call.repository';
import { ParseFromCandidatesUseCase } from 'discovery/parsing/application/handlers/parse-from-candidates.use-case';
import { GetTokenCallUseCase } from 'discovery/parsing/application/handlers/get-token-call.use-case';
import { GetRecentCallsUseCase } from 'discovery/parsing/application/handlers/get-recent-calls.use-case';
import { HeuristicParserAdapter } from 'discovery/parsing/infrastructure/adapters/heuristic-parser.adapter';
import { InProcessParsingEventPublisher } from 'discovery/parsing/infrastructure/messaging/in-process-parsing-event.publisher';
import { InMemoryTokenCallRepository } from 'discovery/parsing/infrastructure/repositories/in-memory-token-call.repository';
import { CandidatesExtractedHandler } from 'discovery/parsing/infrastructure/event-bus/candidates-extracted.handler';
import { ParsingController } from 'discovery/parsing/api/http/parsing.controller';

/**
 * Parsing BC module.
 *
 * Consumes: `extraction.candidates.extracted` events
 * Emits:    `parsing.call.parsed` events
 *
 * v1 uses heuristic parsing only. v2 will add an LLM fallback adapter.
 */
@Module({
  controllers: [ParsingController],
  providers: [
    ParseFromCandidatesUseCase,
    GetTokenCallUseCase,
    GetRecentCallsUseCase,
    CandidatesExtractedHandler,
    { provide: ParserPort, useClass: HeuristicParserAdapter },
    {
      provide: ParsingEventPublisher,
      useClass: InProcessParsingEventPublisher,
    },
    { provide: TokenCallRepository, useClass: InMemoryTokenCallRepository },
  ],
  exports: [ParserPort, ParsingEventPublisher, TokenCallRepository],
})
export class ParsingModule {}
