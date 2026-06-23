import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TokenScoredEvent } from 'token/scoring/domain/events/token-scored.event';
import {
  ApplyFiltersUseCase,
  DEFAULT_FILTER_CONFIG,
} from 'token/token-gating/application/handlers/apply-filters.use-case';

/**
 * Subscribes to scoring.token.scored and applies filters.
 *
 * For event-driven path, classification + riskWeight are known, but
 * snapshotCompleteness is unknown (not in the scoring event) — defaults
 * to 1.0 so the completeness gate doesn't reject event-driven decisions
 * unless the controller explicitly sets it lower.
 */
@Injectable()
export class TokenScoredHandler {
  private readonly logger = new Logger(TokenScoredHandler.name);

  public constructor(private readonly apply: ApplyFiltersUseCase) {}

  @OnEvent('scoring.token.scored', { async: true })
  public async handle(event: TokenScoredEvent): Promise<void> {
    try {
      await this.apply.execute({
        chain: event.payload.chain,
        address: event.payload.address,
        score: event.payload.score,
        classification: event.payload.classification,
        riskWeight: 0,
        snapshotCompleteness: 1,
        config: DEFAULT_FILTER_CONFIG,
      });
    } catch (err) {
      this.logger.error(
        `Filter failed for ${event.payload.address}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
