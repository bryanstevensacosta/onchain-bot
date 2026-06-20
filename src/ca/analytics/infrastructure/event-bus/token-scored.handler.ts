import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { TokenScoredEvent } from 'ca/scoring/domain/events/token-scored.event';
import { EvaluationHorizonVo } from 'ca/analytics/domain/value-objects/evaluation-horizon.vo';
import { EnqueueEvaluationJobsUseCase } from 'ca/analytics/application/handlers/enqueue-evaluation-jobs.use-case';

interface AnalyticsConfig {
  readonly evaluationHorizonsHours?: ReadonlyArray<number>;
}

/**
 * Subscribes to scoring.token.scored and enqueues background
 * evaluation jobs (one per configured horizon).
 *
 * Skip conditions:
 * - classification is SCAM or UNKNOWN (not worth evaluating)
 * - score below 50 (no signal to evaluate)
 *
 * Horizon sources: ANALYTICS_EVALUATION_HORIZONS_HOURS env var
 * (default "24,168,720" → 24H, 7D, 30D).
 */
@Injectable()
export class TokenScoredHandler {
  private readonly logger = new Logger(TokenScoredHandler.name);

  public constructor(
    private readonly enqueue: EnqueueEvaluationJobsUseCase,
    private readonly configService: ConfigService,
  ) {}

  @OnEvent('scoring.token.scored', { async: true })
  public async handle(event: TokenScoredEvent): Promise<void> {
    if (
      event.payload.classification === 'SCAM' ||
      event.payload.classification === 'UNKNOWN'
    ) {
      return;
    }
    if (event.payload.score < 50) {
      return;
    }
    try {
      const hours = this.configService.get<AnalyticsConfig>('app')
        ?.evaluationHorizonsHours ?? [24, 168, 720];
      const horizons = this.toHorizons(hours);
      await this.enqueue.execute({
        channelId: 'pipeline', // event-scored tokens don't carry a channelId; use 'pipeline' as synthetic
        chain: event.payload.chain,
        address: event.payload.address,
        callTimestamp: event.payload.scoredAt ?? new Date(),
        mcAtCall: null, // not available in scoring event payload
        horizons,
      });
    } catch (err) {
      this.logger.error(
        `Failed to enqueue evaluation jobs for ${event.payload.address}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private toHorizons(
    hours: ReadonlyArray<number>,
  ): ReadonlyArray<EvaluationHorizonVo> {
    const out: EvaluationHorizonVo[] = [];
    for (const h of hours) {
      if (h === 24) out.push(EvaluationHorizonVo.H24);
      else if (h === 168) out.push(EvaluationHorizonVo.D7);
      else if (h === 720) out.push(EvaluationHorizonVo.D30);
      else this.logger.warn(`Unsupported horizon ${h}h — skipping`);
    }
    return out.length > 0 ? out : EvaluationHorizonVo.defaultHorizons();
  }
}
