import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import { AdRotationConfig } from 'telegram/crypto-news-ads/domain/entities/ad-rotation-config.entity';

/**
 * View models + mappers for the crypto-news-ads REST API.
 */

export interface AdView {
  readonly id: string;
  readonly name: string;
  readonly body: string;
  readonly imagePath: string | null;
  readonly enabled: boolean;
  readonly order: number;
  readonly timesPublished: number;
  readonly consecutiveFailures: number;
  readonly lastPublishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RotationConfigView {
  readonly enabled: boolean;
  readonly everyNPosts: number;
  readonly minMinutesBetweenAds: number;
}

export const toAdView = (ad: Ad): AdView => ({
  id: ad.id,
  name: ad.name,
  body: ad.body,
  imagePath: ad.imagePath,
  enabled: ad.enabled,
  order: ad.order,
  timesPublished: ad.timesPublished,
  consecutiveFailures: ad.consecutiveFailures,
  lastPublishedAt: ad.lastPublishedAt ? ad.lastPublishedAt.toISOString() : null,
  createdAt: ad.createdAt.toISOString(),
  updatedAt: ad.updatedAt.toISOString(),
});

export const toRotationConfigView = (
  config: AdRotationConfig,
): RotationConfigView => ({
  enabled: config.enabled,
  everyNPosts: config.everyNPosts,
  minMinutesBetweenAds: config.minMinutesBetweenAds,
});

/**
 * Applies a partial PATCH payload onto an existing immutable `Ad`,
 * returning a NEW instance. `imagePath` supports explicit null (clears
 * the image) vs undefined (unchanged).
 */
export const applyAdPatch = (
  ad: Ad,
  patch: {
    name?: string;
    body?: string;
    imagePath?: string | null;
    enabled?: boolean;
    order?: number;
  },
): Ad => {
  const props = {
    id: ad.id,
    name: patch.name ?? ad.name,
    body: patch.body ?? ad.body,
    imagePath: patch.imagePath !== undefined ? patch.imagePath : ad.imagePath,
    enabled: patch.enabled ?? ad.enabled,
    order: patch.order ?? ad.order,
    timesPublished: ad.timesPublished,
    consecutiveFailures: ad.consecutiveFailures,
    lastPublishedAt: ad.lastPublishedAt,
    createdAt: ad.createdAt,
    updatedAt: ad.updatedAt,
  };
  return Ad.fromSnapshot(props);
};

/**
 * True when `err` is a Postgres unique-constraint violation (PG code
 * `23505`) — used to map duplicate ad `name` saves to a 409 Conflict.
 * Mirrors `llm-config.mapper.ts`'s `isUniqueViolation`; kept local so
 * the ads BC never imports another BC's non-port helpers.
 */
export const isUniqueViolation = (err: unknown): boolean => {
  if (err === null || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === '23505';
};
