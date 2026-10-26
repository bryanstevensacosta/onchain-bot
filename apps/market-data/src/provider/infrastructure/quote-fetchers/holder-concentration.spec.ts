import { bytesToAddress } from 'launchpad/infrastructure/solana-pda';
import {
  RAYDIUM_CPMM_PROGRAM,
  SPL_TOKEN_PROGRAM,
  SYSTEM_PROGRAM_ID,
} from 'provider/infrastructure/onchain/solana-program-ids';
import type { SolanaAccountInfoValue } from 'provider/infrastructure/solana-rpc/solana-rpc.types';
import {
  buildHolderConcentration,
  computeHolderConcentration,
  type HolderConcentrationRpc,
} from './holder-concentration';

/**
 * Holder concentration (`rick-compact-card` §10, lane TH).
 *
 * Failing-first pins for the pure calculator: ATA→wallet decode via the
 * EXISTING `decodeTokenAccount`, BigInt merge by owner, zero-amount
 * drop, the four exclusions IN ORDER (uninitialized → System Program
 * burn sink → wallet-null → program-owned) BEFORE the cut, descending
 * order, `min(10,n)` accumulators (no NaN for n = 1..9), the
 * `sum(top5) ≤ top10` invariant, exactly TWO `getMultipleAccounts`
 * batches (the RPC service owns ≤100 chunking) and the hard guards
 * (supply 0/null, non-finite, 100+ulp clamp).
 */

interface Addr {
  readonly address: string;
  readonly bytes: Uint8Array;
}

/** Deterministic 32-byte address; seed 0 is the all-zero System Program. */
function addr(seed: number): Addr {
  const bytes = new Uint8Array(32);
  if (seed !== 0) {
    bytes[30] = 1;
    bytes[31] = seed & 0xff;
  }
  return { address: bytesToAddress(bytes), bytes };
}

const SUPPLY = 1_000n;
const MINT = addr(200);
const OTHER_MINT = addr(201);

function tokenAccountInfo(
  owner: Addr,
  amount: bigint,
  options: { readonly uninitialized?: boolean; readonly short?: boolean } = {},
): SolanaAccountInfoValue {
  const bytes = new Uint8Array(options.short === true ? 10 : 165);
  if (options.short !== true && options.uninitialized !== true) {
    bytes.set(MINT.bytes, 0);
    bytes.set(owner.bytes, 32);
    let value = amount;
    for (let i = 0; i < 8; i += 1) {
      bytes[64 + i] = Number(value & 0xffn);
      value >>= 8n;
    }
  }
  return {
    data: [Buffer.from(bytes).toString('base64'), 'base64'],
    executable: false,
    lamports: 2_039_280,
    owner: SPL_TOKEN_PROGRAM,
    rentEpoch: 0,
  };
}

/** A token account for ANOTHER mint (must be skipped, never merged). */
function foreignMintAccountInfo(
  owner: Addr,
  amount: bigint,
): SolanaAccountInfoValue {
  const bytes = new Uint8Array(165);
  bytes.set(OTHER_MINT.bytes, 0);
  bytes.set(owner.bytes, 32);
  let value = amount;
  for (let i = 0; i < 8; i += 1) {
    bytes[64 + i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return {
    data: [Buffer.from(bytes).toString('base64'), 'base64'],
    executable: false,
    lamports: 2_039_280,
    owner: SPL_TOKEN_PROGRAM,
    rentEpoch: 0,
  };
}

/** A plain wallet account: System-Program owned by default. */
function walletInfo(owner: string = SYSTEM_PROGRAM_ID): SolanaAccountInfoValue {
  return {
    data: ['', 'base64'],
    executable: false,
    lamports: 1_000_000,
    owner,
    rentEpoch: 0,
  };
}

interface RpcFixture {
  readonly supply?: bigint | null;
  /** ATA batch answers (null = `getTokenLargestAccounts` answered null). */
  readonly largest: ReadonlyArray<SolanaAccountInfoValue | null> | null;
  /** Wallet batch answers, aligned with the SURVIVING owners' order. */
  readonly wallets: ReadonlyArray<SolanaAccountInfoValue | null>;
}

function makeRpc(fixture: RpcFixture) {
  const supply = fixture.supply === undefined ? SUPPLY : fixture.supply;
  const getTokenSupply = jest.fn(async () => {
    if (supply === null) return null;
    return {
      amount: supply.toString(),
      decimals: 0,
      uiAmount: Number(supply),
      uiAmountString: supply.toString(),
    };
  });
  const getTokenLargestAccounts = jest.fn(async () => {
    if (fixture.largest === null) return null;
    return fixture.largest.map((_, index) => ({
      address: `ata-${index}`,
      amount: '0',
      decimals: 0,
      uiAmount: 0,
      uiAmountString: '0',
    }));
  });
  const batches: string[][] = [];
  const getMultipleAccounts = jest.fn(
    async (addresses: ReadonlyArray<string>) => {
      batches.push([...addresses]);
      if (batches.length === 1) {
        return fixture.largest ?? [];
      }
      return fixture.wallets.slice(0, addresses.length);
    },
  );
  const rpc: HolderConcentrationRpc = {
    getTokenSupply,
    getTokenLargestAccounts,
    getMultipleAccounts,
  };
  return {
    rpc,
    getTokenSupply,
    getTokenLargestAccounts,
    getMultipleAccounts,
    batches,
  };
}

describe('computeHolderConcentration (wallet merge + exclusion policy)', () => {
  it('merges several token accounts of the same owner into ONE holder', async () => {
    const a = addr(1);
    const b = addr(2);
    const { rpc, getMultipleAccounts, batches } = makeRpc({
      largest: [
        tokenAccountInfo(a, 100n),
        tokenAccountInfo(a, 50n),
        tokenAccountInfo(b, 200n),
      ],
      wallets: [walletInfo(), walletInfo()],
    });

    const result = await computeHolderConcentration(rpc, MINT.address);

    expect(result).toEqual({ topPercents: [20, 15], top10Percent: 35 });
    // Exactly TWO batches: ATAs first, then deduped wallets.
    expect(getMultipleAccounts).toHaveBeenCalledTimes(2);
    expect(batches[1]).toEqual([a.address, b.address]);
  });

  it('drops zero-amount wallets (they hold nothing, never a 0.0 row)', async () => {
    const a = addr(1);
    const z = addr(7);
    const { rpc, batches } = makeRpc({
      largest: [tokenAccountInfo(a, 100n), tokenAccountInfo(z, 0n)],
      wallets: [walletInfo()],
    });

    const result = await computeHolderConcentration(rpc, MINT.address);

    expect(result).toEqual({ topPercents: [10], top10Percent: 10 });
    expect(batches[1]).toEqual([a.address]);
  });

  it('skips uninitialized token accounts BEFORE the burn filter (never batched as wallets)', async () => {
    const a = addr(1);
    const { rpc, batches } = makeRpc({
      largest: [
        tokenAccountInfo(a, 50n),
        // mint AND owner are zero: if this reached the burn check it
        // would be indistinguishable from a System-Program holder.
        tokenAccountInfo(addr(0), 500n, { uninitialized: true }),
      ],
      wallets: [walletInfo()],
    });

    const result = await computeHolderConcentration(rpc, MINT.address);

    expect(result).toEqual({ topPercents: [5], top10Percent: 5 });
    expect(batches[1]).toEqual([a.address]);
    expect(batches[1]).not.toContain(SYSTEM_PROGRAM_ID);
  });

  it('excludes the System Program burn sink before the wallet batch', async () => {
    const burnSink = addr(0);
    expect(burnSink.address).toBe(SYSTEM_PROGRAM_ID);
    const a = addr(1);
    const { rpc, batches } = makeRpc({
      largest: [tokenAccountInfo(burnSink, 300n), tokenAccountInfo(a, 100n)],
      wallets: [walletInfo()],
    });

    const result = await computeHolderConcentration(rpc, MINT.address);

    expect(result).toEqual({ topPercents: [10], top10Percent: 10 });
    expect(batches[1]).toEqual([a.address]);
  });

  it('excludes a wallet whose on-chain account is null (documented no-account rule)', async () => {
    const a = addr(1);
    const b = addr(2);
    const { rpc } = makeRpc({
      largest: [tokenAccountInfo(a, 400n), tokenAccountInfo(b, 100n)],
      wallets: [null, walletInfo()],
    });

    const result = await computeHolderConcentration(rpc, MINT.address);

    expect(result).toEqual({ topPercents: [10], top10Percent: 10 });
  });

  it('excludes program-owned wallets (pools/curves/PDAs/vaults; accepted multisig false-negative)', async () => {
    const a = addr(1);
    const b = addr(2);
    const { rpc } = makeRpc({
      largest: [tokenAccountInfo(a, 400n), tokenAccountInfo(b, 100n)],
      wallets: [walletInfo(RAYDIUM_CPMM_PROGRAM), walletInfo()],
    });

    const result = await computeHolderConcentration(rpc, MINT.address);

    expect(result).toEqual({ topPercents: [10], top10Percent: 10 });
  });

  it('applies exclusions BEFORE the top-5 cut (an excluded whale never occupies a slot)', async () => {
    const pool = addr(9);
    const rest = [addr(1), addr(2), addr(3), addr(4), addr(5)];
    const { rpc } = makeRpc({
      largest: [
        tokenAccountInfo(pool, 400n),
        ...rest.map((owner, index) =>
          tokenAccountInfo(owner, 100n - BigInt(index) * 10n),
        ),
      ],
      wallets: [
        walletInfo(RAYDIUM_CPMM_PROGRAM),
        ...rest.map(() => walletInfo()),
      ],
    });

    const result = await computeHolderConcentration(rpc, MINT.address);

    // Raw percent math carries a double artifact (70/1000*100 is
    // 7.000000000000001), so compare at display precision.
    expect(
      result?.topPercents.map((value) => Number(value.toFixed(9))),
    ).toEqual([10, 9, 8, 7, 6]);
    expect(result?.top10Percent).toBeCloseTo(40, 6);
    expect(result?.topPercents).not.toContain(40);
  });

  it('sorts descending even when largest-accounts arrives out of order', async () => {
    const owners = [addr(1), addr(2), addr(3), addr(4)];
    const { rpc } = makeRpc({
      largest: [
        tokenAccountInfo(owners[0], 100n),
        tokenAccountInfo(owners[1], 400n),
        tokenAccountInfo(owners[2], 200n),
        tokenAccountInfo(owners[3], 300n),
      ],
      wallets: owners.map(() => walletInfo()),
    });

    const result = await computeHolderConcentration(rpc, MINT.address);

    expect(result?.topPercents).toEqual([40, 30, 20, 10]);
    expect(result?.top10Percent).toBe(100);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])(
    'never produces NaN with only %i wallet(s) (min(10,n) accumulator)',
    async (n) => {
      const owners = Array.from({ length: n }, (_, index) => addr(10 + index));
      const { rpc } = makeRpc({
        largest: owners.map((owner) => tokenAccountInfo(owner, 10n)),
        wallets: owners.map(() => walletInfo()),
      });

      const result = await computeHolderConcentration(rpc, MINT.address);

      expect(result).not.toBeNull();
      expect(result?.topPercents).toHaveLength(Math.min(5, n));
      expect(Number.isFinite(result?.top10Percent)).toBe(true);
      expect(result?.top10Percent).toBeCloseTo(n, 6);
    },
  );

  it('keeps sum(top5) ≤ top10 exactly on the same sorted array', async () => {
    const owners = Array.from({ length: 10 }, (_, index) => addr(20 + index));
    const { rpc } = makeRpc({
      largest: owners.map((owner, index) =>
        tokenAccountInfo(owner, 100n - BigInt(index) * 10n),
      ),
      wallets: owners.map(() => walletInfo()),
    });

    const result = await computeHolderConcentration(rpc, MINT.address);

    const sumTop5 = (result?.topPercents ?? []).reduce(
      (acc, value) => acc + value,
      0,
    );
    expect(result?.top10Percent).toBeCloseTo(55, 6);
    expect(sumTop5).toBeLessThanOrEqual(result?.top10Percent ?? 0);
  });

  it('returns null for an empty/absent largest-accounts answer (supply-only call)', async () => {
    const nullLargest = makeRpc({ largest: null, wallets: [] });
    await expect(
      computeHolderConcentration(nullLargest.rpc, MINT.address),
    ).resolves.toBeNull();
    expect(nullLargest.getTokenSupply).toHaveBeenCalledTimes(1);
    expect(nullLargest.getTokenLargestAccounts).toHaveBeenCalledTimes(1);
    expect(nullLargest.getMultipleAccounts).not.toHaveBeenCalled();

    const emptyLargest = makeRpc({ largest: [], wallets: [] });
    await expect(
      computeHolderConcentration(emptyLargest.rpc, MINT.address),
    ).resolves.toBeNull();
    expect(emptyLargest.getMultipleAccounts).not.toHaveBeenCalled();
  });

  it('returns null when supply is null or zero (no largest-accounts call)', async () => {
    for (const supply of [null, 0n]) {
      const fixture = makeRpc({
        supply,
        largest: [tokenAccountInfo(addr(1), 1n)],
        wallets: [],
      });
      await expect(
        computeHolderConcentration(fixture.rpc, MINT.address),
      ).resolves.toBeNull();
      expect(fixture.getTokenSupply).toHaveBeenCalledTimes(1);
      expect(fixture.getTokenLargestAccounts).not.toHaveBeenCalled();
      expect(fixture.getMultipleAccounts).not.toHaveBeenCalled();
    }
  });

  it('tolerates partial decode: null/short/foreign-mint accounts are skipped, not fatal', async () => {
    const a = addr(1);
    const b = addr(2);
    const c = addr(3);
    const { rpc } = makeRpc({
      largest: [
        null,
        tokenAccountInfo(a, 100n),
        tokenAccountInfo(b, 500n, { short: true }),
        foreignMintAccountInfo(c, 500n),
        tokenAccountInfo(addr(4), 100n),
      ],
      wallets: [walletInfo(), walletInfo()],
    });

    const result = await computeHolderConcentration(rpc, MINT.address);

    expect(result).toEqual({ topPercents: [10, 10], top10Percent: 20 });
  });

  it('issues ONE wallet batch for the whole 20-account window (service owns ≤100 chunks)', async () => {
    const owners = Array.from({ length: 20 }, (_, index) => addr(30 + index));
    const { rpc, getMultipleAccounts, batches } = makeRpc({
      largest: owners.map((owner) => tokenAccountInfo(owner, 10n)),
      wallets: owners.map(() => walletInfo()),
    });

    const result = await computeHolderConcentration(rpc, MINT.address);

    expect(result?.topPercents).toHaveLength(5);
    expect(getMultipleAccounts).toHaveBeenCalledTimes(2);
    expect(batches[0]).toHaveLength(20);
    expect(batches[1]).toHaveLength(20);
  });

  it('returns null when every eligible wallet is excluded (nothing honest to report)', async () => {
    const a = addr(1);
    const b = addr(2);
    const { rpc, getMultipleAccounts } = makeRpc({
      largest: [tokenAccountInfo(a, 100n), tokenAccountInfo(b, 100n)],
      wallets: [walletInfo(RAYDIUM_CPMM_PROGRAM), null],
    });

    await expect(
      computeHolderConcentration(rpc, MINT.address),
    ).resolves.toBeNull();
    // Both batches are still paid: the exclusion data is the answer.
    expect(getMultipleAccounts).toHaveBeenCalledTimes(2);
  });
});

describe('buildHolderConcentration (guards + display clamps)', () => {
  it('rejects non-finite percentages before emitting', () => {
    expect(buildHolderConcentration([Number.NaN])).toBeNull();
    expect(buildHolderConcentration([Number.POSITIVE_INFINITY])).toBeNull();
    expect(buildHolderConcentration([10, Number.NEGATIVE_INFINITY])).toBeNull();
  });

  it('rejects a top-10 total outside [−ε, 100+ε]', () => {
    expect(buildHolderConcentration([100.001])).toBeNull();
    expect(buildHolderConcentration([-0.001])).toBeNull();
  });

  it('clamps a legitimately-100% token at 100 + ulp instead of discarding it', () => {
    expect(buildHolderConcentration([100 + 1e-10])).toEqual({
      topPercents: [100],
      top10Percent: 100,
    });
  });

  it('cuts topPercents to five and sums top10 from the same array', () => {
    const percents = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 99];
    const result = buildHolderConcentration(percents);
    expect(result?.topPercents).toEqual([10, 9, 8, 7, 6]);
    expect(result?.top10Percent).toBe(55);
  });

  it('returns null for an empty list (0 eligible wallets = silence)', () => {
    expect(buildHolderConcentration([])).toBeNull();
  });
});
