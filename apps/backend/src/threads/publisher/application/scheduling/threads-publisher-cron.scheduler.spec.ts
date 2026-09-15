import type { DataSource } from 'typeorm';
import { InMemoryThreadsLlmConfigRepository } from 'threads/publisher/application/repositories/in-memory-threads-llm-config.repository';
import {
  THREADS_PUBLISHER_ADVISORY_LOCK_ID,
  ThreadsPublisherCronScheduler,
} from './threads-publisher-cron.scheduler';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toBeOneOf(expected: ReadonlyArray<unknown>): R;
    }
  }
}

expect.extend({
  toBeOneOf(received: unknown, expected: ReadonlyArray<unknown>) {
    const pass = expected.includes(received);
    return {
      pass,
      message: () =>
        `expected ${String(received)} ${pass ? 'not ' : ''}to be one of ${JSON.stringify(expected)}`,
    };
  },
});

const dataSourceWith = (acquired: boolean) => {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('pg_try_advisory_lock')) {
      return [{ acquired }];
    }
    return [];
  });
  return { query, dataSource: { query } as unknown as DataSource };
};

describe('ThreadsPublisherCronScheduler', () => {
  it('uses lock 7_421_372 — never the crypto-news/ads/janitor ids', () => {
    expect(THREADS_PUBLISHER_ADVISORY_LOCK_ID).toBe(7_421_372);
    expect(THREADS_PUBLISHER_ADVISORY_LOCK_ID).not.toBeOneOf([
      7421371, 8013203, 9421373,
    ]);
  });

  it('drains one entry when the lock is free and publishing is enabled', async () => {
    const { query, dataSource } = dataSourceWith(true);
    const configRepo = new InMemoryThreadsLlmConfigRepository();
    configRepo.seed({ publishingEnabled: true });
    const processNext = { execute: jest.fn(async () => undefined) };
    const scheduler = new ThreadsPublisherCronScheduler(
      dataSource,
      processNext as never,
      configRepo,
    );

    await scheduler.tick();

    expect(processNext.execute).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      'SELECT pg_try_advisory_lock($1) AS acquired',
      [THREADS_PUBLISHER_ADVISORY_LOCK_ID],
    );
    expect(query).toHaveBeenCalledWith('SELECT pg_advisory_unlock($1)', [
      THREADS_PUBLISHER_ADVISORY_LOCK_ID,
    ]);
  });

  it('skips WITHOUT error when the lock is held elsewhere', async () => {
    const { dataSource } = dataSourceWith(false);
    const configRepo = new InMemoryThreadsLlmConfigRepository();
    configRepo.seed({ publishingEnabled: true });
    const processNext = { execute: jest.fn(async () => undefined) };
    const scheduler = new ThreadsPublisherCronScheduler(
      dataSource,
      processNext as never,
      configRepo,
    );

    await expect(scheduler.tick()).resolves.toBeUndefined();
    expect(processNext.execute).not.toHaveBeenCalled();
  });

  it('does nothing when publishingEnabled=false (gate before lock)', async () => {
    const { query, dataSource } = dataSourceWith(true);
    const configRepo = new InMemoryThreadsLlmConfigRepository();
    configRepo.seed({ publishingEnabled: false });
    const processNext = { execute: jest.fn(async () => undefined) };
    const scheduler = new ThreadsPublisherCronScheduler(
      dataSource,
      processNext as never,
      configRepo,
    );

    await scheduler.tick();

    expect(processNext.execute).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});
