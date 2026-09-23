import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import {
  AGGRESSIVE_CLEANUP_RETENTION_HOURS,
  CryptoNewsRetentionCleanupScheduler,
} from './crypto-news-retention-cleanup.scheduler';
import { DiskMonitorError, DiskMonitorService } from './disk-monitor.service';

function makeConfig(retentionHours = 72): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'app.uploads.root') return undefined;
      if (key === 'app.uploadsRoot') return undefined;
      if (key === 'app.uploads.mediaPath') return undefined;
      return { cryptoNewsMediaRetentionHours: retentionHours };
    },
  } as unknown as ConfigService;
}

type QueryFn = jest.Mock<Promise<unknown[]>, [string, ...unknown[]] | [string]>;

function makeDataSource(queryImpl: QueryFn): DataSource {
  return {
    options: { type: 'postgres' } as DataSource['options'],
    query: queryImpl,
  } as unknown as DataSource;
}

function idleQuery(): QueryFn {
  const query: QueryFn = jest.fn();
  query.mockImplementation((sql: string): Promise<unknown[]> => {
    if (sql === 'SELECT pg_try_advisory_lock($1) AS acquired') {
      return Promise.resolve([{ acquired: true }]);
    }
    if (sql === 'SELECT pg_advisory_unlock($1)') {
      return Promise.resolve([{ pg_advisory_unlock: null }]);
    }
    return Promise.resolve([]);
  });
  return query;
}

function makeDiskMonitor(usage: number | Error): DiskMonitorService {
  return {
    getDiskUsage: jest.fn().mockImplementation(() => {
      if (usage instanceof Error) return Promise.reject(usage);
      return Promise.resolve(usage);
    }),
    getDirectorySize: jest.fn().mockResolvedValue(0),
    getUploadsRoot: jest.fn().mockReturnValue('/uploads'),
  } as unknown as DiskMonitorService;
}

describe('CryptoNewsRetentionCleanupScheduler disk-aware cleanup', () => {
  it('disk at 85% invokes the normal cleanup early', async () => {
    const query = idleQuery();
    const scheduler = new CryptoNewsRetentionCleanupScheduler(
      makeDataSource(query),
      makeConfig(),
      makeDiskMonitor(85),
    );
    const spy = jest.spyOn(scheduler, 'cleanupExpiredContent');
    await scheduler.checkDiskAndCleanup();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith();
    expect(
      query.mock.calls.some((c) =>
        c[0].startsWith('DELETE FROM telegram_feed_messages'),
      ),
    ).toBe(true);
  });

  it('disk at 95% uses the 48h aggressive cutoff', async () => {
    const query = idleQuery();
    const scheduler = new CryptoNewsRetentionCleanupScheduler(
      makeDataSource(query),
      makeConfig(),
      makeDiskMonitor(95),
    );
    await scheduler.checkDiskAndCleanup();
    const windowed = query.mock.calls.find((c) =>
      c[0].startsWith('DELETE FROM telegram_feed_messages'),
    );
    expect(windowed?.[1]).toEqual([AGGRESSIVE_CLEANUP_RETENTION_HOURS]);
    expect(AGGRESSIVE_CLEANUP_RETENTION_HOURS).toBe(48);
  });

  it('failed disk probe is logged and the scheduler survives', async () => {
    const query = idleQuery();
    const scheduler = new CryptoNewsRetentionCleanupScheduler(
      makeDataSource(query),
      makeConfig(),
      makeDiskMonitor(new DiskMonitorError('statfs failed: EIO')),
    );
    await expect(scheduler.checkDiskAndCleanup()).resolves.toBeUndefined();
    expect(
      query.mock.calls.some((c) =>
        c[0].startsWith('DELETE FROM telegram_feed_messages'),
      ),
    ).toBe(false);
  });

  it('nominal disk usage triggers no cleanup', async () => {
    const query = idleQuery();
    const scheduler = new CryptoNewsRetentionCleanupScheduler(
      makeDataSource(query),
      makeConfig(),
      makeDiskMonitor(42),
    );
    const spy = jest.spyOn(scheduler, 'cleanupExpiredContent');
    await scheduler.checkDiskAndCleanup();
    expect(spy).not.toHaveBeenCalled();
  });
});
