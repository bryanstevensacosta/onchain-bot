import { Injectable, Logger } from '@nestjs/common';
import { MonitoredCallRecord } from '../ports/monitored-call.repository';
import { NotifiedMilestoneRepository } from '../ports/notified-milestone.repository';
import { MilestoneCachePort } from '../ports/milestone-cache.port';
import { MilestoneEventPublisher } from '../ports/milestone-event.publisher';
import {
  CallMilestoneReachedEvent,
  CallMilestoneReachedPayload,
} from '../../domain/events/call-milestone-reached.event';

export interface RecordNotifiedMilestoneInput {
  monitoredCall: MonitoredCallRecord;
  threshold: number;
  currentMc: number;
}

export interface RecordNotifiedMilestoneResult {
  recorded: boolean;
  event?: CallMilestoneReachedEvent;
}

@Injectable()
export class RecordNotifiedMilestoneUseCase {
  private readonly logger = new Logger(RecordNotifiedMilestoneUseCase.name);

  constructor(
    private readonly repo: NotifiedMilestoneRepository,
    private readonly cache: MilestoneCachePort,
    private readonly publisher: MilestoneEventPublisher,
  ) {}

  async execute(
    input: RecordNotifiedMilestoneInput,
  ): Promise<RecordNotifiedMilestoneResult> {
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

    const payload: CallMilestoneReachedPayload = {
      callId,
      chain: monitoredCall.chain,
      address: monitoredCall.address,
      multiple: threshold,
      mcAtCall: monitoredCall.mcAtCall,
      mcNow: currentMc,
      notifiedAt: notifiedAt.toISOString(),
    };
    const event = new CallMilestoneReachedEvent(callId, payload);
    await this.publisher.publish(event);

    return { recorded: true, event };
  }
}
