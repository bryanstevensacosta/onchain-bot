export interface MilestoneThresholdRecord {
  id?: number;
  multiple: number;
}

export abstract class MilestoneThresholdRepository {
  abstract findEnabled(): Promise<MilestoneThresholdRecord[]>;
  abstract findAll(): Promise<MilestoneThresholdRecord[]>;
  abstract findByMultiple(
    multiple: number,
  ): Promise<MilestoneThresholdRecord | null>;
  abstract save(
    threshold: MilestoneThresholdRecord,
  ): Promise<MilestoneThresholdRecord>;
  abstract replaceAll(
    thresholds: ReadonlyArray<MilestoneThresholdRecord>,
  ): Promise<void>;
  abstract count(): Promise<number>;
}
