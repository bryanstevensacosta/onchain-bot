import { Injectable, Logger } from '@nestjs/common';
import { MonitoredCallRecord } from '../ports/monitored-call.repository';
import { NotifiedAchievementRepository } from '../ports/notified-achievement.repository';
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

export interface RecordNotifiedAchievementResult {
  recorded: boolean;
  event?: CallAchievementReachedEvent;
}

@Injectable()
export class RecordNotifiedAchievementUseCase {
  private readonly logger = new Logger(RecordNotifiedAchievementUseCase.name);

  constructor(
    private readonly repo: NotifiedAchievementRepository,
    private readonly cache: AchievementCachePort,
    private readonly publisher: AchievementEventPublisher,
  ) {}

  async execute(
    input: RecordNotifiedAchievementInput,
  ): Promise<RecordNotifiedAchievementResult> {
    const { monitoredCall, threshold, currentMc } = input;
    const callId = monitoredCall.callId;

    const alreadyExists = await this.repo.existsByCallAndThreshold(
      callId,
      threshold,
    );
    if (alreadyExists) {
      return { recorded: false };
    }

    const notifiedAt = new Date();
    await this.repo.save({ callId, threshold, notifiedAt });

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

    return { recorded: true, event };
  }
}
