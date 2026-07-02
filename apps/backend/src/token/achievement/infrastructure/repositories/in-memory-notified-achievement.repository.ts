import { Injectable, Logger } from '@nestjs/common';
import { Uuid } from 'shared/common/utils';
import {
  NotifiedAchievementRepository,
  NotifiedAchievementRecord,
} from '../../application/ports/notified-achievement.repository';

@Injectable()
export class InMemoryNotifiedAchievementRepository extends NotifiedAchievementRepository {
  private readonly logger = new Logger(
    InMemoryNotifiedAchievementRepository.name,
  );
  private store: NotifiedAchievementRecord[] = [];

  async findByCall(callId: string): Promise<NotifiedAchievementRecord[]> {
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
    notified: NotifiedAchievementRecord,
  ): Promise<NotifiedAchievementRecord> {
    if (
      await this.existsByCallAndThreshold(notified.callId, notified.threshold)
    ) {
      return notified;
    }
    const saved: NotifiedAchievementRecord = {
      id: notified.id ?? Uuid.v4(),
      callId: notified.callId,
      threshold: notified.threshold,
      notifiedAt: notified.notifiedAt,
      telegramMessageId: notified.telegramMessageId ?? null,
    };
    this.store.push(saved);
    return saved;
  }

  async countByCall(callId: string): Promise<number> {
    return this.store.filter((r) => r.callId === callId).length;
  }

  async updateTelegramMessageId(
    callId: string,
    threshold: number,
    messageId: number,
  ): Promise<void> {
    const record = this.store.find(
      (r) => r.callId === callId && r.threshold === threshold,
    );
    if (!record) {
      this.logger.warn(
        `Cannot update telegramMessageId: record not found for callId=${callId} threshold=${threshold}`,
      );
      return;
    }
    record.telegramMessageId = messageId;
  }
}
