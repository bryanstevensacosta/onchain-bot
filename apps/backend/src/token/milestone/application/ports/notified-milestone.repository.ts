export interface NotifiedMilestoneRecord {
  id?: string;
  callId: string;
  threshold: number;
  notifiedAt: Date;
}

export abstract class NotifiedMilestoneRepository {
  abstract findByCall(callId: string): Promise<NotifiedMilestoneRecord[]>;
  abstract findThresholdsForCall(callId: string): Promise<number[]>;
  abstract existsByCallAndThreshold(
    callId: string,
    threshold: number,
  ): Promise<boolean>;
  abstract save(
    notified: NotifiedMilestoneRecord,
  ): Promise<NotifiedMilestoneRecord>;
  abstract countByCall(callId: string): Promise<number>;
}
