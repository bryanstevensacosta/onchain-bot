import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SnapshotModule } from '../snapshot.module';
import { AddressSnapshotService } from './address-snapshot.service';
import { DirectFastPathService } from './direct-fast-path.service';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import { SNAPSHOT_HISTORY_RETENTION_DAYS } from '../infrastructure/snapshot-history.entity';
import { LaunchpadDetectorService } from 'launchpad/application/launchpad-detector.service';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import {
  SNAPSHOT_QUOTE_PROVIDERS,
  emptySnapshotQuote,
} from '../domain/snapshot-quote.types';
import { toFdvAthOrNull } from '../domain/snapshot-fdv-ath';

/**
 * Trivial fixture (plan todo 16): `0xCfb3...` on ethereum, pool
 * Sep-24, live FDV ~5.6K. Specs seed multi-point history for this
 * pair (never a live network call — all fetchers stubbed null).
 */
const ETH = 'ethereum';
const CFB3 = '0xCfb3a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2';

const nullFetcher = {
  name: 'dexscreener',
  supportsChains: ['solana', 'ethereum', 'bsc', 'base', 'arbitrum', 'polygon'],
  fetch: async () => null,
};

function historyRow(fdvUsd: number | null) {
  return {
    key: `${ETH}:${CFB3.toLowerCase()}`,
    chain: ETH,
    address: CFB3,
    kind: 'token' as const,
    status: 'ready' as const,
    quote: { ...emptySnapshotQuote(), fdvUsd },
    sources: ['dexscreener'],
    providerErrors: {},
  };
}

describe('toFdvAthOrNull (fdv-ath boundary)', () => {
  it('passes a finite value + ISO timestamp verbatim', () => {
    expect(
      toFdvAthOrNull({ fdvUsd: 5600, at: '2024-09-24T12:00:00.000Z' }),
    ).toEqual({ fdvUsd: 5600, at: '2024-09-24T12:00:00.000Z' });
  });

  it.each([
    ['missing fdv', { at: '2024-09-24T12:00:00.000Z' }],
    ['null fdv', { fdvUsd: null, at: '2024-09-24T12:00:00.000Z' }],
    ['NaN fdv', { fdvUsd: Number.NaN, at: '2024-09-24T12:00:00.000Z' }],
    [
      'Infinity fdv',
      { fdvUsd: Number.POSITIVE_INFINITY, at: '2024-09-24T12:00:00.000Z' },
    ],
    ['string fdv', { fdvUsd: '5600', at: '2024-09-24T12:00:00.000Z' }],
    ['missing at', { fdvUsd: 5600 }],
    ['unparseable at', { fdvUsd: 5600, at: 'not-a-date' }],
    ['null', null],
    ['scalar', 5600],
    ['array', [{ fdvUsd: 5600, at: '2024-09-24T12:00:00.000Z' }]],
  ])('resolves null for %s, never passes opaque JSON', (_label, raw) => {
    expect(toFdvAthOrNull(raw)).toBeNull();
  });
});

describe('SnapshotHistoryRepository.findFdvAth (read-only aggregate)', () => {
  it('returns the exact max + its timestamp over multi-point history', async () => {
    const history = new SnapshotHistoryRepository();
    await history.save(historyRow(4200));
    const maxRow = await history.save(historyRow(5600));
    await history.save(historyRow(5100));
    const ath = await history.findFdvAth(ETH, CFB3);
    expect(ath).toEqual({ fdvUsd: 5600, at: maxRow.createdAt });
  });

  it('returns null on empty history (cold-start)', async () => {
    const history = new SnapshotHistoryRepository();
    expect(await history.findFdvAth(ETH, CFB3)).toBeNull();
  });

  it('returns the single point on single-point history', async () => {
    const history = new SnapshotHistoryRepository();
    const only = await history.save(historyRow(5600));
    expect(await history.findFdvAth(ETH, CFB3)).toEqual({
      fdvUsd: 5600,
      at: only.createdAt,
    });
  });

  it('skips malformed rows (null/NaN/Infinity fdv), never crashes', async () => {
    const history = new SnapshotHistoryRepository();
    await history.save(historyRow(null));
    await history.save(historyRow(Number.NaN));
    await history.save(historyRow(Number.POSITIVE_INFINITY));
    expect(await history.findFdvAth(ETH, CFB3)).toBeNull();
    const good = await history.save(historyRow(100));
    expect(await history.findFdvAth(ETH, CFB3)).toEqual({
      fdvUsd: 100,
      at: good.createdAt,
    });
  });

  it('isolates by (chain, address): other pairs never leak in', async () => {
    const history = new SnapshotHistoryRepository();
    await history.save({
      ...historyRow(99999),
      chain: 'solana',
      address: 'So11111111111111111111111111111111111111112',
      key: 'solana:so11111111111111111111111111111111111111112',
    });
    expect(await history.findFdvAth(ETH, CFB3)).toBeNull();
  });

  it('janitor window documented: pruned rows stop contributing (90d)', async () => {
    expect(SNAPSHOT_HISTORY_RETENTION_DAYS).toBe(90);
    const history = new SnapshotHistoryRepository();
    await history.save(historyRow(5600));
    const deleted = await history.deleteOlderThan(
      new Date(Date.now() + 60_000),
    );
    expect(deleted).toBe(1);
    expect(await history.findFdvAth(ETH, CFB3)).toBeNull();
  });

  it('never mutates history: count unchanged by reads', async () => {
    const history = new SnapshotHistoryRepository();
    await history.save(historyRow(4200));
    await history.save(historyRow(5600));
    await history.findFdvAth(ETH, CFB3);
    await history.findFdvAth(ETH, CFB3);
    expect(await history.count()).toBe(2);
  });
});

describe('AddressSnapshotService fdvAth plumbing (dexter fdv-ath)', () => {
  async function buildService(): Promise<{
    snapshots: AddressSnapshotService;
    history: SnapshotHistoryRepository;
  }> {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        SnapshotModule,
      ],
    })
      .overrideProvider(SNAPSHOT_QUOTE_PROVIDERS)
      .useValue([nullFetcher])
      .overrideProvider(LaunchpadDetectorService)
      .useValue({ detectLaunchpad: async () => null })
      .overrideProvider(DexScreenerService)
      .useValue({
        getBestPairSummary: async () => null,
        getBestPairSummaryForChain: async () => null,
      })
      // No live readers in fallback-contract specs.
      .overrideProvider(DirectFastPathService)
      .useValue({ tryResolve: async () => null })
      .compile();
    return {
      snapshots: module.get(AddressSnapshotService),
      history: module.get(SnapshotHistoryRepository),
    };
  }

  it('exposes snapshot.fdvAth from seeded multi-point history (exact max)', async () => {
    const { snapshots, history } = await buildService();
    await history.save(historyRow(4200));
    const maxRow = await history.save(historyRow(5600));
    await history.save(historyRow(5100));
    const snapshot = await snapshots.getSnapshot({
      chain: ETH,
      value: CFB3,
      kindHint: 'token',
    });
    expect(snapshot.fdvAth).toEqual({ fdvUsd: 5600, at: maxRow.createdAt });
  });

  it('resolves null on cold-start and NEVER substitutes the current FDV as ATH', async () => {
    const { snapshots } = await buildService();
    const snapshot = await snapshots.getSnapshot({
      chain: ETH,
      value: CFB3,
      kindHint: 'token',
    });
    expect(snapshot.fdvAth).toBeNull();
  });
});
