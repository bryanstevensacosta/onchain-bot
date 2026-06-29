import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { isDatabaseEnabled } from 'shared/common/persistence/database.module';
import { KolReputationPort } from 'token/scoring/domain/ports/kol-reputation.port';
import { TokenScoreRepository } from 'token/scoring/application/ports/token-score.repository';
import { ScoringEventPublisher } from 'token/scoring/application/ports/scoring-event.publisher';
import { ScoreTokenUseCase } from 'token/scoring/application/handlers/score-token.use-case';
import { GetTokenScoreUseCase } from 'token/scoring/application/handlers/get-token-score.use-case';
import { ListTokenScoresUseCase } from 'token/scoring/application/handlers/list-token-scores.use-case';
import { GetTopScoresUseCase } from 'token/scoring/application/handlers/get-top-scores.use-case';
import { DefaultKolReputationAdapter } from 'token/scoring/infrastructure/adapters/default-kol-reputation.adapter';
import { InMemoryTokenScoreRepository } from 'token/scoring/infrastructure/repositories/in-memory-token-score.repository';
import { TokenScoreEntity } from 'token/scoring/infrastructure/persistence/typeorm/entities/token-score.entity';
import { TypeOrmTokenScoreRepository } from 'token/scoring/infrastructure/persistence/typeorm/repositories/typeorm-token-score.repository';
import { InProcessScoringEventPublisher } from 'token/scoring/infrastructure/messaging/in-process-scoring-event.publisher';
import { TokenClassifiedHandler } from 'token/scoring/infrastructure/event-bus/token-classified.handler';
import { ScoringController } from 'token/scoring/api/http/scoring.controller';
import { ReputationModule } from 'kol/reputation/reputation.module';
import { SettingsModule } from 'settings/settings.module';

/**
 * Scoring BC module.
 *
 * Consumes: `classification.token.classified` events (with limited data)
 * Emits:    `scoring.token.scored` events
 *
 * Also exposed via POST /score for full control (carries source KOL IDs
 * for accurate reputation scoring).
 *
 * KOL reputation: prefer real historical reputation from the new
 * `ReputationModule` (in `kol/reputation/`) if available;
 * fall back to the static default-reputation adapter.
 *
 * N18: TokenScore persisted via TypeORM (Tier-2). When `DATABASE_ENABLED=true`,
 * the Postgres implementation is selected; otherwise the in-memory adapter.
 */
@Module({
  imports: [
    ReputationModule,
    SettingsModule,
    TypeOrmModule.forFeature([TokenScoreEntity]),
  ],
  controllers: [ScoringController],
  providers: [
    ScoreTokenUseCase,
    GetTokenScoreUseCase,
    ListTokenScoresUseCase,
    GetTopScoresUseCase,
    TokenClassifiedHandler,
    InMemoryTokenScoreRepository,
    ...(isDatabaseEnabled() ? [TypeOrmTokenScoreRepository] : []),
    {
      provide: KolReputationPort,
      useClass: DefaultKolReputationAdapter,
    },
    {
      provide: TokenScoreRepository,
      inject: [
        InMemoryTokenScoreRepository,
        ...(isDatabaseEnabled() ? [TypeOrmTokenScoreRepository] : []),
      ],
      useFactory: (
        inMemory: InMemoryTokenScoreRepository,
        typeorm?: TypeOrmTokenScoreRepository,
      ): TokenScoreRepository => typeorm ?? inMemory,
    },
    {
      provide: ScoringEventPublisher,
      useClass: InProcessScoringEventPublisher,
    },
  ],
  exports: [TokenScoreRepository, ScoringEventPublisher],
})
export class ScoringModule {}
