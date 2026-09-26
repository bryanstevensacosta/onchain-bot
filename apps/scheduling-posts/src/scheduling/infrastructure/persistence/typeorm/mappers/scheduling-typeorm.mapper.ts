import { ScheduledAd } from '../../../../domain/scheduled-ad.entity';
import { SchedulingConfig } from '../../../../domain/scheduling-config.entity';
import { SchedulingState } from '../../../../domain/scheduling-state.entity';
import { AdMediaLibraryEntry } from '../../../../domain/ad-media-library-entry.entity';
import type { ScheduledAdMediaRecord } from '../../../../domain/ports/scheduled-ad-media.repository';
import { ScheduledAdOrmEntity } from '../scheduled-ad.orm-entity';
import { ScheduledAdMediaOrmEntity } from '../scheduled-ad-media.orm-entity';
import { AdMediaLibraryOrmEntity } from '../ad-media-library.orm-entity';
import { SchedulingConfigOrmEntity } from '../scheduling-config.orm-entity';
import { SchedulingStateOrmEntity } from '../scheduling-state.orm-entity';

/**
 * TypeORM mappers for the scheduling tables (GAP-1: shapes + mappers
 * ship UNWIRED, in-memory adapters are live).
 */
export function toScheduledAdOrmEntity(ad: ScheduledAd): ScheduledAdOrmEntity {
  const row = new ScheduledAdOrmEntity();
  row.id = ad.id;
  row.name = ad.name;
  row.body = ad.body;
  row.format = ad.format;
  row.imageMediaId = ad.imageMediaId;
  row.videoMediaId = ad.videoMediaId;
  row.albumMediaIds = ad.albumMediaIds ? [...ad.albumMediaIds] : null;
  row.buttons = ad.buttons ? [...ad.buttons] : null;
  row.enabled = ad.enabled;
  row.order = ad.order;
  row.timesPublished = ad.timesPublished;
  row.consecutiveFailures = ad.consecutiveFailures;
  row.lastPublishedAt = ad.lastPublishedAt;
  row.expiresAt = ad.expiresAt;
  row.expirationAction = ad.expirationAction;
  row.createdAt = ad.createdAt;
  row.updatedAt = ad.updatedAt;
  return row;
}

export function fromScheduledAdOrmEntity(
  row: ScheduledAdOrmEntity,
): ScheduledAd {
  return ScheduledAd.fromSnapshot({
    id: row.id,
    name: row.name,
    body: row.body,
    imageMediaId: row.imageMediaId,
    format: row.format as ScheduledAd['format'],
    videoMediaId: row.videoMediaId,
    albumMediaIds: row.albumMediaIds,
    buttons: row.buttons,
    enabled: row.enabled,
    order: row.order,
    timesPublished: row.timesPublished,
    consecutiveFailures: row.consecutiveFailures,
    lastPublishedAt: row.lastPublishedAt,
    expiresAt: row.expiresAt,
    expirationAction: row.expirationAction as ScheduledAd['expirationAction'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toScheduledAdMediaOrmEntity(
  record: ScheduledAdMediaRecord,
): ScheduledAdMediaOrmEntity {
  const row = new ScheduledAdMediaOrmEntity();
  row.id = record.id;
  row.adId = record.adId;
  row.filePath = record.filePath;
  row.mimeType = record.mimeType;
  row.fileSize = record.fileSize;
  row.createdAt = record.createdAt;
  return row;
}

export function toAdMediaLibraryOrmEntity(
  entry: AdMediaLibraryEntry,
): AdMediaLibraryOrmEntity {
  const row = new AdMediaLibraryOrmEntity();
  row.id = entry.id;
  row.filePath = entry.filePath;
  row.contentHash = entry.contentHash;
  row.originalFileName = entry.originalFileName;
  row.mimeType = entry.mimeType;
  row.fileSize = entry.fileSize;
  row.createdAt = entry.createdAt;
  return row;
}

export function fromAdMediaLibraryOrmEntity(
  row: AdMediaLibraryOrmEntity,
): AdMediaLibraryEntry {
  return AdMediaLibraryEntry.fromSnapshot({
    id: row.id,
    filePath: row.filePath,
    contentHash: row.contentHash,
    originalFileName: row.originalFileName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    createdAt: row.createdAt,
  });
}

export function toSchedulingConfigOrmEntity(
  config: SchedulingConfig,
): SchedulingConfigOrmEntity {
  const row = new SchedulingConfigOrmEntity();
  row.id = config.id;
  row.enabled = config.enabled;
  row.everyNPosts = config.everyNPosts;
  row.minMinutesBetweenAds = config.minMinutesBetweenAds;
  row.telegramPublishDelayMs = config.limitsFor('telegram').publishDelayMs;
  row.telegramDailyCap = config.limitsFor('telegram').dailyCap;
  row.threadsPublishDelayMs = config.limitsFor('threads').publishDelayMs;
  row.threadsDailyCap = config.limitsFor('threads').dailyCap;
  row.createdAt = config.createdAt;
  row.updatedAt = config.updatedAt;
  return row;
}

export function fromSchedulingConfigOrmEntity(
  row: SchedulingConfigOrmEntity,
): SchedulingConfig {
  return SchedulingConfig.fromSnapshot({
    id: row.id,
    enabled: row.enabled,
    everyNPosts: row.everyNPosts,
    minMinutesBetweenAds: row.minMinutesBetweenAds,
    telegram: {
      publishDelayMs: Number(row.telegramPublishDelayMs),
      dailyCap: row.telegramDailyCap,
    },
    threads: {
      publishDelayMs: Number(row.threadsPublishDelayMs),
      dailyCap: row.threadsDailyCap,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toSchedulingStateOrmEntity(
  state: SchedulingState,
): SchedulingStateOrmEntity {
  const row = new SchedulingStateOrmEntity();
  row.id = state.id;
  row.postsSinceLastAd = state.postsSinceLastAd;
  const telegram = state.cursorFor('telegram');
  row.telegramLastAdId = telegram.lastAdId;
  row.telegramLastPublishedAt = telegram.lastPublishedAt;
  row.telegramPublishedToday = telegram.publishedToday;
  row.telegramDayKey = telegram.dayKey;
  const threads = state.cursorFor('threads');
  row.threadsLastAdId = threads.lastAdId;
  row.threadsLastPublishedAt = threads.lastPublishedAt;
  row.threadsPublishedToday = threads.publishedToday;
  row.threadsDayKey = threads.dayKey;
  row.updatedAt = state.updatedAt;
  return row;
}

export function fromSchedulingStateOrmEntity(
  row: SchedulingStateOrmEntity,
): SchedulingState {
  return SchedulingState.fromSnapshot({
    id: row.id,
    postsSinceLastAd: row.postsSinceLastAd,
    telegram: {
      lastAdId: row.telegramLastAdId,
      lastPublishedAt: row.telegramLastPublishedAt,
      publishedToday: row.telegramPublishedToday,
      dayKey: row.telegramDayKey,
    },
    threads: {
      lastAdId: row.threadsLastAdId,
      lastPublishedAt: row.threadsLastPublishedAt,
      publishedToday: row.threadsPublishedToday,
      dayKey: row.threadsDayKey,
    },
    updatedAt: row.updatedAt,
  });
}
