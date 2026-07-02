import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotifiedAchievementRepository,
  NotifiedAchievementRecord,
} from '../../../../application/ports/notified-achievement.repository';
import { NotifiedAchievementEntity } from '../../../../domain/entities/notified-achievement.entity';

@Injectable()
export class TypeormNotifiedAchievementRepository extends NotifiedAchievementRepository {
  private readonly logger = new Logger(
    TypeormNotifiedAchievementRepository.name,
  );

  constructor(
    @InjectRepository(NotifiedAchievementEntity)
    private readonly repo: Repository<NotifiedAchievementEntity>,
  ) {
    super();
  }

  async findByCall(callId: string): Promise<NotifiedAchievementRecord[]> {
    const rows = await this.repo.find({ where: { callId } });
    return rows.map((r) => this.toRecord(r));
  }

  async findThresholdsForCall(callId: string): Promise<number[]> {
    const rows = await this.repo.find({
      where: { callId },
      select: ['threshold'],
    });
    return rows.map((r) => r.threshold);
  }

  async existsByCallAndThreshold(
    callId: string,
    threshold: number,
  ): Promise<boolean> {
    const count = await this.repo.count({ where: { callId, threshold } });
    return count > 0;
  }

  async save(
    notified: NotifiedAchievementRecord,
  ): Promise<NotifiedAchievementRecord> {
    const entity = this.repo.create({
      callId: notified.callId,
      threshold: notified.threshold,
      notifiedAt: notified.notifiedAt,
      telegramMessageId: notified.telegramMessageId ?? null,
    });
    const saved = await this.repo.save(entity);
    return this.toRecord(saved);
  }

  async countByCall(callId: string): Promise<number> {
    return this.repo.count({ where: { callId } });
  }

  async updateTelegramMessageId(
    callId: string,
    threshold: number,
    messageId: number,
  ): Promise<void> {
    const result = await this.repo.update(
      { callId, threshold },
      { telegramMessageId: messageId },
    );
    if (result.affected === 0) {
      this.logger.warn(
        `Cannot update telegramMessageId: record not found for callId=${callId} threshold=${threshold}`,
      );
    }
  }

  private toRecord(row: NotifiedAchievementEntity): NotifiedAchievementRecord {
    return {
      id: row.id,
      callId: row.callId,
      threshold: row.threshold,
      notifiedAt: row.notifiedAt,
      telegramMessageId: row.telegramMessageId,
    };
  }
}
