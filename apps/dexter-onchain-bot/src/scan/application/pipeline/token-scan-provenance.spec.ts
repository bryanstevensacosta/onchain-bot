import { TokenScanPipeline } from './token-scan.pipeline';
import {
  toIdentityProvenanceOrNull,
  type MarketDataSnapshot,
} from '@/scan/infrastructure/market-data/market-data.client';

const SOL = 'So11111111111111111111111111111111111111112';

function shell(
  overrides: Partial<MarketDataSnapshot> = {},
): MarketDataSnapshot {
  return {
    chain: 'solana',
    address: SOL,
    symbol: 'TKN',
    name: 'Token',
    priceUsd: 1,
    priceChange24h: null,
    marketCapUsd: null,
    fdvUsd: null,
    liquidityUsd: null,
    lockedLiquidityPercent: null,
    burnedPercent: null,
    volume24hUsd: null,
    holders: null,
    top10HolderPercent: null,
    status: 'ready',
    ...overrides,
  } as MarketDataSnapshot;
}

function makeClient(snapshot: MarketDataSnapshot | null) {
  return {
    detectChain: async () => null,
    getSnapshot: async () => snapshot,
  };
}

async function resolveProvenance(snapshot: MarketDataSnapshot | null) {
  const pipeline = new TokenScanPipeline(makeClient(snapshot) as never);
  const outcome = await pipeline.resolveDetailed(`solana:${SOL}`);
  if (outcome.status !== 'resolved') throw new Error('expected resolved');
  return outcome.token.identityProvenance;
}

/**
 * Identity provenance end-to-end (dexter plan todo 39): the client
 * validates the wire value, the pipeline pins it onto every
 * `ResolvedToken` (`'market'` default when market-data stays
 * silent), and the renderer marks `metadata` names — preview, bot
 * and frontend inherit the marked text with no extra code.
 */
describe('TokenScanPipeline identity provenance (plan todo 39)', () => {
  it('validates the wire value (exact strings only, else null)', () => {
    expect(toIdentityProvenanceOrNull('market')).toBe('market');
    expect(toIdentityProvenanceOrNull('metadata')).toBe('metadata');
    expect(toIdentityProvenanceOrNull(undefined)).toBeNull();
    expect(toIdentityProvenanceOrNull(null)).toBeNull();
    expect(toIdentityProvenanceOrNull('MARKET')).toBeNull();
    expect(toIdentityProvenanceOrNull('')).toBeNull();
    expect(toIdentityProvenanceOrNull(42)).toBeNull();
  });

  it("pins 'metadata' from market-data onto the resolved token", async () => {
    await expect(
      resolveProvenance(shell({ identityProvenance: 'metadata' })),
    ).resolves.toBe('metadata');
  });

  it("pins 'market' from market-data onto the resolved token", async () => {
    await expect(
      resolveProvenance(shell({ identityProvenance: 'market' })),
    ).resolves.toBe('market');
  });

  it("defaults legacy (field-absent) snapshots to 'market'", async () => {
    const legacy = shell();
    delete (legacy as { identityProvenance?: unknown }).identityProvenance;
    await expect(resolveProvenance(legacy)).resolves.toBe('market');
  });

  it("defaults garbage wire values to 'market' (never blank, never throws)", async () => {
    await expect(
      resolveProvenance(
        shell({ identityProvenance: 'verified' as unknown as null }),
      ),
    ).resolves.toBe('market');
  });
});
