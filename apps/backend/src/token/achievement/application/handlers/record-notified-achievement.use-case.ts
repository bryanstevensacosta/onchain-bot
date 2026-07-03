import { Injectable, Logger } from '@nestjs/common';
import { MonitoredCallRecord } from '../ports/monitored-call.repository';
import { AchievementCachePort } from '../ports/achievement-cache.port';
import { AchievementEventPublisher } from '../ports/achievement-event.publisher';
import {
  CallAchievementReachedEvent,
  CallAchievementReachedPayload,
} from '../../domain/events/call-achievement-reached.event';

export interface RecordNotifiedAchievementInput {
  monitoredCall: MonitoredCallRecord;
  threshold: number;
  currentMc: number;
}

/**
 * Best-effort: announces that a milestone threshold was crossed for a call.
 *
 * Persistence of the notified record is now owned by `vip-achievement` — the
 * authoritative dedup happens downstream in the `AchievementReachedHandler`
 * via the atomic `(callId, threshold)` constraint. This use case is now a
 * thin orchestrator that:
 *
 *   1. Memoizes the threshold in the cache so `EvaluateActiveCallsUseCase`
 *      skips it on subsequent ticks (best-effort, not authoritative).
 *   2. Emits `CallAchievementReachedEvent` — the event bridge to vip-achievement.
 *
 * Returns void: duplicate detection is the handler's responsibility. Callers
 * that need to know whether the event was actually persisted should listen
 * on the vip-achievement side, not check this return value.
 */
@Injectable()
export class RecordNotifiedAchievementUseCase {
  private readonly logger = new Logger(RecordNotifiedAchievementUseCase.name);

  constructor(
    private readonly cache: AchievementCachePort,
    private readonly publisher: AchievementEventPublisher,
  ) {}

  async execute(input: RecordNotifiedAchievementInput): Promise<void> {
    const { monitoredCall, threshold, currentMc } = input;
    const callId = monitoredCall.callId;
    const notifiedAt = new Date();

    try {
      await this.cache.addNotifiedThreshold(callId, threshold);
    } catch (err) {
      this.logger.warn(
        `Cache update failed for call=${callId} threshold=${threshold}: ${(err as Error).message}`,
      );
    }

    const payload: CallAchievementReachedPayload = {
      callId,
      chain: monitoredCall.chain,
      address: monitoredCall.address,
      multiple: threshold,
      mcAtCall: monitoredCall.mcAtCall,
      mcNow: currentMc,
      notifiedAt: notifiedAt.toISOString(),
    };
    const event = new CallAchievementReachedEvent(callId, payload);
    await this.publisher.publish(event);
  }
}
