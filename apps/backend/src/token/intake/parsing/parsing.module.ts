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
import { InMemoryTokenCallRepository } from 'token/intake/parsing/infrastructure/repositories/in-memory-token-call.repository';
import { TokenCallEntity } from 'token/intake/parsing/infrastructure/persistence/typeorm/entities/token-call.entity';
import { TypeOrmTokenCallRepository } from 'token/intake/parsing/infrastructure/persistence/typeorm/repositories/typeorm-token-call.repository';
import { ParsingController } from 'token/intake/parsing/api/http/parsing.controller';
import { InProcessDomainEventPublisher } from 'shared/common/messaging/in-process-domain-event.publisher';

/**
 * @deprecated Moved to apps/kol-system/src/parsing/ (Tramo 1, todo 6 + P18 companion).
 * Parsing 1:1 now lives in kol-system: ParseFromCandidatesUseCase → ParsedCall
 * (preserves mentions, NO collapse-to-one). This module stays wired for dual-run;
 * it will be removed in todo 16 (cutover + cleanup). Do not extend it — add parsing
 * logic in apps/kol-system/src/parsing/ instead.
 *
 * New location: apps/kol-system/src/parsing/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 *
 * Parsing BC module.
 *
 * Per fix-1: CandidatesExtractedHandler was removed. The use case is
 * invoked via direct call from KolIngestionOrchestratorUseCase
 * (telegram/ingestion/) so that the raw text never crosses an
 * event bus boundary.
 *
 * Emits: `parsing.call.parsed` events for observability (no payload text).
 *
 * v1 uses heuristic parsing only. v2 will add an LLM fallback adapter.
 *
 * N18: TokenCall persisted via TypeORM (Tier-2).
 */
@Module({
  imports: [TypeOrmModule.forFeature([TokenCallEntity])],
  controllers: [ParsingController],
  providers: [
    ParseFromCandidatesUseCase,
    GetTokenCallUseCase,
    GetRecentCallsUseCase,
    { provide: ParserPort, useClass: HeuristicParserAdapter },
    {
      provide: ParsingEventPublisher,
      useClass: InProcessDomainEventPublisher,
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
