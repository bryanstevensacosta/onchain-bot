import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { DataSource } from 'typeorm';
import { MediaRetentionCleanupScheduler } from '../media-retention-cleanup.scheduler';

// Mock the fs module so the spec never touches real disk.
// jest.mock is hoisted above imports, so the mocked `fs.promises.unlink`
// is in place before the scheduler file is required at test time.
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

/**
 * Build a ConfigService mock that returns the supplied retention hours
 * (and any other field) under the `app` namespace — the scheduler reads
 * `config.get<AppConfig>('app')?.cryptoNewsMediaRetentionHours`.
 */
function makeConfig(retentionHours: number | undefined): ConfigService {
  return {
    get: () =>
      retentionHours === undefined
        ? {}
        : { cryptoNewsMediaRetentionHours: retentionHours },
  } as unknown as ConfigService;
}

/**
 * Type alias for the DataSource.query signature we mock. The real
 * DataSource.query has a few overloads (no-arg, named params,
 * positional params); we exercise only the positional-params one.
 */
type QueryFn = jest.Mock<Promise<unknown[]>, [string, ...unknown[]] | [string]>;

/**
 * Build a DataSource mock. We only need:
 *  - `options.type`  : the guard check
 *  - `query(sql, args?)` : the SQL pipe (lock/unlock + SELECT + DELETE)
 *
 * `query` is a `jest.fn()` whose return value is per-test configured
 * via the helpers below.
 */
function makeDataSource(
  dbType: 'postgres' | 'sqlite' | 'better-sqlite3' | 'mariadb' | 'mysql',
  queryImpl: QueryFn = jest.fn(),
): DataSource {
  return {
    options: { type: dbType } as DataSource['options'],
    query: queryImpl,
  } as unknown as DataSource;
}

/**
 * Default happy-path query responder for the SELECT-batch cases.
 * First call: returns the candidate rows.
 * Second call: returns `[]` (terminates the batch loop).
 * DELETE per-row is whatever the caller wires.
 */
function selectBatchThenEmpty(
  rows: ReadonlyArray<{ id: string; file_path: string }>,
): QueryFn {
  let selectCalls = 0;
  const query: QueryFn = jest
    .fn()
    .mockImplementation((sql: string): Promise<unknown[]> => {
      if (sql === 'SELECT pg_try_advisory_lock($1) AS acquired') {
        return Promise.resolve([{ acquired: true }]);
      }
      if (sql === 'SELECT pg_advisory_unlock($1)') {
        return Promise.resolve([{ pg_advisory_unlock: null }]);
      }
      if (
        sql.startsWith(
          'SELECT m.id, m.file_path FROM crypto_news_message_media m',
        )
      ) {
        selectCalls += 1;
        // First SELECT: rows. Second SELECT: empty → loop terminates.
        return Promise.resolve(selectCalls === 1 ? [...rows] : []);
      }
      if (sql.startsWith('DELETE FROM crypto_news_message_media WHERE id')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
  return query;
}

describe('MediaRetentionCleanupScheduler', () => {
  beforeEach(() => {
    mockedUnlink.mockReset();
    mockedUnlink.mockResolvedValue(undefined);
  });

  it('1. lock acquired=false → tick returns immediately, cleanup SQL NOT invoked', async () => {
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql === 'SELECT pg_try_advisory_lock($1) AS acquired') {
        return Promise.resolve([{ acquired: false }]);
      }
      return Promise.resolve([]);
    }) as unknown as QueryFn;
    const dataSource = makeDataSource('postgres', query);
    const scheduler = new MediaRetentionCleanupScheduler(
      dataSource,
      makeConfig(48),
    );

    await scheduler.tick();

    // The lock call was made exactly once.
    expect(query).toHaveBeenCalledWith(
      'SELECT pg_try_advisory_lock($1) AS acquired',
      [expect.any(Number)],
    );
    // No SELECT, no DELETE, no unlink.
    const selectCalls = query.mock.calls.filter((args) =>
      String(args[0]).startsWith(
        'SELECT m.id, m.file_path FROM crypto_news_message_media m',
      ),
    );
    expect(selectCalls).toHaveLength(0);
    expect(mockedUnlink).not.toHaveBeenCalled();
  });

  it('2. lock acquired=true → SELECT batch invoked, rows unlinked + deleted; unlock called in finally', async () => {
    const rows = [
      { id: 'media-1', file_path: '/uploads/crypto-news/media/ch/1_0.jpg' },
      { id: 'media-2', file_path: '/uploads/crypto-news/media/ch/2_0.png' },
    ];
    const query = selectBatchThenEmpty(rows);
    const dataSource = makeDataSource('postgres', query);
    const scheduler = new MediaRetentionCleanupScheduler(
      dataSource,
      makeConfig(48),
    );

    await scheduler.tick();

    // unlink called once per row, with the stored path AS-IS (no path.join).
    expect(mockedUnlink).toHaveBeenCalledTimes(2);
    expect(mockedUnlink).toHaveBeenNthCalledWith(
      1,
      '/uploads/crypto-news/media/ch/1_0.jpg',
    );
    expect(mockedUnlink).toHaveBeenNthCalledWith(
      2,
      '/uploads/crypto-news/media/ch/2_0.png',
    );

    // DELETE issued per row.
    const deleteCalls = query.mock.calls.filter((args) =>
      String(args[0]).startsWith(
        'DELETE FROM crypto_news_message_media WHERE id',
      ),
    );
    expect(deleteCalls).toHaveLength(2);
    expect(deleteCalls[0][1]).toEqual(['media-1']);
    expect(deleteCalls[1][1]).toEqual(['media-2']);

    // SELECT batch was invoked twice (1st → rows, 2nd → empty → loop ends).
    const selectCalls = query.mock.calls.filter((args) =>
      String(args[0]).startsWith(
        'SELECT m.id, m.file_path FROM crypto_news_message_media m',
      ),
    );
    expect(selectCalls).toHaveLength(2);
    // Interval must be derived from the retention hours (48 in this case).
    expect(selectCalls[0][1]).toEqual([48]);

    // Unlock issued (finally ran).
    const unlockCalls = query.mock.calls.filter(
      (args) => args[0] === 'SELECT pg_advisory_unlock($1)',
    );
    expect(unlockCalls).toHaveLength(1);
  });

  it('3. cleanup throws → unlock STILL called (finally), error swallowed (logged)', async () => {
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql === 'SELECT pg_try_advisory_lock($1) AS acquired') {
        return Promise.resolve([{ acquired: true }]);
      }
      if (sql === 'SELECT pg_advisory_unlock($1)') {
        return Promise.resolve([]);
      }
      if (
        sql.startsWith(
          'SELECT m.id, m.file_path FROM crypto_news_message_media m',
        )
      ) {
        return Promise.reject(new Error('synthetic SELECT failure'));
      }
      return Promise.resolve([]);
    }) as unknown as QueryFn;
    const dataSource = makeDataSource('postgres', query);
    const scheduler = new MediaRetentionCleanupScheduler(
      dataSource,
      makeConfig(48),
    );

    // Must not throw — the scheduler swallows the cleanup error and returns.
    await expect(scheduler.tick()).resolves.toBeUndefined();

    // Unlock was still issued in the finally block.
    const unlockCalls = query.mock.calls.filter(
      (args) => args[0] === 'SELECT pg_advisory_unlock($1)',
    );
    expect(unlockCalls).toHaveLength(1);
  });

  it('4. second concurrent tick → `this.running` guard returns immediately', async () => {
    let resolveSelect: (
      rows: ReadonlyArray<{ id: string; file_path: string }>,
    ) => void = () => undefined;
    const selectPromise = new Promise<
      ReadonlyArray<{ id: string; file_path: string }>
    >((resolve) => {
      resolveSelect = resolve;
    });

    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql === 'SELECT pg_try_advisory_lock($1) AS acquired') {
        return Promise.resolve([{ acquired: true }]);
      }
      if (sql === 'SELECT pg_advisory_unlock($1)') {
        return Promise.resolve([]);
      }
      if (
        sql.startsWith(
          'SELECT m.id, m.file_path FROM crypto_news_message_media m',
        )
      ) {
        return selectPromise;
      }
      if (sql.startsWith('DELETE FROM crypto_news_message_media WHERE id')) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }) as unknown as QueryFn;
    const dataSource = makeDataSource('postgres', query);
    const scheduler = new MediaRetentionCleanupScheduler(
      dataSource,
      makeConfig(48),
    );

    // Kick off the first tick. The cleanup step is blocked on the
    // unresolved SELECT promise, so `this.running` stays `true`.
    const first = scheduler.tick();
    // Yield once so the first tick reaches the cleanup step and sets running=true.
    await Promise.resolve();
    // The second tick observes running=true and must short-circuit.
    await scheduler.tick();

    // The second tick must not have issued any query at all (guard fires
    // before the lock try). The first tick is the only one that issued
    // an advisory lock call.
    const lockCalls = query.mock.calls.filter(
      (args) => args[0] === 'SELECT pg_try_advisory_lock($1) AS acquired',
    );
    expect(lockCalls).toHaveLength(1);

    // Unblock the first tick so the test cleans up.
    resolveSelect([]);
    await first;
  });

  it('5. dataSource.options.type !== "postgres" → tick returns immediately (no-DB guard)', async () => {
    // Use a non-postgres db type to exercise the in-memory / no-PG guard.
    const query = jest.fn() as unknown as QueryFn;
    const dataSource = makeDataSource('sqlite', query);
    const scheduler = new MediaRetentionCleanupScheduler(
      dataSource,
      makeConfig(48),
    );

    await scheduler.tick();

    // No query should have been issued at all (not even the lock).
    expect(query).not.toHaveBeenCalled();
    expect(mockedUnlink).not.toHaveBeenCalled();
  });

  // Adversarial: malformed input (CRYPTO_NEWS_MEDIA_RETENTION_HOURS=0 or
  // negative, or env var unset → undefined). The scheduler must clamp
  // to ≥ 1 hour so the cron can never run with a zero/negative interval
  // (which would DELETE every media row immediately on the first tick).
  it('6. malformed retention hours → clamped to ≥ 1 (asserted via the SELECT $1 binding)', async () => {
    // Sub-case A: explicitly 0 → must clamp to 1.
    const queryZero: QueryFn = jest
      .fn()
      .mockImplementation((sql: string): Promise<unknown[]> => {
        if (sql === 'SELECT pg_try_advisory_lock($1) AS acquired') {
          return Promise.resolve([{ acquired: true }]);
        }
        if (sql === 'SELECT pg_advisory_unlock($1)') {
          return Promise.resolve([]);
        }
        if (
          sql.startsWith(
            'SELECT m.id, m.file_path FROM crypto_news_message_media m',
          )
        ) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });
    const dataSourceZero = makeDataSource('postgres', queryZero);
    const schedulerZero = new MediaRetentionCleanupScheduler(
      dataSourceZero,
      makeConfig(0),
    );
    await schedulerZero.tick();
    const selectZero = queryZero.mock.calls.filter(
      (args) =>
        typeof args[0] === 'string' &&
        args[0].startsWith(
          'SELECT m.id, m.file_path FROM crypto_news_message_media m',
        ),
    );
    expect(selectZero).toHaveLength(1);
    // The clamp asserts that the hours value passed as $1 is 1, not 0.
    const zeroArgs = selectZero[0]?.[1];
    expect(Array.isArray(zeroArgs) && zeroArgs[0]).toBe(1);

    // Sub-case B: undefined (env var unset) → falls back to the
    // documented 48-hour default.
    const queryUndef: QueryFn = jest
      .fn()
      .mockImplementation((sql: string): Promise<unknown[]> => {
        if (sql === 'SELECT pg_try_advisory_lock($1) AS acquired') {
          return Promise.resolve([{ acquired: true }]);
        }
        if (sql === 'SELECT pg_advisory_unlock($1)') {
          return Promise.resolve([]);
        }
        if (
          sql.startsWith(
            'SELECT m.id, m.file_path FROM crypto_news_message_media m',
          )
        ) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });
    const dataSourceUndef = makeDataSource('postgres', queryUndef);
    const schedulerUndef = new MediaRetentionCleanupScheduler(
      dataSourceUndef,
      makeConfig(undefined),
    );
    await schedulerUndef.tick();
    const selectUndef = queryUndef.mock.calls.filter(
      (args) =>
        typeof args[0] === 'string' &&
        args[0].startsWith(
          'SELECT m.id, m.file_path FROM crypto_news_message_media m',
        ),
    );
    expect(selectUndef).toHaveLength(1);
    const undefArgs = selectUndef[0]?.[1];
    expect(Array.isArray(undefArgs) && undefArgs[0]).toBe(48);
  });
});
