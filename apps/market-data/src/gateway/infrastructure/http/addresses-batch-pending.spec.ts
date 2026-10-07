import { CacheService } from 'cache/application/cache.service';
import { InMemoryCacheAdapter } from 'cache/infrastructure/in-memory-cache.adapter';
import { AddressesBatchController } from './addresses-batch.controller';

function snapshot(status: 'pending' | 'ready') {
  return {
    chain: 'solana',
    address: 'So11111111111111111111111111111111111111112',
    kind: 'token',
    key: 'solana:so11111111111111111111111111111111111111112:token',
    status,
    providers: ['dexscreener'],
    sources: status === 'ready' ? ['dexscreener'] : [],
    providerErrors: status === 'ready' ? {} : { dexscreener: 'down' },
    priceUsd: status === 'ready' ? 1.5 : null,
    liquidityUsd: null,
    volume24hUsd: null,
    marketCapUsd: null,
    fdvUsd: null,
    priceChange24h: null,
    holders: null,
    top10HolderPercent: null,
    symbol: status === 'ready' ? 'WIF' : null,
    name: status === 'ready' ? 'dogwifhat' : null,
    lockedLiquidityPercent: null,
    burnedPercent: null,
  };
}

function makeController(status: 'pending' | 'ready', stale = false) {
  const getSnapshot = jest.fn(async () => ({ ...snapshot(status), stale }));
  const controller = new AddressesBatchController(
    { getSnapshot } as never,
    new CacheService(new InMemoryCacheAdapter()),
  );
  return { controller, getSnapshot };
}

const BODY = {
  items: [
    {
      chain: 'solana',
      address: 'So11111111111111111111111111111111111111112',
    },
  ],
};

/**
 * Batch no-negative-cache (plan todo 19a, writer 3 of 3): pending
 * snapshots are NEVER written under the shared GET-edge key, so batch
 * traffic stops re-warming single reads with fresh pending shells.
 * P12-repeat at the batch site: the second call re-runs the loader.
 */
describe('AddressesBatchController (pending snapshots bypass the batch cache)', () => {
  it('re-runs the loader on repeat when the snapshot is pending', async () => {
    const { controller, getSnapshot } = makeController('pending');
    const first = await controller.getBatch(BODY);
    const second = await controller.getBatch(BODY);
    expect(getSnapshot).toHaveBeenCalledTimes(2);
    expect(first.snapshots[0]).toMatchObject({ status: 'pending' });
    expect(second.snapshots[0]).toMatchObject({ status: 'pending' });
  });

  it('warms the shared key once when the snapshot is ready', async () => {
    const { controller, getSnapshot } = makeController('ready');
    await controller.getBatch(BODY);
    await controller.getBatch(BODY);
    expect(getSnapshot).toHaveBeenCalledTimes(1);
  });

  it('re-runs the loader on repeat when the snapshot is a stale replay (never frozen)', async () => {
    const { controller, getSnapshot } = makeController('ready', true);
    const first = await controller.getBatch(BODY);
    const second = await controller.getBatch(BODY);
    expect(getSnapshot).toHaveBeenCalledTimes(2);
    expect(first.snapshots[0]).toMatchObject({ status: 'ready', stale: true });
    expect(second.snapshots[0]).toMatchObject({
      status: 'ready',
      stale: true,
    });
  });
});
