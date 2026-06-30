export interface NotifiedAchievementRecord {
  id?: string;
  callId: string;
  threshold: number;
  notifiedAt: Date;
}

export abstract class NotifiedAchievementRepository {
  abstract findByCall(callId: string): Promise<NotifiedAchievementRecord[]>;
  abstract findThresholdsForCall(callId: string): Promise<number[]>;
  abstract existsByCallAndThreshold(
    callId: string,
    threshold: number,
  ): Promise<boolean>;
  abstract save(
    notified: NotifiedAchievementRecord,
  ): Promise<NotifiedAchievementRecord>;
  abstract countByCall(callId: string): Promise<number>;
}
