export const PUBLISHED_CALL_TRACKING_FILTER_TYPE = 'published_call_tracking';

export const PUBLISHED_CALL_TRACKING_FILTER_NAMES = {
  milestoneMinHoursAgo: 'milestone_min_hours_ago',
  milestoneMinMultiple: 'milestone_min_multiple',
  priceDropMaxPercent: 'price_drop_max_percent',
  trackingEnabled: 'tracking_enabled',
} as const;

export type PublishedCallTrackingFilterName =
  (typeof PUBLISHED_CALL_TRACKING_FILTER_NAMES)[keyof typeof PUBLISHED_CALL_TRACKING_FILTER_NAMES];

export interface PublishedCallTrackingConfig {
  readonly milestoneMinHoursAgo: number;
  readonly milestoneMinMultiple: number;
  readonly priceDropMaxPercent: number;
  readonly trackingEnabled: boolean;
}

export const PUBLISHED_CALL_TRACKING_DEFAULTS: PublishedCallTrackingConfig = {
  milestoneMinHoursAgo: 72,
  milestoneMinMultiple: 2,
  priceDropMaxPercent: 90,
  trackingEnabled: true,
};
