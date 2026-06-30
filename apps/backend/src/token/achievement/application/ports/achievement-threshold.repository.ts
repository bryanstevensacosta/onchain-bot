export interface AchievementThresholdRecord {
  id?: number;
  multiple: number;
}

export abstract class AchievementThresholdRepository {
  abstract findEnabled(): Promise<AchievementThresholdRecord[]>;
  abstract findAll(): Promise<AchievementThresholdRecord[]>;
  abstract findByMultiple(
    multiple: number,
  ): Promise<AchievementThresholdRecord | null>;
  abstract save(
    threshold: AchievementThresholdRecord,
  ): Promise<AchievementThresholdRecord>;
  abstract replaceAll(
    thresholds: ReadonlyArray<AchievementThresholdRecord>,
  ): Promise<void>;
  abstract count(): Promise<number>;
}
