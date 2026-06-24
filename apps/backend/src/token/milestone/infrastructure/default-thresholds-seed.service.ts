import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MilestoneThresholdRepository } from '../application/ports/milestone-threshold.repository';
import { MilestoneSettingsPort } from '../application/ports/milestone-settings.port';

@Injectable()
export class DefaultThresholdsSeedService implements OnModuleInit {
  private readonly logger = new Logger(DefaultThresholdsSeedService.name);

  constructor(
    private readonly repo: MilestoneThresholdRepository,
    private readonly settings: MilestoneSettingsPort,
  ) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.repo.count();
    if (existing > 0) return;
    const defaults = this.settings.getDefaultThresholds();
    await this.repo.replaceAll(defaults.map((multiple) => ({ multiple })));
    this.logger.log(`Seeded ${defaults.length} default milestone thresholds`);
  }
}
