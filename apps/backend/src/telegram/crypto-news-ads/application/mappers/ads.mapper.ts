import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import { AdRotationConfig } from 'telegram/crypto-news-ads/domain/entities/ad-rotation-config.entity';

/**
 * View models + mappers for the crypto-news-ads REST API.
 */

export interface AdView {
  readonly id: string;
  readonly name: string;
  readonly body: string;
  readonly imageMediaId: string | null;
  readonly enabled: boolean;
  readonly order: number;
  readonly timesPublished: number;
  readonly consecutiveFailures: number;
  readonly lastPublishedAt: string | null;
  readonly expiresAt: string | null;
  readonly expirationAction: 'disable' | 'delete';
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
  imageMediaId: ad.imageMediaId,
  enabled: ad.enabled,
  order: ad.order,
  timesPublished: ad.timesPublished,
  consecutiveFailures: ad.consecutiveFailures,
  lastPublishedAt: ad.lastPublishedAt ? ad.lastPublishedAt.toISOString() : null,
  expiresAt: ad.expiresAt ? ad.expiresAt.toISOString() : null,
  expirationAction: ad.expirationAction,
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
 * returning a NEW instance. `expiresAt` supports explicit null (clears)
 * vs undefined (unchanged).
 *
 * Image changes do NOT go through PATCH — they use the dedicated
 * upload/clear command (`imageMediaId` is read-only from this mapper's
 * perspective and is preserved from the untouched `ad`).
 *
 * The expiry invariant is enforced on the RESULTING ad: whenever the
 * patched ad is or would become enabled, it is built through
 * `Ad.enable(now)` — which throws DomainError(CONFLICT) if expired — so
 * a patch that only changes `expirationAction` on an expired-enabled ad
 * still 409s (it is NOT a renewal). `patch.enabled === false` disables
 * directly, never enabling through the guard.
 */
export const applyAdPatch = (
  ad: Ad,
  patch: {
    name?: string;
    body?: string;
    enabled?: boolean;
    order?: number;
    expiresAt?: Date | null;
    expirationAction?: 'disable' | 'delete';
  },
  now: Date = new Date(),
): Ad => {
  const props = {
    id: ad.id,
    name: patch.name ?? ad.name,
    body: patch.body ?? ad.body,
    imageMediaId: ad.imageMediaId,
    enabled: patch.enabled ?? ad.enabled,
    order: patch.order ?? ad.order,
    timesPublished: ad.timesPublished,
    consecutiveFailures: ad.consecutiveFailures,
    lastPublishedAt: ad.lastPublishedAt,
    expiresAt: patch.expiresAt !== undefined ? patch.expiresAt : ad.expiresAt,
    expirationAction: patch.expirationAction ?? ad.expirationAction,
    createdAt: ad.createdAt,
    updatedAt: ad.updatedAt,
  };
  const resulting = Ad.fromSnapshot(props);
  if (patch.enabled === false) {
    return resulting.disable();
  }
  // The ad would be enabled after the patch. It may stay enabled only
  // if it was NOT already expired (a patch that INTRODUCES an expiry is
  // allowed at write time — the sweep enforces it later), or if the
  // patch renewed/cleared the expiry. An ad that was expired before the
  // patch and still is after it must go through enable(now), which
  // throws DomainError(CONFLICT) — this is how MA1's "changing ONLY
  // expirationAction is not a renewal" becomes a 409 mechanically.
  if (patch.enabled === true || resulting.enabled) {
    if (ad.isExpired(now) && resulting.isExpired(now)) {
      return resulting.enable(now);
    }
  }
  return resulting;
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
