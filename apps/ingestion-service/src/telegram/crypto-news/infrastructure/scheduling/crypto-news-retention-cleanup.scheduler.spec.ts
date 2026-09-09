import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { DataSource } from 'typeorm';
import {
  CryptoNewsRetentionCleanupScheduler,
  INGESTION_RETENTION_ADVISORY_LOCK_ID,
} from './crypto-news-retention-cleanup.scheduler';

jest.mock('fs', () => {
  const actual = jest.requireActual('fs') as unknown as Record<string, unknown>;
  const actualPromises = (actual['promises'] ?? {}) as Record<string, unknown>;
  return {
    ...actual,
    promises: {
      ...actualPromises,
      unlink: jest.fn(),
    },
  };
});
const mockedUnlink = fs.unlink as jest.MockedFunction<typeof fs.unlink>;

function makeConfig(retentionHours: number | undefined): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'app.uploads.root') return undefined;
      if (key === 'app.uploadsRoot') return undefined;
      if (key === 'app.uploads.mediaPath') return undefined;
      return retentionHours === undefined
        ? {}
        : { cryptoNewsMediaRetentionHours: retentionHours };
    },
  } as unknown as ConfigService;
}

type QueryFn = jest.Mock<Promise<unknown[]>, [string, ...unknown[]] | [string]>;

function makeDataSource(
  dbType: 'postgres' | 'sqlite',
  queryImpl: QueryFn = jest.fn(),
): DataSource {
  return {
    options: { type: dbType } as DataSource['options'],
    query: queryImpl,
  } as unknown as DataSource;
}

function lockResponder(query: QueryFn): void {
  query.mockImplementation((sql: string): Promise<unknown[]> => {
    if (sql === 'SELECT pg_try_advisory_lock($1) AS acquired') {
      return Promise.resolve([{ acquired: true }]);
    }
    if (sql === 'SELECT pg_advisory_unlock($1)') {
      return Promise.resolve([{ pg_advisory_unlock: null }]);
    }
    if (sql === 'SELECT file_path FROM crypto_news_message_media') {
      return Promise.resolve([]);
    }
    if (sql.startsWith('DELETE FROM crypto_news_messages WHERE id IN')) {
      return Promise.resolve([]);
    }
    if (
      sql.startsWith(
        'DELETE FROM crypto_news_message_media WHERE message_id NOT IN',
      )
    ) {
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  });
}

describe('CryptoNewsRetentionCleanupScheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses a fresh advisory lock id (never the backend 7_421_372)', () => {
    expect(INGESTION_RETENTION_ADVISORY_LOCK_ID).not.toBe(7_421_372);
    expect(INGESTION_RETENTION_ADVISORY_LOCK_ID).not.toBe(7_421_371);
    expect(INGESTION_RETENTION_ADVISORY_LOCK_ID).not.toBe(8_013_203);
  });

  it('case 1 (media expirada): unlinks the file and deletes the media row, then deletes the expired message row', async () => {
    mockedUnlink.mockResolvedValue(undefined);
    const query: QueryFn = jest.fn();
    lockResponder(query);
    query.mockImplementation((sql: string): Promise<unknown[]> => {
      if (sql === 'SELECT pg_try_advisory_lock($1) AS acquired') {
        return Promise.resolve([{ acquired: true }]);
      }
      if (sql === 'SELECT pg_advisory_unlock($1)') {
        return Promise.resolve([{ pg_advisory_unlock: null }]);
      }
      if (sql.startsWith('SELECT m.id, m.file_path')) {
        const calls = query.mock.calls.filter((c) =>
          c[0].startsWith('SELECT m.id, m.file_path'),
        ).length;
        if (calls === 1) {
          return Promise.resolve([
            { id: 'media-1', file_path: '/uploads/crypto-news/media/old.jpg' },
          ]);
        }
        return Promise.resolve([]);
      }
      if (sql === 'DELETE FROM crypto_news_message_media WHERE id = $1') {
        return Promise.resolve([]);
      }
      if (sql.startsWith('DELETE FROM crypto_news_messages WHERE id IN')) {
        const calls = query.mock.calls.filter((c) =>
          c[0].startsWith('DELETE FROM crypto_news_messages'),
        ).length;
        if (calls === 1) {
          return Promise.resolve([{ id: 'msg-old' }]);
        }
        return Promise.resolve([]);
      }
      if (
        sql.startsWith(
          'DELETE FROM crypto_news_message_media WHERE message_id NOT IN',
        )
      ) {
        return Promise.resolve([]);
      }
      if (sql === 'SELECT file_path FROM crypto_news_message_media') {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const scheduler = new CryptoNewsRetentionCleanupScheduler(
      makeDataSource('postgres', query),
      makeConfig(72),
    );
    await scheduler.tick();

    expect(mockedUnlink).toHaveBeenCalledWith(
      '/uploads/crypto-news/media/old.jpg',
    );
    expect(query).toHaveBeenCalledWith(
      'DELETE FROM crypto_news_message_media WHERE id = $1',
      ['media-1'],
    );
    const messageDeletes = query.mock.calls.filter((c) =>
      c[0].startsWith('DELETE FROM crypto_news_messages'),
    );
    expect(messageDeletes.length).toBeGreaterThanOrEqual(1);
  });

  it('case 2 (mensaje expirado + huerfana): sweeps media rows whose parent message is gone', async () => {
    const query: QueryFn = jest.fn();
    query.mockImplementation((sql: string): Promise<unknown[]> => {
      if (sql === 'SELECT pg_try_advisory_lock($1) AS acquired') {
        return Promise.resolve([{ acquired: true }]);
      }
      if (sql === 'SELECT pg_advisory_unlock($1)') {
        return Promise.resolve([{ pg_advisory_unlock: null }]);
      }
      if (sql.startsWith('SELECT m.id, m.file_path')) {
        return Promise.resolve([]);
      }
      if (sql.startsWith('DELETE FROM crypto_news_messages WHERE id IN')) {
        const calls = query.mock.calls.filter((c) =>
          c[0].startsWith('DELETE FROM crypto_news_messages'),
        ).length;
        if (calls === 1) {
          return Promise.resolve([{ id: 'msg-expired' }]);
        }
        return Promise.resolve([]);
      }
      if (
        sql.startsWith(
          'DELETE FROM crypto_news_message_media WHERE message_id NOT IN',
        )
      ) {
        return Promise.resolve([{ id: 'orphan-1' }, { id: 'orphan-2' }]);
      }
      if (sql === 'SELECT file_path FROM crypto_news_message_media') {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const scheduler = new CryptoNewsRetentionCleanupScheduler(
      makeDataSource('postgres', query),
      makeConfig(72),
    );
    await scheduler.tick();

    expect(query).toHaveBeenCalledWith(
      'DELETE FROM crypto_news_message_media WHERE message_id NOT IN ' +
        '(SELECT id FROM crypto_news_messages) RETURNING id',
    );
  });

  it('case 3 (vigente intacto): fresh rows trigger no DELETEs', async () => {
    const query: QueryFn = jest.fn();
    lockResponder(query);

    const scheduler = new CryptoNewsRetentionCleanupScheduler(
      makeDataSource('postgres', query),
      makeConfig(72),
    );
    await scheduler.tick();

    const deletes = query.mock.calls.filter((c) =>
      c[0].startsWith('DELETE FROM crypto_news_message_media WHERE id = $1'),
    );
    expect(deletes).toHaveLength(0);
    expect(mockedUnlink).not.toHaveBeenCalled();
  });

  it('case 4 (edad absoluta sin guard): expired message is deleted by ingested_at with no queue/backfill lookup', async () => {
    const query: QueryFn = jest.fn();
    query.mockImplementation((sql: string): Promise<unknown[]> => {
      if (sql === 'SELECT pg_try_advisory_lock($1) AS acquired') {
        return Promise.resolve([{ acquired: true }]);
      }
      if (sql === 'SELECT pg_advisory_unlock($1)') {
        return Promise.resolve([{ pg_advisory_unlock: null }]);
      }
      if (sql.startsWith('SELECT m.id, m.file_path')) {
        return Promise.resolve([]);
      }
      if (sql.startsWith('DELETE FROM crypto_news_messages WHERE id IN')) {
        const calls = query.mock.calls.filter((c) =>
          c[0].startsWith('DELETE FROM crypto_news_messages'),
        ).length;
        if (calls === 1) {
          return Promise.resolve([{ id: 'msg-never-matched' }]);
        }
        return Promise.resolve([]);
      }
      if (
        sql.startsWith(
          'DELETE FROM crypto_news_message_media WHERE message_id NOT IN',
        )
      ) {
        return Promise.resolve([]);
      }
      if (sql === 'SELECT file_path FROM crypto_news_message_media') {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const scheduler = new CryptoNewsRetentionCleanupScheduler(
      makeDataSource('postgres', query),
      makeConfig(72),
    );
    await scheduler.tick();

    const statements = query.mock.calls.map((c) => c[0]);
    expect(
      statements.some((s) =>
        s.startsWith('DELETE FROM crypto_news_messages WHERE id IN'),
      ),
    ).toBe(true);
    expect(
      statements.some(
        (s) =>
          s.includes('publisher_queue') ||
          s.includes('backfill_messages') ||
          s.includes('NOT IN (SELECT'),
      ) && statements.some((s) => s.includes('publisher_queue')),
    ).toBe(false);
    const windowed = query.mock.calls.find((c) =>
      c[0].startsWith('DELETE FROM crypto_news_messages'),
    );
    expect(windowed?.[1]).toEqual([72]);
  });

  it('already-gone file still deletes the row without aborting the batch', async () => {
    const gone = Object.assign(new Error('missing'), { code: 'ENOENT' });
    mockedUnlink.mockRejectedValueOnce(gone).mockResolvedValue(undefined);
    const query: QueryFn = jest.fn();
    query.mockImplementation((sql: string): Promise<unknown[]> => {
      if (sql === 'SELECT pg_try_advisory_lock($1) AS acquired') {
        return Promise.resolve([{ acquired: true }]);
      }
      if (sql === 'SELECT pg_advisory_unlock($1)') {
        return Promise.resolve([{ pg_advisory_unlock: null }]);
      }
      if (sql.startsWith('SELECT m.id, m.file_path')) {
        const calls = query.mock.calls.filter((c) =>
          c[0].startsWith('SELECT m.id, m.file_path'),
        ).length;
        if (calls === 1) {
          return Promise.resolve([
            { id: 'media-gone', file_path: '/uploads/gone.jpg' },
            { id: 'media-ok', file_path: '/uploads/ok.jpg' },
          ]);
        }
        return Promise.resolve([]);
      }
      if (sql === 'DELETE FROM crypto_news_message_media WHERE id = $1') {
        return Promise.resolve([]);
      }
      if (sql.startsWith('DELETE FROM crypto_news_messages WHERE id IN')) {
        return Promise.resolve([]);
      }
      if (
        sql.startsWith(
          'DELETE FROM crypto_news_message_media WHERE message_id NOT IN',
        )
      ) {
        return Promise.resolve([]);
      }
      if (sql === 'SELECT file_path FROM crypto_news_message_media') {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const scheduler = new CryptoNewsRetentionCleanupScheduler(
      makeDataSource('postgres', query),
      makeConfig(72),
    );
    await scheduler.tick();

    expect(query).toHaveBeenCalledWith(
      'DELETE FROM crypto_news_message_media WHERE id = $1',
      ['media-gone'],
    );
    expect(query).toHaveBeenCalledWith(
      'DELETE FROM crypto_news_message_media WHERE id = $1',
      ['media-ok'],
    );
  });

  it('permission-denied file keeps the row (skip) while the batch continues', async () => {
    const denied = Object.assign(new Error('denied'), { code: 'EACCES' });
    mockedUnlink.mockRejectedValueOnce(denied).mockResolvedValue(undefined);
    const query: QueryFn = jest.fn();
    query.mockImplementation((sql: string): Promise<unknown[]> => {
      if (sql === 'SELECT pg_try_advisory_lock($1) AS acquired') {
        return Promise.resolve([{ acquired: true }]);
      }
      if (sql === 'SELECT pg_advisory_unlock($1)') {
        return Promise.resolve([{ pg_advisory_unlock: null }]);
      }
      if (sql.startsWith('SELECT m.id, m.file_path')) {
        const calls = query.mock.calls.filter((c) =>
          c[0].startsWith('SELECT m.id, m.file_path'),
        ).length;
        if (calls === 1) {
          return Promise.resolve([
            { id: 'media-denied', file_path: '/uploads/denied.jpg' },
            { id: 'media-ok', file_path: '/uploads/ok.jpg' },
          ]);
        }
        return Promise.resolve([]);
      }
      if (sql === 'DELETE FROM crypto_news_message_media WHERE id = $1') {
        return Promise.resolve([]);
      }
      if (sql.startsWith('DELETE FROM crypto_news_messages WHERE id IN')) {
        return Promise.resolve([]);
      }
      if (
        sql.startsWith(
          'DELETE FROM crypto_news_message_media WHERE message_id NOT IN',
        )
      ) {
        return Promise.resolve([]);
      }
      if (sql === 'SELECT file_path FROM crypto_news_message_media') {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    const scheduler = new CryptoNewsRetentionCleanupScheduler(
      makeDataSource('postgres', query),
      makeConfig(72),
    );
    await scheduler.tick();

    expect(query).not.toHaveBeenCalledWith(
      'DELETE FROM crypto_news_message_media WHERE id = $1',
      ['media-denied'],
    );
    expect(query).toHaveBeenCalledWith(
      'DELETE FROM crypto_news_message_media WHERE id = $1',
      ['media-ok'],
    );
  });
});
