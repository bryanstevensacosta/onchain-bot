import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { ParserPort } from 'token/intake/parsing/domain/ports/parser.port';
import { ParsingEventPublisher } from 'token/intake/parsing/application/ports/parsing-event.publisher';
import { TokenCallRepository } from 'token/intake/parsing/application/ports/token-call.repository';
import { ParseFromCandidatesUseCase } from 'token/intake/parsing/application/handlers/parse-from-candidates.use-case';
import { GetTokenCallUseCase } from 'token/intake/parsing/application/handlers/get-token-call.use-case';
import { GetRecentCallsUseCase } from 'token/intake/parsing/application/handlers/get-recent-calls.use-case';
import { HeuristicParserAdapter } from 'token/intake/parsing/infrastructure/adapters/heuristic-parser.adapter';
import { InProcessParsingEventPublisher } from 'token/intake/parsing/infrastructure/messaging/in-process-parsing-event.publisher';
import { InMemoryTokenCallRepository } from 'token/intake/parsing/infrastructure/repositories/in-memory-token-call.repository';
import { TokenCallEntity } from 'token/intake/parsing/infrastructure/persistence/typeorm/entities/token-call.entity';
import { TypeOrmTokenCallRepository } from 'token/intake/parsing/infrastructure/persistence/typeorm/repositories/typeorm-token-call.repository';
import { ParsingController } from 'token/intake/parsing/api/http/parsing.controller';

/**
 * Parsing BC module.
 *
 * Per fix-1: CandidatesExtractedHandler was removed. The use case is
 * invoked via direct call from StartKolIngestionUseCase
 * (telegram-kol/ingestion/) so that the raw text never crosses an
 * event bus boundary.
 *
 * Emits: `parsing.call.parsed` events for observability (no payload text).
 *
 * v1 uses heuristic parsing only. v2 will add an LLM fallback adapter.
 *
 * N18: TokenCall persisted via TypeORM (Tier-2).
 */
@Module({
  imports: [
    ...(isDatabaseEnabled()
      ? [TypeOrmModule.forFeature([TokenCallEntity])]
      : []),
  ],
  controllers: [ParsingController],
  providers: [
    ParseFromCandidatesUseCase,
    GetTokenCallUseCase,
    GetRecentCallsUseCase,
    { provide: ParserPort, useClass: HeuristicParserAdapter },
    {
      provide: ParsingEventPublisher,
      useClass: InProcessParsingEventPublisher,
    },
    InMemoryTokenCallRepository,
    ...(isDatabaseEnabled() ? [TypeOrmTokenCallRepository] : []),
    {
      provide: TokenCallRepository,
      inject: [
        InMemoryTokenCallRepository,
        ...(isDatabaseEnabled() ? [TypeOrmTokenCallRepository] : []),
      ],
      useFactory: (
        inMemory: InMemoryTokenCallRepository,
        typeorm?: TypeOrmTokenCallRepository,
      ): TokenCallRepository => typeorm ?? inMemory,
    },
  ],
  exports: [
    ParserPort,
    ParsingEventPublisher,
    TokenCallRepository,
    ParseFromCandidatesUseCase,
  ],
})
export class ParsingModule {}
