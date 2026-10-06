import type {
  BatchAccountsClient,
  SolanaAccountInfoValue,
} from 'provider/infrastructure/solana-rpc/solana-rpc.types';
import {
  OnchainSolanaReaderService,
  TokenHoldersClient,
  TokenSupplyClient,
} from './onchain-solana.reader';
import {
  FIXTURE_AMM_B64,
  FIXTURE_AMM_OWNER,
  FIXTURE_CLMM_B64,
  FIXTURE_CLMM_OWNER,
  FIXTURE_CPMM_B64,
  FIXTURE_CPMM_OWNER,
  FIXTURE_DBC_B64,
  FIXTURE_DBC_OWNER,
  FIXTURE_DLMM_B64,
  FIXTURE_DLMM_OWNER,
  FIXTURE_PUMP_CURVE_B64,
  FIXTURE_PUMP_CURVE_MINT,
  FIXTURE_PUMP_CURVE_OWNER,
  FIXTURE_USDC_META_ADDRESS,
  FIXTURE_USDC_META_B64,
  FIXTURE_WHIRL_B64,
  FIXTURE_WHIRL_OWNER,
} from './solana-mainnet.fixtures';
import { PUMP_FUN_PROGRAM, RAYDIUM_AMM_V4_PROGRAM } from './solana-program-ids';

const RAY_MINT = '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const USD1_MINT = 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58ToBytes32(value: string): Buffer {
  let num = 0n;
  for (const ch of value) {
    num = num * 58n + BigInt(BASE58.indexOf(ch));
  }
  const out: number[] = [];
  while (num > 0n) {
    out.unshift(Number(num & 0xffn));
    num >>= 8n;
  }
  for (const ch of value) {
    if (ch !== '1') break;
    out.unshift(0);
  }
  while (out.length < 32) out.unshift(0);
  return Buffer.from(out.slice(-32));
}

/** Synthetic vault scaffolding (layout pinned by real fixtures in the codec specs). */
function tokenAccountB64(mint: string, amount: bigint): string {
  const raw = Buffer.alloc(165);
  base58ToBytes32(mint).copy(raw, 0);
  raw.writeBigUInt64LE(amount, 64);
  return raw.toString('base64');
}

function accountOf(owner: string, b64: string): SolanaAccountInfoValue {
  return {
    data: [b64, 'base64'],
    executable: false,
    lamports: 1_000_000,
    owner,
    rentEpoch: 1,
  };
}

interface Mocks {
  accounts: Map<string, SolanaAccountInfoValue | null>;
  supply: Map<string, { amount: string; decimals: number }>;
  holders: Map<string, Array<{ address: string; amount: string }> | null>;
}

function buildReader(mocks: Mocks): OnchainSolanaReaderService {
  const accounts: BatchAccountsClient = {
    getMultiple: async (addresses) =>
      addresses.map((a) => mocks.accounts.get(a) ?? null),
  };
  const supply: TokenSupplyClient = {
    getTokenSupply: async (mint) => {
      const hit = mocks.supply.get(mint);
      if (!hit) return null;
      return {
        amount: hit.amount,
        decimals: hit.decimals,
        uiAmount: null,
        uiAmountString: hit.amount,
      };
    },
  };
  const holders: TokenHoldersClient = {
    getTokenLargestAccounts: async (mint) => {
      const hit = mocks.holders.get(mint);
      if (hit === undefined) return null;
      if (hit === null) return null;
      return hit.map((e) => ({
        address: e.address,
        amount: e.amount,
        decimals: 6,
        uiAmount: null,
        uiAmountString: e.amount,
      }));
    },
  };
  return new OnchainSolanaReaderService(accounts, supply, holders);
}

describe('OnchainSolanaReaderService (Lane S)', () => {
  it('pins the R1 pump program ID (no memory)', () => {
    expect(PUMP_FUN_PROGRAM).toBe(FIXTURE_PUMP_CURVE_OWNER);
    expect(PUMP_FUN_PROGRAM).toBe(
      '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
    );
  });

  it('reads an AMMv4 view: RAY/USDC legs + ~2.02 price', async () => {
    const pool = 'PoolAMMv4TestAddress1111111111111111111111';
    const mocks: Mocks = {
      accounts: new Map([
        [pool, accountOf(FIXTURE_AMM_OWNER, FIXTURE_AMM_B64)],
        [
          'FdmKUE4UMiJYFK5ogCngHzShuVKrFXBamPWcewDr31th',
          accountOf(
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            tokenAccountB64(RAY_MINT, 1683856645665n),
          ),
        ],
        [
          'Eqrhxd7bDUCH3MepKmdVkgwazXRzY6iHhEoBpY7yAohk',
          accountOf(
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            tokenAccountB64(USDC_MINT, 3398745531077n),
          ),
        ],
      ]),
      supply: new Map(),
      holders: new Map(),
    };
    const view = await buildReader(mocks).getPoolView(pool);
    expect(view?.family).toBe('raydium-amm-v4');
    expect(view?.legs[0].mint).toBe(RAY_MINT);
    expect(view?.legs[1].mint).toBe(USDC_MINT);
    expect(view?.legs[0].reserve).toBe(1683856645665n);
    expect(view?.priceBA).toBeGreaterThan(2.01);
    expect(view?.priceBA).toBeLessThan(2.03);
    expect(RAYDIUM_AMM_V4_PROGRAM).toBe(FIXTURE_AMM_OWNER);
  });

  it('reads a CPMM view with struct decimals (no mint fetch)', async () => {
    const pool = 'PoolCPMMTestAddress11111111111111111111111';
    const mocks: Mocks = {
      accounts: new Map([
        [pool, accountOf(FIXTURE_CPMM_OWNER, FIXTURE_CPMM_B64)],
        [
          '6FEdWX6EL5eF3EPvQz75vbFfx6A2a3LeT2oqaqZ5hyRz',
          accountOf(
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            tokenAccountB64(USD1_MINT, 3643853073n),
          ),
        ],
        [
          'AsooinDcdWY3ZzNysV5S1Hne9YatjUCem5ahHmQQgGCK',
          accountOf(
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            tokenAccountB64(RAY_MINT, 1799759828n),
          ),
        ],
      ]),
      supply: new Map(),
      holders: new Map(),
    };
    const view = await buildReader(mocks).getPoolView(pool);
    expect(view?.family).toBe('raydium-cpmm');
    expect(view?.legs[0].decimals).toBe(6);
    expect(view?.priceBA).toBeGreaterThan(0.49);
    expect(view?.priceBA).toBeLessThan(0.5);
  });

  it('reads a CLMM view from sqrtPrice (vault amounts do not matter)', async () => {
    const pool = 'PoolCLMMTestAddress11111111111111111111111';
    const mocks: Mocks = {
      accounts: new Map([
        [pool, accountOf(FIXTURE_CLMM_OWNER, FIXTURE_CLMM_B64)],
        [
          '9Jgp8NpqEDFd5d3RQPfuRY7gMgRFByTNFmi68Ph1yvVb',
          accountOf(
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            tokenAccountB64(WSOL_MINT, 1n),
          ),
        ],
        [
          'Be1CFyoPAr8aBGxpvCPD2LD21hdz2vjYNq8EcypnmgGD',
          accountOf(
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            tokenAccountB64(RAY_MINT, 1n),
          ),
        ],
      ]),
      supply: new Map(),
      holders: new Map(),
    };
    const view = await buildReader(mocks).getPoolView(pool);
    expect(view?.family).toBe('raydium-clmm');
    expect(view?.priceBA).toBeGreaterThan(55);
    expect(view?.priceBA).toBeLessThan(65);
  });

  it('reads a Whirlpool view (decimals via supply, price ~120.56)', async () => {
    const pool = 'PoolWhirlTestAddress11111111111111111111111';
    const mocks: Mocks = {
      accounts: new Map([
        [pool, accountOf(FIXTURE_WHIRL_OWNER, FIXTURE_WHIRL_B64)],
        [
          'EUuUbDcafPrmVTD5M6qoJAoyyNbihBhugADAxRMn5he9',
          accountOf(
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            tokenAccountB64(WSOL_MINT, 1000n),
          ),
        ],
        [
          '2WLWEuKDgkDUccTpbwYp1GToYktiSB1cXvreHUwiSUVP',
          accountOf(
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            tokenAccountB64(USDC_MINT, 1000n),
          ),
        ],
      ]),
      supply: new Map([
        [WSOL_MINT, { amount: '1', decimals: 9 }],
        [USDC_MINT, { amount: '1', decimals: 6 }],
      ]),
      holders: new Map(),
    };
    const view = await buildReader(mocks).getPoolView(pool);
    expect(view?.family).toBe('orca-whirlpool');
    expect(view?.legs[0].decimals).toBe(9);
    expect(view?.legs[1].decimals).toBe(6);
    expect(view?.priceBA).toBeCloseTo(120.56, 1);
  });

  it('reads a DLMM view from bin math (activeId 1133, binStep 25)', async () => {
    const pool = 'PoolDLMMTestAddress11111111111111111111111';
    const mocks: Mocks = {
      accounts: new Map([
        [pool, accountOf(FIXTURE_DLMM_OWNER, FIXTURE_DLMM_B64)],
        [
          '4M9ZPiwchfT96Yiqah5dFYq6Skn6b9YG8qsg4uZNFTQM',
          accountOf(
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            tokenAccountB64(RAY_MINT, 4181761217n),
          ),
        ],
        [
          'FaGEGz7fQKZXCb5W76r93VjwyXuyFdU8Zzd2fizCz1i9',
          accountOf(
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            tokenAccountB64(WSOL_MINT, 17781193790n),
          ),
        ],
      ]),
      supply: new Map([
        [RAY_MINT, { amount: '1', decimals: 6 }],
        [WSOL_MINT, { amount: '1', decimals: 9 }],
      ]),
      holders: new Map(),
    };
    const view = await buildReader(mocks).getPoolView(pool);
    expect(view?.family).toBe('meteora-dlmm');
    expect(view?.priceBA).toBeGreaterThan(0.0165);
    expect(view?.priceBA).toBeLessThan(0.0175);
  });

  it('reads a DBC view (accounting reserves, migrated flag)', async () => {
    const pool = 'PoolDBCTestAddress1111111111111111111111111';
    const mocks: Mocks = {
      accounts: new Map([
        [pool, accountOf(FIXTURE_DBC_OWNER, FIXTURE_DBC_B64)],
        [
          '4S5gufKJEsxtkb4kicRSyYM2LEr3CxjmggdULNifq75B',
          accountOf(
            'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnAAvKmd1qT6M',
            tokenAccountB64(
              'CwHcDBVa35b37yyPs29Z2r2yU9Wxy7TNJtKe9mUWhSNh',
              799502520039510n,
            ),
          ),
        ],
        [
          'B4kEVhvYHwvTShGazJMzN2Cy2Ydag5zvyPoHct2fCRmq',
          accountOf(
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            tokenAccountB64(WSOL_MINT, 20n),
          ),
        ],
      ]),
      supply: new Map([
        [
          'CwHcDBVa35b37yyPs29Z2r2yU9Wxy7TNJtKe9mUWhSNh',
          { amount: '1', decimals: 6 },
        ],
        [WSOL_MINT, { amount: '1', decimals: 9 }],
      ]),
      holders: new Map(),
    };
    const view = await buildReader(mocks).getPoolView(pool);
    expect(view?.family).toBe('meteora-dbc');
    expect(view?.migrated).toBe(true);
    expect(view?.legs[0].reserve).toBe(799000030094747n);
    expect(view?.priceBA).toBeGreaterThan(1e-14);
    expect(view?.priceBA).toBeLessThan(1.5e-14);
  });

  it('reads a pump view with a mint hint (curve PDA is mint-derived)', async () => {
    const pool = '4CyJK3MXbzG1sPdk6pMtE8fpq17s83QTgX7NTKyXADZR';
    const mocks: Mocks = {
      accounts: new Map([
        [pool, accountOf(PUMP_FUN_PROGRAM, FIXTURE_PUMP_CURVE_B64)],
      ]),
      supply: new Map([
        [FIXTURE_PUMP_CURVE_MINT, { amount: '999999649584991', decimals: 6 }],
      ]),
      holders: new Map(),
    };
    const reader = buildReader(mocks);
    expect(await reader.getPoolView(pool)).toBeNull();
    const view = await reader.getPoolView(pool, FIXTURE_PUMP_CURVE_MINT);
    expect(view?.family).toBe('pump');
    expect(view?.legs[0].mint).toBe(FIXTURE_PUMP_CURVE_MINT);
    expect(view?.priceBA).toBeGreaterThan(0.9e-7);
    expect(view?.priceBA).toBeLessThan(1.2e-7);
  });

  it('returns null for unknown owners, missing pools and leg mismatch', async () => {
    const mocks: Mocks = {
      accounts: new Map([
        [
          'UnknownPool1111111111111111111111111111111111',
          accountOf('11111111111111111111111111111111', FIXTURE_AMM_B64),
        ],
      ]),
      supply: new Map(),
      holders: new Map(),
    };
    const reader = buildReader(mocks);
    expect(
      await reader.getPoolView('UnknownPool1111111111111111111111111111111111'),
    ).toBeNull();
    expect(
      await reader.getPoolView('MissingPool11111111111111111111111111'),
    ).toBeNull();

    const mismatch: Mocks = {
      accounts: new Map([
        [
          'MismatchPool11111111111111111111111111111111',
          accountOf(FIXTURE_AMM_OWNER, FIXTURE_AMM_B64),
        ],
        [
          'FdmKUE4UMiJYFK5ogCngHzShuVKrFXBamPWcewDr31th',
          accountOf(
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            tokenAccountB64(WSOL_MINT, 5n),
          ),
        ],
      ]),
      supply: new Map(),
      holders: new Map(),
    };
    expect(
      await buildReader(mismatch).getPoolView(
        'MismatchPool11111111111111111111111111111111',
      ),
    ).toBeNull();
  });

  it('composes token basics: real supply + real metadata + holder math', async () => {
    const mocks: Mocks = {
      accounts: new Map([
        [
          FIXTURE_USDC_META_ADDRESS,
          accountOf(
            'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
            FIXTURE_USDC_META_B64,
          ),
        ],
      ]),
      supply: new Map([
        [USDC_MINT, { amount: '8017313523607011', decimals: 6 }],
      ]),
      holders: new Map([
        [
          USDC_MINT,
          [
            {
              address: 'Holder11111111111111111111111111111111111',
              amount: '4008656761803506',
            },
            {
              address: 'Holder22222222222222222222222222222222222',
              amount: '801731352360701',
            },
          ],
        ],
      ]),
    };
    const basics = await buildReader(mocks).getTokenBasics(USDC_MINT);
    expect(basics?.supply).toEqual({ amount: '8017313523607011', decimals: 6 });
    expect(basics?.metadata).toEqual({
      name: 'USD Coin',
      symbol: 'USDC',
      uri: '',
    });
    expect(basics?.holders).toHaveLength(2);
    expect(basics?.holders?.[0].sharePercent).toBeCloseTo(50, 8);
    expect(basics?.top10SharePercent).toBeCloseTo(60, 8);
  });

  it('returns null basics when supply, holders and metadata all miss', async () => {
    const mocks: Mocks = {
      accounts: new Map(),
      supply: new Map(),
      holders: new Map(),
    };
    expect(
      await buildReader(mocks).getTokenBasics(
        'DeadMint1111111111111111111111111111111111111',
      ),
    ).toBeNull();
  });

  it('never throws on throwing clients', async () => {
    const accounts: BatchAccountsClient = {
      getMultiple: async () => {
        throw new Error('rpc down');
      },
    };
    const supply: TokenSupplyClient = {
      getTokenSupply: async () => {
        throw new Error('rpc down');
      },
    };
    const holders: TokenHoldersClient = {
      getTokenLargestAccounts: async () => {
        throw new Error('rpc down');
      },
    };
    const reader = new OnchainSolanaReaderService(accounts, supply, holders);
    await expect(
      reader.getPoolView('AnyPool11111111111111111111111111111111'),
    ).resolves.toBeNull();
    await expect(
      reader.getTokenBasics('So11111111111111111111111111111111111111112'),
    ).resolves.toBeNull();
  });

  it('derives PDA input safely (bad mint never throws)', async () => {
    const mocks: Mocks = {
      accounts: new Map(),
      supply: new Map(),
      holders: new Map(),
    };
    await expect(
      buildReader(mocks).getTokenBasics('not-a-mint!!!'),
    ).resolves.toBeNull();
  });
});
