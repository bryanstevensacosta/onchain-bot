/**
 * Specs for the kols→feed backfill script (plan item 6).
 *
 * Covers the mapping the script relies on (KolView → batch item type='kol'),
 * the dry-run planner (zero IO), chunking, and the abort-before-write
 * contract (backend unreachable → no batch POST ever issued).
 *
 * The batch endpoint behavior itself (upsert-by-PK, re-run → updated:0,
 * validate-before-write, 500 cap) is specified in
 * `src/registry/api/http/sources.controller.spec.ts`
 * ("RegisterNewsSourceUseCase (feed repo wiring + batch)"); the last test
 * below pins the no-second-row invariant explicitly for the backfill path.
 */
import {
  BATCH_SERVER_CAP,
  BackendUnreachableError,
  chunkItems,
  fetchBackendKols,
  mapKolToBatchItem,
  planBackfill,
  runBackfill,
  type BackfillKolView,
  type FeedBatchItem,
} from './backfill-kols-to-feed';
import { RegisterNewsSourceUseCase } from '../src/registry/application/use-cases/register-news-source.use-case';

function kol(overrides: Partial<BackfillKolView> = {}): BackfillKolView {
  return {
    id: '-1001234567890',
    handle: 'watcher',
    title: 'Watcher',
    isActive: true,
    lifecycleStatus: 'ACTIVE',
    lastIngestedAt: null,
    ...overrides,
  };
}

function okJson(payload: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

describe('backfill-kols-to-feed mapping (KolView → type=kol batch item)', () => {
  it('maps kol_id → channel_id, handle/title through, type=kol', () => {
    const out = mapKolToBatchItem(kol());
    expect(out).toEqual({
      channelId: '-1001234567890',
      handle: 'watcher',
      title: 'Watcher',
      type: 'kol',
      isActive: true,
      lifecycleStatus: 'ACTIVE',
    });
  });

  it('maps lifecycle ACTIVE → ACTIVE, DORMANT/BLACKLISTED → INACTIVE', () => {
    expect(mapKolToBatchItem(kol({ lifecycleStatus: 'ACTIVE' })).lifecycleStatus).toBe(
      'ACTIVE',
    );
    expect(
      mapKolToBatchItem(kol({ lifecycleStatus: 'DORMANT' })).lifecycleStatus,
    ).toBe('INACTIVE');
    expect(
      mapKolToBatchItem(kol({ lifecycleStatus: 'BLACKLISTED' })).lifecycleStatus,
    ).toBe('INACTIVE');
  });

  it('passes isActive through literally (active-set query matches backend findActive)', () => {
    expect(mapKolToBatchItem(kol({ isActive: false })).isActive).toBe(false);
    expect(mapKolToBatchItem(kol({ isActive: true })).isActive).toBe(true);
  });

  it('normalizes blank handles to null', () => {
    expect(mapKolToBatchItem(kol({ handle: '  ' })).handle).toBeNull();
    expect(mapKolToBatchItem(kol({ handle: null })).handle).toBeNull();
  });

  it('rejects empty id/title before any write', () => {
    expect(() => mapKolToBatchItem(kol({ id: '  ' }))).toThrow(
      /kol_id.*cannot be empty/,
    );
    expect(() => mapKolToBatchItem(kol({ id: 'not-a-number' }))).toThrow(
      /invalid format/,
    );
    expect(() => mapKolToBatchItem(kol({ title: '  ' }))).toThrow(
      /title.*cannot be empty/,
    );
  });
});

describe('backfill-kols-to-feed planner (dry-run, zero IO)', () => {
  it('plans N items with a lifecycle histogram and no side effects', () => {
    const plan = planBackfill([
      kol({ id: '1', lifecycleStatus: 'ACTIVE' }),
      kol({ id: '2', lifecycleStatus: 'DORMANT' }),
      kol({ id: '3', lifecycleStatus: 'BLACKLISTED' }),
    ]);
    expect(plan.total).toBe(3);
    expect(plan.byLifecycle).toEqual({ ACTIVE: 1, INACTIVE: 2 });
    expect(plan.items.every((i: FeedBatchItem) => i.type === 'kol')).toBe(true);
  });

  it('chunks at the server cap boundary', () => {
    expect(chunkItems([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(chunkItems([], 500)).toEqual([]);
    expect(() => chunkItems([1], 0)).toThrow(/positive integer/);
    expect(BATCH_SERVER_CAP).toBe(500);
  });
});

describe('backfill-kols-to-feed abort-before-write contract', () => {
  it('fetchBackendKols throws BackendUnreachableError on network failure', async () => {
    const failing = async () => {
      throw new Error('ECONNREFUSED');
    };
    await expect(
      fetchBackendKols('http://localhost:3040', failing as never),
    ).rejects.toBeInstanceOf(BackendUnreachableError);
  });

  it('fetchBackendKols throws BackendUnreachableError on non-2xx', async () => {
    const bad = async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
      text: async () => '',
    });
    await expect(
      fetchBackendKols('http://localhost:3040', bad as never),
    ).rejects.toBeInstanceOf(BackendUnreachableError);
  });

  it('runBackfill dry-run issues zero POSTs (fetch only)', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string, init?: { method?: string }) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if ((init?.method ?? 'GET') === 'POST') {
        throw new Error('must not POST in dry-run');
      }
      return okJson([kol(), kol({ id: '2' })]);
    }) as never;
    const report = await runBackfill(
      {
        backendUrl: 'http://localhost:3040',
        ingestionUrl: 'http://localhost:3039',
        dryRun: true,
      },
      { fetchImpl },
    );
    expect(report.dryRun).toBe(true);
    expect(report.fetched).toBe(2);
    expect(report.batchesSent).toBe(0);
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false);
  });

  it('runBackfill aborts with zero POSTs when the backend is down', async () => {
    const posts: string[] = [];
    const fetchImpl = (async (url: string, init?: { method?: string }) => {
      if ((init?.method ?? 'GET') === 'POST') {
        posts.push(url);
      }
      throw new Error('ECONNREFUSED 127.0.0.1:3040');
    }) as never;
    await expect(
      runBackfill(
        {
          backendUrl: 'http://localhost:3040',
          ingestionUrl: 'http://localhost:3039',
          dryRun: false,
        },
        { fetchImpl },
      ),
    ).rejects.toBeInstanceOf(BackendUnreachableError);
    expect(posts).toHaveLength(0);
  });

  it('runBackfill real run posts chunks then reports parity', async () => {
    const posts: Array<{ url: string; n: number }> = [];
    const fetchImpl = (async (url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? 'GET';
      if (method === 'POST') {
        const parsed = JSON.parse(init?.body ?? '{}') as {
          sources: unknown[];
        };
        posts.push({ url, n: parsed.sources.length });
        return okJson({ created: parsed.sources.length, updated: 0, total: 2 });
      }
      if (url.includes('/telegram-kol/identity/kols')) {
        return okJson([kol(), kol({ id: '2' })]);
      }
      return okJson([kol(), kol({ id: '2' })]);
    }) as never;
    const report = await runBackfill(
      {
        backendUrl: 'http://localhost:3040',
        ingestionUrl: 'http://localhost:3039',
        dryRun: false,
      },
      { fetchImpl },
    );
    expect(report.batchesSent).toBe(1);
    expect(report.created).toBe(2);
    expect(report.feedKolCountAfter).toBe(2);
    expect(report.countMatch).toBe(true);
  });
});

describe('batch upsert no-duplicate invariant (backfill reliance)', () => {
  it('re-running the same kol payload creates no second row', async () => {
    const store = new Map<string, Record<string, unknown>>();
    const repo = {
      findByChannelId: jest.fn(async (id: string) => store.get(id) ?? null),
      create: jest.fn(
        (channelId: string, title: string, handle?: string, type = 'crypto-news') => ({
          channelId,
          title,
          handle: handle ?? null,
          type,
          isActive: true,
          lifecycleStatus: 'ACTIVE',
          lastIngestedAt: null,
          addedAt: new Date('2026-09-22T00:00:00Z'),
        }),
      ),
      save: jest.fn(async (s: Record<string, unknown>) => {
        store.set(s['channelId'] as string, s);
        return s;
      }),
    };
    const listener: any = {
      resolveChannelMetadata: jest.fn(async () => ({
        title: 'Resolved',
        handle: 'resolved',
      })),
    };
    const useCase = new RegisterNewsSourceUseCase(repo as never, listener);
    const payload = {
      sources: [
        {
          channelId: '-1001234567890',
          handle: 'watcher',
          title: 'Watcher',
          type: 'kol' as const,
          isActive: true,
          lifecycleStatus: 'ACTIVE' as const,
        },
      ],
    };
    const first = await useCase.executeBatch(payload);
    const second = await useCase.executeBatch(payload);
    expect(first).toMatchObject({ created: 1, updated: 0, total: 1 });
    expect(second).toMatchObject({ created: 0, updated: 0, total: 1 });
    expect(store.size).toBe(1);
  });
});
