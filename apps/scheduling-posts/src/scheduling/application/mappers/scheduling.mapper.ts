import { Injectable } from '@nestjs/common';
import { ScheduledAd } from '../../domain/scheduled-ad.entity';
import { SchedulingConfig } from '../../domain/scheduling-config.entity';
import type { ScheduledAdButton } from '../../domain/scheduled-ad.entity';
import type { SchedulingTarget } from '../../domain/scheduling-target';

export interface ScheduledAdView {
  readonly id: string;
  readonly name: string;
  readonly body: string;
  readonly imageMediaId: string | null;
  readonly format: 'text' | 'photo' | 'video' | 'album';
  readonly videoMediaId: string | null;
  readonly albumMediaIds: ReadonlyArray<string> | null;
  readonly buttons: ReadonlyArray<{ text: string; url: string }> | null;
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

export interface SchedulingTargetLimitsView {
  readonly publishDelayMs: number;
  readonly dailyCap: number;
}

export interface SchedulingRotationConfigView {
  readonly enabled: boolean;
  readonly everyNPosts: number;
  readonly minMinutesBetweenAds: number;
  readonly telegram: SchedulingTargetLimitsView;
  readonly threads: SchedulingTargetLimitsView;
}

/** View models + mappers for the scheduling REST API (P36 naming). */
export const toScheduledAdView = (ad: ScheduledAd): ScheduledAdView => ({
  id: ad.id,
  name: ad.name,
  body: ad.body,
  imageMediaId: ad.imageMediaId,
  format: ad.format,
  videoMediaId: ad.videoMediaId,
  albumMediaIds: ad.albumMediaIds,
  buttons: ad.buttons,
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

export const toSchedulingRotationConfigView = (
  config: SchedulingConfig,
): SchedulingRotationConfigView => ({
  enabled: config.enabled,
  everyNPosts: config.everyNPosts,
  minMinutesBetweenAds: config.minMinutesBetweenAds,
  telegram: { ...config.limitsFor('telegram') },
  threads: { ...config.limitsFor('threads') },
});

export function assertSchedulingTarget(
  raw: string,
): asserts raw is SchedulingTarget {
  if (raw !== 'telegram' && raw !== 'threads') {
    throw new Error(`Unsupported scheduling target: ${raw}`);
  }
}

export function toButtonsOrNull(
  buttons: ReadonlyArray<{ text: string; url: string }> | undefined,
): ReadonlyArray<ScheduledAdButton> | null {
  if (buttons === undefined) {
    return null;
  }
  return buttons.map((b) => ({ text: b.text, url: b.url }));
}

/**
 * Applies a partial PATCH onto an immutable `ScheduledAd`, returning
 * a NEW instance. `expiresAt: null` clears the expiry, `undefined`
 * leaves it unchanged; media ids follow the same explicit-null
 * convention. Enabling an expired post throws (CONFLICT) via
 * `ScheduledAd.enable(now)`; `enabled: false` disables directly.
 */
export const applyScheduledAdPatch = (
  ad: ScheduledAd,
  patch: {
    name?: string;
    body?: string;
    enabled?: boolean;
    order?: number;
    expiresAt?: Date | null;
    expirationAction?: 'disable' | 'delete';
    format?: 'text' | 'photo' | 'video' | 'album';
    imageMediaId?: string | null;
    videoMediaId?: string | null;
    albumMediaIds?: ReadonlyArray<string> | null;
    buttons?: ReadonlyArray<{ text: string; url: string }> | null;
  },
  now: Date = new Date(),
): ScheduledAd => {
  const props = {
    id: ad.id,
    name: patch.name ?? ad.name,
    body: patch.body ?? ad.body,
    imageMediaId:
      patch.imageMediaId !== undefined ? patch.imageMediaId : ad.imageMediaId,
    format: patch.format ?? ad.format,
    videoMediaId:
      patch.videoMediaId !== undefined ? patch.videoMediaId : ad.videoMediaId,
    albumMediaIds:
      patch.albumMediaIds !== undefined
        ? patch.albumMediaIds
        : ad.albumMediaIds,
    buttons: patch.buttons !== undefined ? patch.buttons : ad.buttons,
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
  const resulting = ScheduledAd.fromSnapshot(props);
  resulting.validateInvariants();
  if (patch.enabled === false) {
    return resulting.disable();
  }
  if (patch.enabled === true || resulting.enabled) {
    if (ad.isExpired(now) && resulting.isExpired(now)) {
      return resulting.enable(now);
    }
  }
  return resulting;
};

/**
 * True for Postgres unique-constraint violations (PG code `23505`) —
 * used to map duplicate post `name` saves to 409 Conflict.
 */
export const isUniqueViolation = (err: unknown): boolean => {
  if (err === null || typeof err !== 'object') {
    return false;
  }
  const code = (err as { code?: unknown }).code;
  return code === '23505';
};
