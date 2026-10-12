import { AddressSnapshotService } from './address-snapshot.service';
import { SnapshotAggregatorService } from 'aggregators/application/snapshot-aggregator.service';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import type { QuoteFetcher } from '../domain/snapshot-quote.types';

const ADDRESS = 'So11111111111111111111111111111111111111112';

function readyFetcher(): QuoteFetcher {
  return {
    name: 'dexscreener',
    supportsChains: ['solana'],
    fetch: async () => ({
      symbol: 'WIF',
      name: 'dogwifhat',
      priceUsd: 1.5,
    }),
  };
}

function buildService(fastPath: unknown): AddressSnapshotService {
  const catalog = {
    findById: async (id: string) => (id === 'solana' ? { id } : null),
  };
  const registry = {
    listProviders: () => [{ name: 'dexscreener', supportsChains: ['solana'] }],
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
  };
  const kinds = { detect: async () => 'token' as const };
  const cache = {
    get: jest.fn(async () => null),
    set: jest.fn(async () => undefined),
  };
  return new AddressSnapshotService(
    catalog as never,
    registry as never,
    kinds as never,
    new SnapshotAggregatorService(),
    new SnapshotHistoryRepository(),
    [readyFetcher()],
    cache as never,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    fastPath as never,
    null,
    null,
    null,
    null,
    null,
  );
}

describe('public-RPC rotation audit (dexter plan todo 42)', () => {
  it('merges fastPath rotation notes into providerErrors (existing seam)', async () => {
    const service = buildService({
      tryResolve: async () => null,
      drainRotationNotes: () => [
        {
          key: 'public-rotation:api.mainnet.solana.com',
          value:
            'backoff enter (429) — skipped for 5m, traffic on siblings; re-admit automatic',
        },
      ],
    });
    const snapshot = await service.getSnapshot({
      chain: 'solana',
      value: ADDRESS,
    });
    expect(
      snapshot.providerErrors['public-rotation:api.mainnet.solana.com'],
    ).toMatch(/backoff enter \(429\)/);
  });

  it('drains none when the fast path is absent (hand-built null)', async () => {
    const service = buildService(null);
    const snapshot = await service.getSnapshot({
      chain: 'solana',
      value: ADDRESS,
    });
    expect(
      Object.keys(snapshot.providerErrors).some((key) =>
        key.startsWith('public-rotation:'),
      ),
    ).toBe(false);
  });
});
