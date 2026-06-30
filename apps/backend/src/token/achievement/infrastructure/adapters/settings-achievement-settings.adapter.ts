import { Injectable } from '@nestjs/common';
import { AchievementSettingsPort } from '../../application/ports/achievement-settings.port';

export const DEFAULT_MILESTONE_THRESHOLDS: ReadonlyArray<number> = Array.from(
  { length: 99 },
  (_, i) => i + 2,
);

@Injectable()
export class SettingsAchievementSettingsAdapter implements AchievementSettingsPort {
  getDefaultThresholds(): ReadonlyArray<number> {
    return DEFAULT_MILESTONE_THRESHOLDS;
  }
}
