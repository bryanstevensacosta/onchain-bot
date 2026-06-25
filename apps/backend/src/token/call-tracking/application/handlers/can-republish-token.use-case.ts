import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from 'settings/application/services/settings.service';
import { TrackedPublishedCallRepository } from '../ports/tracked-published-call.repository';
import {
  PUBLISHED_CALL_TRACKING_DEFAULTS,
  PUBLISHED_CALL_TRACKING_FILTER_NAMES,
} from '../../domain/types/published-call-tracking-filter';

export interface CanRepublishTokenInput {
  readonly chain: string;
  readonly address: string;
}

export interface CanRepublishTokenResult {
  readonly allowed: boolean;
  readonly reasons: ReadonlyArray<string>;
}

@Injectable()
export class CanRepublishTokenUseCase {
  private readonly logger = new Logger(CanRepublishTokenUseCase.name);

  constructor(
    private readonly trackedRepo: TrackedPublishedCallRepository,
    private readonly settings: SettingsService,
  ) {}

  async execute(
    input: CanRepublishTokenInput,
  ): Promise<CanRepublishTokenResult> {
    const tracked = await this.trackedRepo.findByChainAndAddress(
      input.chain,
      input.address,
    );
    if (!tracked || !tracked.isActive) {
      return { allowed: false, reasons: ['no_tracked_call'] };
    }

    const cfg = await this.loadConfig();

    if (!cfg.trackingEnabled) {
      return { allowed: false, reasons: ['tracking_disabled'] };
    }

    const reasons: string[] = [];

    if (
      tracked.maxMilestone === null ||
      tracked.maxMilestone < cfg.milestoneMinMultiple
    ) {
      reasons.push('milestone_below_min');
    } else {
      const ageMs = Date.now() - tracked.lastUpdatedAt.getTime();
      const maxAgeMs = cfg.milestoneMinHoursAgo * 3600 * 1000;
      if (ageMs > maxAgeMs) {
        reasons.push('milestone_too_old');
      }
    }

    if (
      tracked.priceDropPercent !== null &&
      tracked.priceDropPercent < -cfg.priceDropMaxPercent
    ) {
      reasons.push('price_drop_exceeds_limit');
    }

    return { allowed: reasons.length === 0, reasons };
  }

  private async loadConfig() {
    const all = await this.settings.getFiltersByType(
      'published_call_tracking',
      'global',
    );
    const findNumeric = (name: string, fallback: number): number => {
      const row = all.find((r) => r.value === name);
      if (row && row.numericValue !== null) return row.numericValue;
      return fallback;
    };
    return {
      milestoneMinHoursAgo: findNumeric(
        PUBLISHED_CALL_TRACKING_FILTER_NAMES.milestoneMinHoursAgo,
        PUBLISHED_CALL_TRACKING_DEFAULTS.milestoneMinHoursAgo,
      ),
      milestoneMinMultiple: findNumeric(
        PUBLISHED_CALL_TRACKING_FILTER_NAMES.milestoneMinMultiple,
        PUBLISHED_CALL_TRACKING_DEFAULTS.milestoneMinMultiple,
      ),
      priceDropMaxPercent: findNumeric(
        PUBLISHED_CALL_TRACKING_FILTER_NAMES.priceDropMaxPercent,
        PUBLISHED_CALL_TRACKING_DEFAULTS.priceDropMaxPercent,
      ),
      trackingEnabled: this.resolveTrackingEnabled(all),
    };
  }

  private resolveTrackingEnabled(
    rows: ReadonlyArray<{ value: string; numericValue: number | null }>,
  ): boolean {
    const row = rows.find(
      (r) => r.value === PUBLISHED_CALL_TRACKING_FILTER_NAMES.trackingEnabled,
    );
    if (!row || row.numericValue === null) {
      return PUBLISHED_CALL_TRACKING_DEFAULTS.trackingEnabled;
    }
    return row.numericValue === 1;
  }
}
