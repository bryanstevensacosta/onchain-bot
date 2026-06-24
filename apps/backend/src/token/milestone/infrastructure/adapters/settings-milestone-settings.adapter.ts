import { Injectable } from '@nestjs/common';
import { MilestoneSettingsPort } from '../../application/ports/milestone-settings.port';

export const DEFAULT_MILESTONE_THRESHOLDS: ReadonlyArray<number> = Array.from(
  { length: 99 },
  (_, i) => i + 2,
);

@Injectable()
export class SettingsMilestoneSettingsAdapter implements MilestoneSettingsPort {
  getDefaultThresholds(): ReadonlyArray<number> {
    return DEFAULT_MILESTONE_THRESHOLDS;
  }
}
