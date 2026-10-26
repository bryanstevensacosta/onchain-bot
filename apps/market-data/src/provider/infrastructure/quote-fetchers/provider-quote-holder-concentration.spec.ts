import { bytesToAddress } from 'launchpad/infrastructure/solana-pda';
import {
  RAYDIUM_CPMM_PROGRAM,
  SPL_TOKEN_PROGRAM,
  SYSTEM_PROGRAM_ID,
} from 'provider/infrastructure/onchain/solana-program-ids';
import type { SolanaAccountInfoValue } from 'provider/infrastructure/solana-rpc/solana-rpc.types';
import {
  QUOTE_FETCHER_COST_TIER,
  buildProviderQuoteFetchers,
} from './provider-quote.fetchers';

/**
 * `solana-holders` quote fetcher (`rick-compact-card` §10, lane TH).
 *
 * Failing-first pins for the DEDICATED fetcher (§10.4): Solana-only,
 * tier `free`, placed immediately after `solana-rpc` in the execution
 * array (the Record has no ordering semantics). It emits ONLY
 * `holderConcentration`; the legacy `solana-rpc` fields stay untouched
 * because this is an isolated leg (C5). Call-count table: happy 4
 * (supply + largest + ATA batch + wallet batch), `largest === null` 1,
 * supply null/0 1, partial decode 4. Kill-switch → zero RPC; timeout
 * and rate-limit-shaped throws → `null` (fail-open, never throw).
 */

const MINT = addr(200);
const SUPPLY = 1_000n;

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

function tokenAccountInfo(
  owner: Addr,
  amount: bigint,
  options: { readonly short?: boolean } = {},
): SolanaAccountInfoValue {
  const bytes = new Uint8Array(options.short === true ? 10 : 165);
  if (options.short !== true) {
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
  readonly supply?: { amount: string; decimals: number } | null;
  readonly largest: ReadonlyArray<SolanaAccountInfoValue | null> | null;
  readonly wallets?: ReadonlyArray<SolanaAccountInfoValue | null>;
}

function makeRpc(fixture: RpcFixture) {
  const supply =
    fixture.supply === undefined
      ? {
          amount: SUPPLY.toString(),
          decimals: 0,
          uiAmount: Number(SUPPLY),
          uiAmountString: SUPPLY.toString(),
        }
      : fixture.supply;
  const getTokenSupply = jest.fn(async () => supply);
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
  const getMultipleAccounts = jest.fn(
    async (addresses: ReadonlyArray<string>) => {
      if (getMultipleAccounts.mock.calls.length === 1) {
        return fixture.largest ?? [];
      }
      return (fixture.wallets ?? []).slice(0, addresses.length);
    },
  );
  const solanaRpc = {
    getTokenSupply,
    getTokenLargestAccounts,
    getMultipleAccounts,
  };
  return {
    solanaRpc,
    getTokenSupply,
    getTokenLargestAccounts,
    getMultipleAccounts,
  };
}

function build(solanaRpc: unknown): ReadonlyArray<{
  readonly name: string;
  readonly supportsChains: ReadonlyArray<string>;
  fetch(
    chain: string,
    address: string,
  ): Promise<Record<string, unknown> | null>;
}> {
  return buildProviderQuoteFetchers({
    dexscreener: { getBestPairSummaryForChain: async () => null },
    geckoterminal: { getTokenInfo: async () => null },
    birdeye: { getTokenOverview: async () => null },
    ccxt: { fetchTicker: async () => null, defaultExchange: 'binance' },
    coingecko: { getTokenContractInfo: async () => null },
    mobula: { getTokenMarkets: async () => null },
    moralis: {
      getTokenAnalytics: async () => null,
      getTokenHolders: async () => null,
    },
    rugcheck: { getSummary: async () => null },
    solanaRpc,
  } as never);
}

function holdersFetcher(solanaRpc: unknown) {
  const fetcher = build(solanaRpc).find(
    (candidate) => candidate.name === 'solana-holders',
  );
  if (fetcher === undefined) {
    throw new Error('solana-holders fetcher not built');
  }
  return fetcher;
}

describe('solana-holders quote fetcher (lane TH)', () => {
  const originalEnabled = process.env.SNAPSHOT_HOLDER_CONCENTRATION_ENABLED;
  const originalTimeout = process.env.SNAPSHOT_HOLDER_CONCENTRATION_TIMEOUT_MS;

  afterEach(() => {
    if (originalEnabled === undefined) {
      delete process.env.SNAPSHOT_HOLDER_CONCENTRATION_ENABLED;
    } else {
      process.env.SNAPSHOT_HOLDER_CONCENTRATION_ENABLED = originalEnabled;
    }
    if (originalTimeout === undefined) {
      delete process.env.SNAPSHOT_HOLDER_CONCENTRATION_TIMEOUT_MS;
    } else {
      process.env.SNAPSHOT_HOLDER_CONCENTRATION_TIMEOUT_MS = originalTimeout;
    }
    jest.restoreAllMocks();
  });

  it('is Solana-only, tier free and sits right after solana-rpc', () => {
    const names = build(makeRpc({ largest: null }).solanaRpc).map(
      (fetcher) => fetcher.name,
    );
    expect(names.indexOf('solana-holders')).toBe(
      names.indexOf('solana-rpc') + 1,
    );
    expect(QUOTE_FETCHER_COST_TIER['solana-holders']).toBe('free');
    expect(
      holdersFetcher(makeRpc({ largest: null }).solanaRpc).supportsChains,
    ).toEqual(['solana']);
  });

  it('emits ONLY holderConcentration on the happy path (4 RPC calls)', async () => {
    const a = addr(1);
    const b = addr(2);
    const rpc = makeRpc({
      largest: [tokenAccountInfo(a, 150n), tokenAccountInfo(b, 200n)],
      wallets: [walletInfo(), walletInfo()],
    });

    const quote = await holdersFetcher(rpc.solanaRpc).fetch(
      'solana',
      MINT.address,
    );

    expect(quote).toEqual({
      holderConcentration: { topPercents: [20, 15], top10Percent: 35 },
    });
    expect(Object.keys(quote ?? {})).toEqual(['holderConcentration']);
    expect(rpc.getTokenSupply).toHaveBeenCalledTimes(1);
    expect(rpc.getTokenLargestAccounts).toHaveBeenCalledTimes(1);
    expect(rpc.getMultipleAccounts).toHaveBeenCalledTimes(2);
  });

  it('stops after 1 call when largest-accounts answers null', async () => {
    const rpc = makeRpc({ largest: null });

    await expect(
      holdersFetcher(rpc.solanaRpc).fetch('solana', MINT.address),
    ).resolves.toBeNull();

    expect(rpc.getTokenSupply).toHaveBeenCalledTimes(1);
    expect(rpc.getTokenLargestAccounts).toHaveBeenCalledTimes(1);
    expect(rpc.getMultipleAccounts).not.toHaveBeenCalled();
  });

  it('stops after 1 call when supply is null or zero', async () => {
    for (const supply of [null, { amount: '0', decimals: 0 }]) {
      const rpc = makeRpc({ supply, largest: [tokenAccountInfo(addr(1), 1n)] });

      await expect(
        holdersFetcher(rpc.solanaRpc).fetch('solana', MINT.address),
      ).resolves.toBeNull();

      expect(rpc.getTokenSupply).toHaveBeenCalledTimes(1);
      expect(rpc.getTokenLargestAccounts).not.toHaveBeenCalled();
      expect(rpc.getMultipleAccounts).not.toHaveBeenCalled();
    }
  });

  it('pays both batches on partial decode (undecodable accounts just skip)', async () => {
    const a = addr(1);
    const b = addr(2);
    const rpc = makeRpc({
      largest: [
        null,
        tokenAccountInfo(a, 100n),
        tokenAccountInfo(b, 500n, { short: true }),
        tokenAccountInfo(addr(3), 100n),
      ],
      wallets: [walletInfo(), walletInfo()],
    });

    const quote = await holdersFetcher(rpc.solanaRpc).fetch(
      'solana',
      MINT.address,
    );

    expect(quote).toEqual({
      holderConcentration: { topPercents: [10, 10], top10Percent: 20 },
    });
    expect(rpc.getMultipleAccounts).toHaveBeenCalledTimes(2);
  });

  it('kill-switch false-ish: zero RPC and no field', async () => {
    process.env.SNAPSHOT_HOLDER_CONCENTRATION_ENABLED = 'false';
    const rpc = makeRpc({
      largest: [tokenAccountInfo(addr(1), 100n)],
      wallets: [walletInfo()],
    });

    await expect(
      holdersFetcher(rpc.solanaRpc).fetch('solana', MINT.address),
    ).resolves.toBeNull();

    expect(rpc.getTokenSupply).not.toHaveBeenCalled();
    expect(rpc.getTokenLargestAccounts).not.toHaveBeenCalled();
    expect(rpc.getMultipleAccounts).not.toHaveBeenCalled();
  });

  it('own budget timeout resolves null without throwing', async () => {
    process.env.SNAPSHOT_HOLDER_CONCENTRATION_TIMEOUT_MS = '10';
    const hanging = {
      getTokenSupply: jest.fn(() => new Promise(() => undefined)),
      getTokenLargestAccounts: jest.fn(async () => null),
      getMultipleAccounts: jest.fn(async () => []),
    };

    await expect(
      holdersFetcher(hanging).fetch('solana', MINT.address),
    ).resolves.toBeNull();

    expect(hanging.getTokenSupply).toHaveBeenCalledTimes(1);
    expect(hanging.getTokenLargestAccounts).not.toHaveBeenCalled();
  });

  it('rate-limit-shaped throw inside the leg resolves null (never propagates)', async () => {
    const rpc = {
      getTokenSupply: jest.fn(async () => {
        throw new Error('429 Too Many Requests');
      }),
      getTokenLargestAccounts: jest.fn(async () => null),
      getMultipleAccounts: jest.fn(async () => []),
    };

    await expect(
      holdersFetcher(rpc).fetch('solana', MINT.address),
    ).resolves.toBeNull();
  });

  it('older hand-mocks without getMultipleAccounts degrade to null, zero RPC', async () => {
    const rpc = {
      getTokenSupply: jest.fn(async () => null),
      getTokenLargestAccounts: jest.fn(async () => null),
    };

    await expect(
      holdersFetcher(rpc).fetch('solana', MINT.address),
    ).resolves.toBeNull();

    expect(rpc.getTokenSupply).not.toHaveBeenCalled();
  });

  it('excludes program-owned wallets from the served object', async () => {
    const pool = addr(9);
    const a = addr(1);
    const rpc = makeRpc({
      largest: [tokenAccountInfo(pool, 400n), tokenAccountInfo(a, 100n)],
      wallets: [walletInfo(RAYDIUM_CPMM_PROGRAM), walletInfo()],
    });

    const quote = await holdersFetcher(rpc.solanaRpc).fetch(
      'solana',
      MINT.address,
    );

    expect(quote).toEqual({
      holderConcentration: { topPercents: [10], top10Percent: 10 },
    });
  });
});
