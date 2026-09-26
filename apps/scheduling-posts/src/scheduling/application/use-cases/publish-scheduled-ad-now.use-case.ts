import { Injectable, Logger } from '@nestjs/common';
import { ScheduledAdRepository } from '../../domain/ports/scheduled-ad.repository';
import { SchedulingStateRepository } from '../../domain/ports/scheduling-state.repository';
import { ScheduledAdDispatcherPort } from '../../domain/ports/scheduled-ad-dispatcher.port';
import { ScheduledAd } from '../../domain/scheduled-ad.entity';
import type { SchedulingTarget } from '../../domain/scheduling-target';
import { SchedulingHealthState } from '../state/scheduling-health.state';

export interface PublishScheduledAdNowResult {
  readonly ok: boolean;
  readonly messageId: number | null;
  readonly error: string | null;
}

/**
 * Manual publish flow for `POST /api/scheduling/ads/:id/publish-now`.
 *
 * Deliberately bypasses the rotation decider (cadence, delays, caps):
 * the operator asked for THIS post on THIS target NOW. On success the
 * same cursor transitions as the rotation tick run (cursor +
 * ad stats); on failure the error is returned WITHOUT failure
 * bookkeeping — counting and auto-disable stay owned by the rotation
 * flow (`PublishScheduledAdUseCase`).
 */
@Injectable()
export class PublishScheduledAdNowUseCase {
  private readonly logger = new Logger(PublishScheduledAdNowUseCase.name);

  public constructor(
    private readonly adRepo: ScheduledAdRepository,
    private readonly stateRepo: SchedulingStateRepository,
    private readonly dispatcher: ScheduledAdDispatcherPort,
    private readonly health: SchedulingHealthState,
  ) {}

  public async execute(
    ad: ScheduledAd,
    target: SchedulingTarget,
    now: Date = new Date(),
  ): Promise<PublishScheduledAdNowResult> {
    const result = await this.dispatcher.publish(ad, target);
    if (result.ok && result.messageId !== null) {
      await this.stateRepo.markPublished(target, ad.id, now);
      const state = await this.stateRepo.load();
      await this.stateRepo.save(state.resetPostsSinceLastAd());
      await this.adRepo.markPublished(ad.id, String(result.messageId), now);
      this.health.recordPublished(target, now);
      this.logger.log(
        `manually published scheduled post ${ad.id} to ${target} as message ${result.messageId}`,
      );
      return { ok: true, messageId: result.messageId, error: null };
    }
    return {
      ok: false,
      messageId: null,
      error: result.error ?? 'unknown error',
    };
  }
}
