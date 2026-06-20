import { Module } from '@nestjs/common';
import { ChannelReputationPort } from 'discovery/scoring/domain/ports/channel-reputation.port';
import { TokenScoreRepository } from 'discovery/scoring/application/ports/token-score.repository';
import { ScoringEventPublisher } from 'discovery/scoring/application/ports/scoring-event.publisher';
import { ScoreTokenUseCase } from 'discovery/scoring/application/handlers/score-token.use-case';
import { GetTokenScoreUseCase } from 'discovery/scoring/application/handlers/get-token-score.use-case';
import { ListTokenScoresUseCase } from 'discovery/scoring/application/handlers/list-token-scores.use-case';
import { GetTopScoresUseCase } from 'discovery/scoring/application/handlers/get-top-scores.use-case';
import { DefaultChannelReputationAdapter } from 'discovery/scoring/infrastructure/adapters/default-channel-reputation.adapter';
import { InMemoryTokenScoreRepository } from 'discovery/scoring/infrastructure/repositories/in-memory-token-score.repository';
import { InProcessScoringEventPublisher } from 'discovery/scoring/infrastructure/messaging/in-process-scoring-event.publisher';
import { TokenClassifiedHandler } from 'discovery/scoring/infrastructure/event-bus/token-classified.handler';
import { ScoringController } from 'discovery/scoring/api/http/scoring.controller';
import { AnalyticsModule } from 'discovery/analytics/analytics.module';

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
