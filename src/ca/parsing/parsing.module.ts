import { Module } from '@nestjs/common';
import { ParserPort } from 'ca/parsing/domain/ports/parser.port';
import { ParsingEventPublisher } from 'ca/parsing/application/ports/parsing-event.publisher';
import { TokenCallRepository } from 'ca/parsing/application/ports/token-call.repository';
import { ParseFromCandidatesUseCase } from 'ca/parsing/application/handlers/parse-from-candidates.use-case';
import { GetTokenCallUseCase } from 'ca/parsing/application/handlers/get-token-call.use-case';
import { GetRecentCallsUseCase } from 'ca/parsing/application/handlers/get-recent-calls.use-case';
import { HeuristicParserAdapter } from 'ca/parsing/infrastructure/adapters/heuristic-parser.adapter';
import { InProcessParsingEventPublisher } from 'ca/parsing/infrastructure/messaging/in-process-parsing-event.publisher';
import { InMemoryTokenCallRepository } from 'ca/parsing/infrastructure/repositories/in-memory-token-call.repository';
import { CandidatesExtractedHandler } from 'ca/parsing/infrastructure/event-bus/candidates-extracted.handler';
import { ParsingController } from 'ca/parsing/api/http/parsing.controller';

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
