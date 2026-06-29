import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { HoneypotAnalyzerPort } from 'token/honeypot/domain/ports/honeypot-analyzer.port';
import { HoneypotAnalysisRepository } from 'token/honeypot/application/ports/honeypot-analysis.repository';
import { AnalyzeTokenHoneypotUseCase } from 'token/honeypot/application/handlers/analyze-token-honeypot.use-case';
import { GetHoneypotAnalysisUseCase } from 'token/honeypot/application/handlers/get-honeypot-analysis.use-case';
import { ListHoneypotAnalysesUseCase } from 'token/honeypot/application/handlers/list-honeypot-analyses.use-case';
import { HeuristicHoneypotDetectorAdapter } from 'token/honeypot/infrastructure/adapters/heuristic-honeypot-detector.adapter';
import { InMemoryHoneypotAnalysisRepository } from 'token/honeypot/infrastructure/repositories/in-memory-honeypot-analysis.repository';
import { HoneypotAnalysisEntity } from 'token/honeypot/infrastructure/persistence/typeorm/entities/honeypot-analysis.entity';
import { TypeOrmHoneypotAnalysisRepository } from 'token/honeypot/infrastructure/persistence/typeorm/repositories/typeorm-honeypot-analysis.repository';
import { TokenScoredHandler } from 'token/honeypot/infrastructure/event-bus/token-scored.handler';
import { HoneypotController } from 'token/honeypot/api/http/honeypot.controller';

/**
 * Honeypot Detection BC module.
 *
 * v1: heuristic-only (no on-chain simulation). Uses DexScreener market
 * data + heuristics to flag likely honeypots.
 *
 * v2 will add:
 * - GoPlus Security API integration
 * - Bytecode pattern matching via Alchemy
 * - Fork-based sell simulation via Tenderly
 *
 * Consumes: `scoring.token.scored` events (only TOKEN classification)
 * Emits:    `honeypot.analysis.completed` events
 *
 * N18: HoneypotAnalysis persisted via TypeORM (Tier-2).
 */
@Module({
  imports: [TypeOrmModule.forFeature([HoneypotAnalysisEntity])],
  controllers: [HoneypotController],
  providers: [
    AnalyzeTokenHoneypotUseCase,
    GetHoneypotAnalysisUseCase,
    ListHoneypotAnalysesUseCase,
    TokenScoredHandler,
    {
      provide: HoneypotAnalyzerPort,
      useClass: HeuristicHoneypotDetectorAdapter,
    },
    InMemoryHoneypotAnalysisRepository,
    ...(isDatabaseEnabled() ? [TypeOrmHoneypotAnalysisRepository] : []),
    {
      provide: HoneypotAnalysisRepository,
      inject: [
        InMemoryHoneypotAnalysisRepository,
        ...(isDatabaseEnabled() ? [TypeOrmHoneypotAnalysisRepository] : []),
      ],
      useFactory: (
        inMemory: InMemoryHoneypotAnalysisRepository,
        typeorm?: TypeOrmHoneypotAnalysisRepository,
      ): HoneypotAnalysisRepository => typeorm ?? inMemory,
    },
  ],
  exports: [HoneypotAnalysisRepository],
})
export class HoneypotModule {}
