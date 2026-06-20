import { Module } from '@nestjs/common';
import { ChannelReputationPort } from 'ca/scoring/domain/ports/channel-reputation.port';
import { TokenScoreRepository } from 'ca/scoring/application/ports/token-score.repository';
import { ScoringEventPublisher } from 'ca/scoring/application/ports/scoring-event.publisher';
import { ScoreTokenUseCase } from 'ca/scoring/application/handlers/score-token.use-case';
import { GetTokenScoreUseCase } from 'ca/scoring/application/handlers/get-token-score.use-case';
import { ListTokenScoresUseCase } from 'ca/scoring/application/handlers/list-token-scores.use-case';
import { GetTopScoresUseCase } from 'ca/scoring/application/handlers/get-top-scores.use-case';
import { DefaultChannelReputationAdapter } from 'ca/scoring/infrastructure/adapters/default-channel-reputation.adapter';
import { InMemoryTokenScoreRepository } from 'ca/scoring/infrastructure/repositories/in-memory-token-score.repository';
import { InProcessScoringEventPublisher } from 'ca/scoring/infrastructure/messaging/in-process-scoring-event.publisher';
import { TokenClassifiedHandler } from 'ca/scoring/infrastructure/event-bus/token-classified.handler';
import { ScoringController } from 'ca/scoring/api/http/scoring.controller';
import { AnalyticsModule } from 'ca/analytics/analytics.module';

/**
 * Scoring BC module.
 *
 * Consumes: `classification.token.classified` events (with limited data)
 * Emits:    `scoring.token.scored` events
 *
 * Also exposed via POST /score for full control (carries source channel IDs
 * for accurate reputation scoring).
 *
 * Channel reputation: prefer real historical reputation from Analytics
 * BC if available; fall back to the static default-reputation adapter.
 */
@Module({
  imports: [AnalyticsModule],
  controllers: [ScoringController],
  providers: [
    ScoreTokenUseCase,
    GetTokenScoreUseCase,
    ListTokenScoresUseCase,
    GetTopScoresUseCase,
    TokenClassifiedHandler,
    {
      provide: ChannelReputationPort,
      useClass: DefaultChannelReputationAdapter,
    },
    { provide: TokenScoreRepository, useClass: InMemoryTokenScoreRepository },
    {
      provide: ScoringEventPublisher,
      useClass: InProcessScoringEventPublisher,
    },
  ],
  exports: [TokenScoreRepository, ScoringEventPublisher],
})
export class ScoringModule {}
