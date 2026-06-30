import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AchievementThresholdRepository } from '../application/ports/achievement-threshold.repository';
import { AchievementSettingsPort } from '../application/ports/achievement-settings.port';

@Injectable()
export class DefaultThresholdsSeedService implements OnModuleInit {
  private readonly logger = new Logger(DefaultThresholdsSeedService.name);

  constructor(
    private readonly repo: AchievementThresholdRepository,
    private readonly settings: AchievementSettingsPort,
  ) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.repo.count();
    if (existing > 0) return;
    const defaults = this.settings.getDefaultThresholds();
    await this.repo.replaceAll(defaults.map((multiple) => ({ multiple })));
    this.logger.log(`Seeded ${defaults.length} default milestone thresholds`);
  }
}
