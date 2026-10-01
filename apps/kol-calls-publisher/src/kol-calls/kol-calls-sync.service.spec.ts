import { KolCallsSyncService } from './kol-calls-sync.service';

describe('KolCallsSyncService', () => {
  afterEach(() => {
    delete process.env.KOL_CALLS_SYNC_ENABLED;
    delete process.env.KOL_CALLS_SYNC_LIMIT;
  });

  function harness(overrides?: {
    mentions?: Array<Record<string, unknown>>;
    snapshots?: Array<Record<string, unknown>>;
    fail?: boolean;
    scored?: Array<{ id: string }>;
  }) {
    const saved: Array<{ id: string }> = [];
    const client = {
      listMentions: async () => {
        if (overrides?.fail) {
          throw new Error('downstream down');
        }
        const items = overrides?.mentions ?? [];
        return { items, total: items.length, limit: 50, offset: 0 };
      },
      listSnapshots: async () => {
        if (overrides?.fail) {
          throw new Error('downstream down');
        }
        const items = overrides?.snapshots ?? [];
        return { items, total: items.length, limit: 50, offset: 0 };
      },
    };
    const scorer = {
      execute: async (input: { mentions: Array<Record<string, unknown>> }) => ({
        scored:
          overrides?.scored ??
          input.mentions.map((m) => ({ id: m['mentionId'] as string })),
        events: [],
        discarded: 0,
      }),
    };
    const scoredRepo = {
      save: async (row: { id: string }) => {
        saved.push(row);
      },
    };
    const service = new KolCallsSyncService(
      client as never,
      scorer as never,
      scoredRepo as never,
    );
    return { service, saved, scorer };
  }

  it('skips when the sync flag is off', async () => {
    process.env.KOL_CALLS_SYNC_ENABLED = 'false';
    const { service } = harness();
    await expect(service.tick()).resolves.toEqual({ scored: 0, skipped: true });
  });

  it('skips the tick on upstream failure (never throws)', async () => {
    process.env.KOL_CALLS_SYNC_ENABLED = 'true';
    const { service } = harness({ fail: true });
    await expect(service.syncOnce()).resolves.toEqual({
      scored: 0,
      skipped: true,
    });
  });

  it('joins mentions + snapshots by id and persists scored rows', async () => {
    process.env.KOL_CALLS_SYNC_ENABLED = 'true';
    const { service, saved } = harness({
      mentions: [
        {
          id: 'm1',
          kolId: 'k1',
          messageId: 1,
          contractIndex: 0,
          chain: 'solana',
          address: 'A1',
          ticker: 'T1',
        },
      ],
      snapshots: [
        {
          mentionId: 'm1',
          marketCapUsd: 1000,
          priceUsd: 1,
          liquidityUsd: 500,
          holders: 10,
          symbol: 'T1',
        },
      ],
    });
    await expect(service.syncOnce()).resolves.toEqual({
      scored: 1,
      skipped: false,
    });
    expect(saved).toHaveLength(1);
  });
});
