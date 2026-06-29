import { DefaultTrackingFilterSeedService } from './default-tracking-filter-seed.service';
import { SettingsService } from 'settings/application/services/settings.service';
import {
  PUBLISHED_CALL_TRACKING_DEFAULTS,
  PUBLISHED_CALL_TRACKING_FILTER_NAMES,
  PUBLISHED_CALL_TRACKING_FILTER_TYPE,
} from '../domain/types/published-call-tracking-filter';

function buildSettingsStub(): SettingsService {
  return {
    seedDefaultsIfEmpty: jest.fn().mockResolvedValue(0),
  } as unknown as SettingsService;
}

describe('DefaultTrackingFilterSeedService', () => {
  it('seeds 4 default filters on first run', async () => {
    const mockFn = jest.fn().mockResolvedValue(0);
    const settings = {
      seedDefaultsIfEmpty: mockFn,
    } as unknown as SettingsService;
    const seed = new DefaultTrackingFilterSeedService(settings);
    await seed.onModuleInit();
    expect(mockFn).toHaveBeenCalledWith(
      PUBLISHED_CALL_TRACKING_FILTER_TYPE,
      expect.arrayContaining([
        expect.objectContaining({
          name: PUBLISHED_CALL_TRACKING_FILTER_NAMES.milestoneMinHoursAgo,
          numericValue: 72,
        }),
        expect.objectContaining({
          name: PUBLISHED_CALL_TRACKING_FILTER_NAMES.milestoneMinMultiple,
          numericValue: 2,
        }),
        expect.objectContaining({
          name: PUBLISHED_CALL_TRACKING_FILTER_NAMES.priceDropMaxPercent,
          numericValue: 90,
        }),
        expect.objectContaining({
          name: PUBLISHED_CALL_TRACKING_FILTER_NAMES.trackingEnabled,
          value: PUBLISHED_CALL_TRACKING_FILTER_NAMES.trackingEnabled,
          numericValue: 1,
        }),
      ]),
    );
  });

  it('does not throw when seed returns 0 (already seeded)', async () => {
    const settings = buildSettingsStub();
    const mockFn = settings.seedDefaultsIfEmpty as jest.Mock;
    mockFn.mockResolvedValue(0);
    const seed = new DefaultTrackingFilterSeedService(settings);
    await expect(seed.onModuleInit()).resolves.toBeUndefined();
  });

  it('uses the documented defaults', () => {
    expect(PUBLISHED_CALL_TRACKING_DEFAULTS).toEqual({
      milestoneMinHoursAgo: 72,
      milestoneMinMultiple: 2,
      priceDropMaxPercent: 90,
      trackingEnabled: true,
    });
  });
});
