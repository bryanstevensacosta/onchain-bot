import { DevHoldingsService } from './dev-holdings.service';

const MINT = 'So11111111111111111111111111111111111111112';

function birdeyeStub(overrides: Record<string, unknown> = {}) {
  return {
    getHolderProfile: async () => null,
    getDevPositions: async () => null,
    ...overrides,
  };
}

function heliusStub(overrides: Record<string, unknown> = {}) {
  return {
    getFirstTxFeePayer: async () => null,
    getTokenAccounts: async () => null,
    getAddressHistory: async () => null,
    ...overrides,
  };
}

describe('DevHoldingsService (holders + dev-wallet)', () => {
  it('birdeye dev positions map to devWallets + devPctSupply', async () => {
    const birdeye = birdeyeStub({
      getHolderProfile: async () => ({ address: MINT, tags: [{ tag: 'dev' }] }),
      getDevPositions: async () => ({
        items: [
          {
            wallet: 'Dev111',
            holdAmount: 1000,
            percentOfSupply: 8.5,
            pnlUsd: 120,
            tag: 'dev',
          },
          {
            wallet: 'Dev222',
            holdAmount: 500,
            percentOfSupply: 4.2,
            pnlUsd: -10,
            tag: 'dev',
          },
        ],
      }),
    });
    const svc = new DevHoldingsService(birdeye as never, heliusStub() as never);
    const res = await svc.resolve('solana', MINT);
    expect(res.source).toBe('birdeye');
    expect(res.devWallets).not.toBeNull();
    expect(res.devWallets?.length).toBe(2);
    expect(res.devWallets?.[0]?.wallet).toBe('Dev111');
    expect(res.devPctSupply).toBeCloseTo(12.7, 5);
  });

  it('birdeye empty -> helius first-tx feePayer as probable dev', async () => {
    const birdeye = birdeyeStub();
    const helius = heliusStub({
      getFirstTxFeePayer: async () => ({
        wallet: 'Payer999',
        signature: 'sig1',
      }),
    });
    const svc = new DevHoldingsService(birdeye as never, helius as never);
    const res = await svc.resolve('solana', MINT);
    expect(res.source).toBe('helius-probable');
    expect(res.devWallets?.[0]?.wallet).toBe('Payer999');
    expect(res.devWallets?.[0]?.probable).toBe(true);
    expect(res.devPctSupply).toBeNull();
  });

  it('adversarial: no keys -> explicit nulls, never crash', async () => {
    const svc = new DevHoldingsService(
      birdeyeStub() as never,
      heliusStub() as never,
    );
    const res = await svc.resolve('solana', MINT);
    expect(res.devWallets).toBeNull();
    expect(res.devPctSupply).toBeNull();
    expect(res.source).toBe('null');
    expect(res.providerErrors['birdeye']).toBe('no data');
  });

  it('adversarial: provider throws -> explicit nulls, never crash', async () => {
    const birdeye = birdeyeStub({
      getHolderProfile: async () => {
        throw new Error('boom');
      },
      getDevPositions: async () => {
        throw new Error('boom');
      },
    });
    const helius = heliusStub({
      getFirstTxFeePayer: async () => {
        throw new Error('down');
      },
    });
    const svc = new DevHoldingsService(birdeye as never, helius as never);
    const res = await svc.resolve('solana', MINT);
    expect(res.devWallets).toBeNull();
    expect(res.devPctSupply).toBeNull();
    expect(res.source).toBe('null');
  });

  it('non-solana chain -> explicit nulls', async () => {
    const svc = new DevHoldingsService(
      birdeyeStub() as never,
      heliusStub() as never,
    );
    const res = await svc.resolve('ethereum', '0xabc');
    expect(res.devWallets).toBeNull();
    expect(res.source).toBe('null');
  });
});
