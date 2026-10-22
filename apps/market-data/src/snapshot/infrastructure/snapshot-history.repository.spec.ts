import { AddressKind } from 'address/domain/address-kind';
import {
  emptySnapshotQuote,
  resolveStaleMaxAgeMs,
  SNAPSHOT_STALE_MAX_AGE_MS,
} from '../domain/snapshot-quote.types';
import { SnapshotHistoryRepository } from './snapshot-history.repository';
import type { SnapshotHistoryRow } from './snapshot-history.repository';

function row(key: string): Omit<SnapshotHistoryRow, 'createdAt'> {
  return {
    key,
    chain: 'solana',
    address: 'So11111111111111111111111111111111111111112',
    kind: 'token',
    status: 'ready',
    quote: emptySnapshotQuote(),
    sources: ['dexscreener'],
    providerErrors: {},
  };
}

/**
 * Failing-first spec (Tramo 3, todo 14, GAP-1).
 *
 * DB-backed history with an in-memory fallback: without a TypeORM
 * store the repository keeps the v1 ring semantics (save/list/count);
 * with one it delegates + maps. `deleteOlderThan` is the janitor
 * primitive on both paths. No live DB needed (the store is faked).
 */
describe('SnapshotHistoryRepository (persistent ring + janitor primitive)', () => {
  it('keeps ring semantics without a store (fallback)', async () => {
    const history = new SnapshotHistoryRepository();
    await history.save(row('solana:abc'));
    await history.save(row('solana:def'));
    expect(await history.count()).toBe(2);
    const recent = await history.listRecent(1);
    expect(recent).toHaveLength(1);
    expect(recent[0].key).toBe('solana:def');
    expect(typeof recent[0].createdAt).toBe('string');
  });

  it('prunes rows older than the cutoff without a store (fallback janitor)', async () => {
    const history = new SnapshotHistoryRepository();
    await history.save(row('solana:old'));
    await history.save(row('solana:fresh'));
    const deleted = await history.deleteOlderThan(
      new Date(Date.now() + 60_000),
    );
    expect(deleted).toBe(2);
    expect(await history.count()).toBe(0);
    await history.save(row('solana:fresh'));
    const kept = await history.deleteOlderThan(new Date(0));
    expect(kept).toBe(0);
    expect(await history.count()).toBe(1);
  });

  it('resolves the default stale bound to 24h and honors overrides', async () => {
    expect(resolveStaleMaxAgeMs(undefined)).toBe(24 * 60 * 60 * 1000);
    expect(resolveStaleMaxAgeMs('')).toBe(24 * 60 * 60 * 1000);
    expect(resolveStaleMaxAgeMs('not-a-number')).toBe(24 * 60 * 60 * 1000);
    expect(resolveStaleMaxAgeMs('0')).toBe(24 * 60 * 60 * 1000);
    expect(resolveStaleMaxAgeMs('-3')).toBe(24 * 60 * 60 * 1000);
    expect(resolveStaleMaxAgeMs('1')).toBe(60 * 60 * 1000);
    expect(resolveStaleMaxAgeMs('48')).toBe(48 * 60 * 60 * 1000);
  });

  it('delegates to the TypeORM store when one is injected', async () => {
    const saved: Array<Record<string, unknown>> = [];
    const store = {
      create: (input: Record<string, unknown>) => ({ ...input }),
      save: async (entity: Record<string, unknown>) => {
        saved.push(entity);
        return entity;
      },
      find: async () => saved,
      count: async () => saved.length,
      createQueryBuilder: () => ({
        delete: () => ({
          where: () => ({
            execute: async () => ({ affected: saved.length }),
          }),
        }),
      }),
    };
    const history = new SnapshotHistoryRepository(store as unknown as never);
    const created = await history.save(row('solana:abc'));
    expect(created.key).toBe('solana:abc');
    expect(typeof created.createdAt).toBe('string');
    expect(await history.count()).toBe(1);
    const recent = await history.listRecent(10);
    expect(recent[0].key).toBe('solana:abc');
  });
});

const HOUR_MS = 60 * 60 * 1000;

function readyRow(
  key: string,
  overrides: Partial<Omit<SnapshotHistoryRow, 'createdAt'>> = {},
): Omit<SnapshotHistoryRow, 'createdAt'> {
  return {
    key,
    chain: 'solana',
    address: 'So11111111111111111111111111111111111111112',
    kind: 'token',
    status: 'ready',
    quote: { ...emptySnapshotQuote(), symbol: 'WIF', name: 'dogwifhat' },
    sources: ['dexscreener'],
    providerErrors: {},
    ...overrides,
  };
}

/**
 * Serve-stale lookup (dexter plan todo 19b1): exact-key newest-ready
 * within the bound. Pendings never replay, over-bound rows answer
 * null, and the DB path constrains the query to the indexed
 * `(key, createdAt)` shape (equality + DESC + LIMIT 1) instead of a
 * full scan.
 */
describe('SnapshotHistoryRepository.findLatestReady (serve-stale floor)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-07T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('serves the newest ready row for the exact key', async () => {
    const history = new SnapshotHistoryRepository();
    await history.save(readyRow('solana:aaa'));
    jest.setSystemTime(new Date('2026-10-07T01:00:00.000Z'));
    await history.save(readyRow('solana:aaa'));
    const latest = await history.findLatestReady(
      'solana:aaa',
      'token',
      SNAPSHOT_STALE_MAX_AGE_MS,
    );
    expect(latest?.createdAt).toBe('2026-10-07T01:00:00.000Z');
    expect(latest?.status).toBe('ready');
  });

  it('answers null when history holds only pendings for the key', async () => {
    const history = new SnapshotHistoryRepository();
    await history.save(
      readyRow('solana:aaa', {
        status: 'pending',
        quote: emptySnapshotQuote(),
        sources: [],
      }),
    );
    jest.setSystemTime(new Date('2026-10-07T01:00:00.000Z'));
    await history.save(
      readyRow('solana:aaa', {
        status: 'pending',
        quote: emptySnapshotQuote(),
        sources: [],
      }),
    );
    await expect(
      history.findLatestReady('solana:aaa', 'token', SNAPSHOT_STALE_MAX_AGE_MS),
    ).resolves.toBeNull();
  });

  it('answers null when the newest ready row is over the bound', async () => {
    const history = new SnapshotHistoryRepository();
    await history.save(readyRow('solana:aaa'));
    jest.setSystemTime(new Date('2026-10-08T01:00:01.000Z'));
    await expect(
      history.findLatestReady('solana:aaa', 'token', SNAPSHOT_STALE_MAX_AGE_MS),
    ).resolves.toBeNull();
  });

  it('honors a custom bound (1h): 2h-old ready is over-bound', async () => {
    const history = new SnapshotHistoryRepository();
    await history.save(readyRow('solana:aaa'));
    jest.setSystemTime(new Date('2026-10-07T02:00:01.000Z'));
    await expect(
      history.findLatestReady('solana:aaa', 'token', HOUR_MS),
    ).resolves.toBeNull();
  });

  it('never leaks across keys or kinds', async () => {
    const history = new SnapshotHistoryRepository();
    await history.save(readyRow('solana:other'));
    await history.save(readyRow('solana:aaa', { kind: 'wallet' }));
    await expect(
      history.findLatestReady('solana:aaa', 'token', SNAPSHOT_STALE_MAX_AGE_MS),
    ).resolves.toBeNull();
  });

  it('queries the store by exact key (indexed shape, no full scan)', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const entity = {
      key: 'solana:aaa',
      chain: 'solana',
      address: 'So11111111111111111111111111111111111111112',
      kind: 'token',
      status: 'ready',
      quote: { ...emptySnapshotQuote(), symbol: 'WIF' },
      sources: ['dexscreener'],
      providerErrors: {},
      createdAt: new Date('2026-10-07T00:00:00.000Z'),
    };
    const store = {
      create: (input: Record<string, unknown>) => ({ ...input }),
      save: async (input: Record<string, unknown>) => input,
      find: async (args: Record<string, unknown>) => {
        seen.push(args);
        return [entity];
      },
      count: async () => 1,
      createQueryBuilder: () => ({
        delete: () => ({ where: () => ({ execute: async () => ({}) }) }),
      }),
    };
    const history = new SnapshotHistoryRepository(store as unknown as never);
    const latest = await history.findLatestReady(
      'solana:aaa',
      'token',
      SNAPSHOT_STALE_MAX_AGE_MS,
    );
    expect(latest?.key).toBe('solana:aaa');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      where: { key: 'solana:aaa', kind: 'token', status: 'ready' },
      order: { createdAt: 'DESC' },
      take: 1,
    });
  });

  it('answers null on the store path when the newest ready is over-bound', async () => {
    const entity = {
      key: 'solana:aaa',
      chain: 'solana',
      address: 'So11111111111111111111111111111111111111112',
      kind: 'token',
      status: 'ready',
      quote: { ...emptySnapshotQuote(), symbol: 'WIF' },
      sources: ['dexscreener'],
      providerErrors: {},
      createdAt: new Date('2026-10-06T00:00:00.000Z'),
    };
    const store = {
      create: (input: Record<string, unknown>) => ({ ...input }),
      save: async (input: Record<string, unknown>) => input,
      find: async () => [entity],
      count: async () => 1,
      createQueryBuilder: () => ({
        delete: () => ({ where: () => ({ execute: async () => ({}) }) }),
      }),
    };
    const history = new SnapshotHistoryRepository(store as unknown as never);
    jest.setSystemTime(new Date('2026-10-08T00:00:01.000Z'));
    await expect(
      history.findLatestReady('solana:aaa', 'token', SNAPSHOT_STALE_MAX_AGE_MS),
    ).resolves.toBeNull();
  });
});

/**
 * Staging bug 2026-10-22: `saveSeeded` persisted `chain`/`address`
 * verbatim, and `AddressSnapshotService.seedFdvAthHistory` passes the
 * CHECKSUMMED EVM address. The DB-path reads (`findFdvAth`,
 * `findAnchorAt`) lowercase the wanted value and apply a
 * case-SENSITIVE `where: { chain, address }`, so seeded rows were
 * invisible (`seeded` stayed false, the one-shot seed retried
 * forever). The in-memory path lowercases BOTH sides, which is why
 * the pre-existing fakes never caught it.
 *
 * The store double below APPLIES the `where` predicate with exact
 * case-sensitive equality — Postgres semantics — so these specs fail
 * if the write path ever stops normalizing.
 */
const EVM_CHECKSUMMED = '0xd3775c4D5C517AaCAe0CCF906DCD96713b5749cF';
const EVM_LOWER = '0xd3775c4d5c517aacae0ccf906dcd96713b5749cf';
const SEED_KEY = `bsc:${EVM_LOWER}`;
const SEED_CREATED_AT = '2026-10-14T00:00:00.001Z';

interface FakeHistoryEntity {
  key: string;
  chain: string;
  address: string;
  kind: string;
  status: string;
  quote: ReturnType<typeof emptySnapshotQuote>;
  sources: string[];
  providerErrors: Record<string, string>;
  createdAt: Date;
}

interface FakeFindArgs {
  readonly where?: Record<string, unknown>;
  readonly order?: Record<string, 'ASC' | 'DESC'>;
  readonly take?: number;
}

function caseSensitiveStore() {
  const rows: FakeHistoryEntity[] = [];
  const created: FakeHistoryEntity[] = [];
  const store = {
    create: (input: Record<string, unknown>) => {
      const entity = { ...input } as unknown as FakeHistoryEntity;
      created.push(entity);
      return entity;
    },
    save: async (entity: FakeHistoryEntity) => {
      rows.push(entity);
      return entity;
    },
    find: async (args: FakeFindArgs = {}) => {
      const where = args.where ?? {};
      const matched = rows.filter((row) =>
        Object.entries(where).every(
          ([field, wanted]) =>
            (row as unknown as Record<string, unknown>)[field] === wanted,
        ),
      );
      const [orderField, direction] = Object.entries(args.order ?? {})[0] ?? [];
      if (orderField !== undefined) {
        matched.sort((left, right) => {
          const leftMs = (left as unknown as Record<string, Date>)[
            orderField
          ].getTime();
          const rightMs = (right as unknown as Record<string, Date>)[
            orderField
          ].getTime();
          return direction === 'DESC' ? rightMs - leftMs : leftMs - rightMs;
        });
      }
      return typeof args.take === 'number'
        ? matched.slice(0, args.take)
        : matched;
    },
    count: async () => rows.length,
    createQueryBuilder: () => ({
      delete: () => ({
        where: () => ({
          execute: async () => ({ affected: rows.length }),
        }),
      }),
    }),
  };
  return { rows, created, store };
}

function seedInput(overrides: { readonly key?: string } = {}) {
  return {
    key: overrides.key ?? SEED_KEY,
    chain: 'bsc',
    address: EVM_CHECKSUMMED,
    kind: 'token',
    status: 'ready' as const,
    quote: { ...emptySnapshotQuote(), fdvUsd: 2483.9704 },
    sources: ['geckoterminal-ath-seed'],
    providerErrors: {},
    createdAt: SEED_CREATED_AT,
  };
}

describe('SnapshotHistoryRepository identity-case normalization (staging 2026-10-22)', () => {
  it('writes lowercase chain/address/key to the store', async () => {
    const fake = caseSensitiveStore();
    const history = new SnapshotHistoryRepository(
      fake.store as unknown as never,
    );
    await history.saveSeeded(seedInput({ key: `bsc:${EVM_CHECKSUMMED}` }));
    expect(fake.created).toHaveLength(1);
    expect(fake.created[0]).toMatchObject({
      key: SEED_KEY,
      chain: 'bsc',
      address: EVM_LOWER,
    });
  });

  it('resolves the seeded ATH for a checksummed address on the DB path', async () => {
    const fake = caseSensitiveStore();
    const history = new SnapshotHistoryRepository(
      fake.store as unknown as never,
    );
    await history.saveSeeded(seedInput());
    const lookup = await history.findFdvAth('bsc', EVM_CHECKSUMMED);
    expect(lookup.seeded).toBe(true);
    expect(lookup.ath).toEqual({ fdvUsd: 2483.9704, at: SEED_CREATED_AT });
  });

  it('finds the seeded row as the 24h anchor on the DB path', async () => {
    const fake = caseSensitiveStore();
    const history = new SnapshotHistoryRepository(
      fake.store as unknown as never,
    );
    await history.saveSeeded(seedInput());
    const target = Date.parse('2026-10-14T12:00:00.000Z');
    const anchor = await history.findAnchorAt(
      'bsc',
      EVM_CHECKSUMMED,
      target,
      24 * HOUR_MS,
    );
    expect(anchor?.address).toBe(EVM_LOWER);
    expect(anchor?.createdAt).toBe(SEED_CREATED_AT);
    expect(anchor?.status).toBe('ready');
  });

  it('resolves the seeded ATH for a checksummed address in memory (parity)', async () => {
    const history = new SnapshotHistoryRepository();
    await history.saveSeeded(seedInput());
    const lookup = await history.findFdvAth('bsc', EVM_CHECKSUMMED);
    expect(lookup.seeded).toBe(true);
    expect(lookup.ath).toEqual({ fdvUsd: 2483.9704, at: SEED_CREATED_AT });
  });

  it('finds the seeded row as the 24h anchor in memory (parity)', async () => {
    const history = new SnapshotHistoryRepository();
    await history.saveSeeded(seedInput());
    const target = Date.parse('2026-10-14T12:00:00.000Z');
    const anchor = await history.findAnchorAt(
      'bsc',
      EVM_CHECKSUMMED,
      target,
      24 * HOUR_MS,
    );
    expect(anchor?.address).toBe(EVM_LOWER);
    expect(anchor?.createdAt).toBe(SEED_CREATED_AT);
  });

  it('normalizes defensively on save too (live callers already lowercase)', async () => {
    const fake = caseSensitiveStore();
    const history = new SnapshotHistoryRepository(
      fake.store as unknown as never,
    );
    await history.save({
      key: `bsc:${EVM_CHECKSUMMED}`,
      chain: ' BSC ',
      address: EVM_CHECKSUMMED,
      kind: 'token',
      status: 'ready',
      quote: { ...emptySnapshotQuote(), fdvUsd: 2483.9704 },
      sources: ['geckoterminal-ath-seed'],
      providerErrors: {},
    });
    expect(fake.created[0]).toMatchObject({
      key: SEED_KEY,
      chain: 'bsc',
      address: EVM_LOWER,
    });
    const lookup = await history.findFdvAth('bsc', EVM_CHECKSUMMED);
    expect(lookup.seeded).toBe(true);
    expect(lookup.ath?.fdvUsd).toBe(2483.9704);
  });
});
