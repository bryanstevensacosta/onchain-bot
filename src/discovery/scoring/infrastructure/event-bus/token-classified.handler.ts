import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TokenClassifiedEvent } from 'discovery/classification/domain/events/token-classified.event';
import { ScoreTokenUseCase } from 'discovery/scoring/application/handlers/score-token.use-case';

/**
 * Subscribes to classification.token.classified and triggers scoring.
 *
 * Note: this handler does NOT have access to source channel IDs (the
 * classification event doesn't carry them). For accurate channel
 * reputation scoring, the controller path is preferred; the event-driven
 * path uses an empty sourceChannelIds list (avg reputation = 0.5 = neutral).
 */
@Injectable()
export class TokenClassifiedHandler {
  private readonly logger = new Logger(TokenClassifiedHandler.name);

  public constructor(private readonly score: ScoreTokenUseCase) {}

  @OnEvent('classification.token.classified', { async: true })
  public async handle(event: TokenClassifiedEvent): Promise<void> {
    try {
      await this.score.execute({
        chain: event.payload.chain,
        address: event.payload.address,
        classification: event.payload.classification,
        signals: event.payload.signals as never,
        liquidityUsd: null,
        marketCapUsd: null,
        volume24hUsd: null,
        holders: null,
        sourceCount: 1,
        mentionCount: 1,
        sourceChannelIds: [],
      });
    } catch (err) {
      this.logger.error(
        `Scoring failed for ${event.payload.address}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
