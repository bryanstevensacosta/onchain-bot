import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SettingsService } from 'settings/application/services/settings.service';
import {
  PUBLISHED_CALL_TRACKING_DEFAULTS,
  PUBLISHED_CALL_TRACKING_FILTER_NAMES,
  PUBLISHED_CALL_TRACKING_FILTER_TYPE,
} from '../domain/types/published-call-tracking-filter';

@Injectable()
export class DefaultTrackingFilterSeedService implements OnModuleInit {
  private readonly logger = new Logger(DefaultTrackingFilterSeedService.name);

  constructor(private readonly settings: SettingsService) {}

  async onModuleInit(): Promise<void> {
    const seeded = await this.settings.seedDefaultsIfEmpty(
      PUBLISHED_CALL_TRACKING_FILTER_TYPE,
      [
        {
          name: PUBLISHED_CALL_TRACKING_FILTER_NAMES.milestoneMinHoursAgo,
          value: String(PUBLISHED_CALL_TRACKING_DEFAULTS.milestoneMinHoursAgo),
          numericValue: PUBLISHED_CALL_TRACKING_DEFAULTS.milestoneMinHoursAgo,
        },
        {
          name: PUBLISHED_CALL_TRACKING_FILTER_NAMES.milestoneMinMultiple,
          value: String(PUBLISHED_CALL_TRACKING_DEFAULTS.milestoneMinMultiple),
          numericValue: PUBLISHED_CALL_TRACKING_DEFAULTS.milestoneMinMultiple,
        },
        {
          name: PUBLISHED_CALL_TRACKING_FILTER_NAMES.priceDropMaxPercent,
          value: String(PUBLISHED_CALL_TRACKING_DEFAULTS.priceDropMaxPercent),
          numericValue: PUBLISHED_CALL_TRACKING_DEFAULTS.priceDropMaxPercent,
        },
        {
          name: PUBLISHED_CALL_TRACKING_FILTER_NAMES.trackingEnabled,
          value: PUBLISHED_CALL_TRACKING_FILTER_NAMES.trackingEnabled,
          numericValue: PUBLISHED_CALL_TRACKING_DEFAULTS.trackingEnabled
            ? 1
            : 0,
        },
      ],
    );
    if (seeded > 0) {
      this.logger.log(
        `Seeded ${seeded} default ${PUBLISHED_CALL_TRACKING_FILTER_TYPE} filters`,
      );
    }
  }
}
