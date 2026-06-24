import { Injectable } from '@nestjs/common';
import { Uuid } from 'shared/common/utils';
import {
  NotifiedMilestoneRepository,
  NotifiedMilestoneRecord,
} from '../../application/ports/notified-milestone.repository';

@Injectable()
export class InMemoryNotifiedMilestoneRepository extends NotifiedMilestoneRepository {
  private store: NotifiedMilestoneRecord[] = [];

  async findByCall(callId: string): Promise<NotifiedMilestoneRecord[]> {
    return this.store.filter((r) => r.callId === callId);
  }

  async findThresholdsForCall(callId: string): Promise<number[]> {
    return this.store
      .filter((r) => r.callId === callId)
      .map((r) => r.threshold);
  }

  async existsByCallAndThreshold(
    callId: string,
    threshold: number,
  ): Promise<boolean> {
    return this.store.some(
      (r) => r.callId === callId && r.threshold === threshold,
    );
  }

  async save(
    notified: NotifiedMilestoneRecord,
  ): Promise<NotifiedMilestoneRecord> {
    if (
      await this.existsByCallAndThreshold(notified.callId, notified.threshold)
    ) {
      return notified;
    }
    const saved: NotifiedMilestoneRecord = {
      id: notified.id ?? Uuid.v4(),
      callId: notified.callId,
      threshold: notified.threshold,
      notifiedAt: notified.notifiedAt,
    };
    this.store.push(saved);
    return saved;
  }

  async countByCall(callId: string): Promise<number> {
    return this.store.filter((r) => r.callId === callId).length;
  }
}
