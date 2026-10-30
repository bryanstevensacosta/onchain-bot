import type {
  BatchAccountsClient,
  SolanaAccountInfoValue,
} from 'provider/infrastructure/solana-rpc/solana-rpc.types';
import {
  addressToBytes,
  findProgramAddress,
  utf8Seed,
} from 'launchpad/infrastructure/solana-pda';
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
import {
  METAPLEX_TOKEN_METADATA_PROGRAM,
  TOKEN_2022_PROGRAM,
} from './solana-program-ids';
import { anchorDiscriminator } from './solana-program-ids';

const RAY_MINT = '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const USD1_MINT = 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB';
const REFERENCE_MINT = '2dNdT2gD8x2BkmffjAyQe3o6hES33jg1tAgTJCRkvBTC';
const REFERENCE_QUOTE_MINT = 'HytpiyuR3sVXGB5UqoqrnThCPH2X1tWVm5neep3Dpump';
/** `[b"bonding-curve", 2dNdT2…BTC]` under PUMP_FUN (web3.js 1.98.0). */
const REFERENCE_CURVE_PDA = '5sqQd6fn8FqNkRerAYcz2gewDd97JHe9fvGASwRqQiCC';

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

function buildClients(
  mocks: Mocks,
  getMultipleOverride?: BatchAccountsClient['getMultiple'],
): {
  accounts: BatchAccountsClient;
  supply: TokenSupplyClient;
  holders: TokenHoldersClient;
} {
  const accounts: BatchAccountsClient = {
    getMultiple:
      getMultipleOverride ??
      (async (addresses) =>
        addresses.map((a) => mocks.accounts.get(a) ?? null)),
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
  return { accounts, supply, holders };
}

function buildReader(mocks: Mocks): OnchainSolanaReaderService {
  const { accounts, supply, holders } = buildClients(mocks);
  return new OnchainSolanaReaderService(accounts, supply, holders);
}

/** Reader whose `getMultiple` call count can be asserted. */
function buildSpyReader(mocks: Mocks): {
  reader: OnchainSolanaReaderService;
  getMultiple: jest.Mock<
    ReturnType<BatchAccountsClient['getMultiple']>,
    [ReadonlyArray<string>]
  >;
} {
  const getMultiple = jest.fn(
    async (
      addresses: ReadonlyArray<string>,
    ): Promise<ReadonlyArray<SolanaAccountInfoValue | null>> =>
      addresses.map((a) => mocks.accounts.get(a) ?? null),
  );
  const { accounts, supply, holders } = buildClients(mocks, getMultiple);
  return {
    reader: new OnchainSolanaReaderService(accounts, supply, holders),
    getMultiple,
  };
}

/** Synthetic 166B pump curve (disc + reserves + complete=false + tail). */
function syntheticCurveB64(options?: {
  quoteMint?: string | null;
  realTokenReserves?: bigint;
  virtualTokenReserves?: bigint;
  virtualQuoteReserves?: bigint;
}): string {
  const raw = Buffer.alloc(166);
  Buffer.from(anchorDiscriminator('BondingCurve')).copy(raw, 0);
  raw.writeBigUInt64LE(options?.virtualTokenReserves ?? 1_000_000_000_000n, 8);
  raw.writeBigUInt64LE(options?.virtualQuoteReserves ?? 30_000_000_000n, 16);
  raw.writeBigUInt64LE(options?.realTokenReserves ?? 272_126_872_931_864n, 24);
  raw.writeBigUInt64LE(5_000_000_000n, 32);
  raw.writeBigUInt64LE(1_000_000_000_000_000n, 40);
  raw[48] = 0; // complete
  Buffer.from(
    addressToBytes('5LH1W9Qn6SYUfAf8tMLsNYU3pHgPPTkLTUQMZdP3DG3M'),
  ).copy(raw, 49); // creator
  raw[81] = 0; // is_mayhem_mode
  raw[82] = 0; // is_cashback_coin
  if (options?.quoteMint) {
    Buffer.from(addressToBytes(options.quoteMint)).copy(raw, 83);
  }
  raw.writeBigUInt64LE(25n, 115); // creator_fee_bps
  return raw.toString('base64');
}

/**
 * Token-2022 mint account with an embedded TokenMetadata extension
 * (type 19): 165B padded base + accountType@165 + TLV@166.
 */
function token2022MintB64(symbol: string, mint = REFERENCE_QUOTE_MINT): string {
  const base = Buffer.alloc(165);
  base.writeBigUInt64LE(21_000_000n, 36); // supply
  base[44] = 8; // decimals
  base[45] = 1; // isInitialized
  const accountType = Buffer.from([1]); // AccountType::Mint
  const value: number[] = [
    ...addressToBytes(mint), // update authority
    ...addressToBytes(mint), // mint
  ];
  const pushString = (text: string): void => {
    const bytes = Buffer.from(text, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(bytes.length, 0);
    value.push(...len, ...bytes);
  };
  pushString('Bitcoin');
  pushString(symbol);
  pushString('ipfs://QmBitcoin');
  value.push(0, 0, 0, 0); // additional_metadata count = 0
  const header = Buffer.alloc(4);
  header.writeUInt16LE(19, 0);
  header.writeUInt16LE(value.length, 2);
  return Buffer.concat([
    base,
    accountType,
    header,
    Buffer.from(value),
  ]).toString('base64');
}

/** Classic SPL mint account (82B base header, no extensions). */
function classicMintB64(): string {
  const raw = Buffer.alloc(82);
  raw.writeBigUInt64LE(21_000_000n, 36); // supply
  raw[44] = 6; // decimals
  raw[45] = 1; // isInitialized
  return raw.toString('base64');
}

/** Metaplex MetadataV1 account (key=4) naming `mint` as `symbol`. */ function metaplexMetadataB64(
  mint: string,
  symbol: string,
): string {
  const raw: number[] = [4, ...addressToBytes(mint), ...addressToBytes(mint)];
  const pushString = (text: string): void => {
    const bytes = Buffer.from(text, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(bytes.length, 0);
    raw.push(...len, ...bytes);
  };
  pushString('Bitcoin');
  pushString(symbol);
  pushString('ipfs://QmBitcoin');
  raw.push(0, 0, 0, 0, 1);
  return Buffer.from(raw).toString('base64');
}

function emptyMocks(): Mocks {
  return { accounts: new Map(), supply: new Map(), holders: new Map() };
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
    // SOL-like quote (fixture `quote_mint` is the all-zero slot).
    expect(view?.legs[1].mint).toBe(WSOL_MINT);
    expect(view?.legs[1].decimals).toBe(9);
    expect(view?.priceBA).toBeGreaterThan(0.9e-7);
    expect(view?.priceBA).toBeLessThan(1.2e-7);
    expect(view?.curve).toEqual({
      realTokenReserves: 282335733991342n,
      tokenTotalSupply: 1000000000000000n,
      quoteMint: null,
      quoteSymbol: null,
      // 100 × (1 − 282335733991342 / 793100000000000) = 64.4009918054…
      progressPercent: 64.401,
    });
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
      isMutable: true,
    });
    expect(basics?.holders).toHaveLength(2);
    expect(basics?.holders?.[0].sharePercent).toBeCloseTo(50, 8);
    expect(basics?.top10SharePercent).toBeCloseTo(60, 8);
  });

  it('resolves metadata for a Token-2022 mint via the same PDA path (program-agnostic scope)', async () => {
    // Scope pin (dexter plan todo 39): the metadata PDA derivation +
    // decode never inspect the mint account owner, so a Token-2022
    // mint WITH a metadata PDA resolves identically. Only names
    // embedded SOLELY in the Token-2022 extension (no PDA) are out
    // of scope — mint-account TLV parsing, no demand case.
    const mint = '6HD1iyTY4ChvoFEKgQ2tV4rHavrpR1yJw9Kwyqtm7hmC';
    const pda = findProgramAddress(
      [
        utf8Seed('metadata'),
        addressToBytes(METAPLEX_TOKEN_METADATA_PROGRAM),
        addressToBytes(mint),
      ],
      METAPLEX_TOKEN_METADATA_PROGRAM,
    ).address;
    const raw: number[] = [4, ...addressToBytes(mint), ...addressToBytes(mint)];
    const pushString = (value: string): void => {
      const bytes = Buffer.from(value, 'utf8');
      const len = Buffer.alloc(4);
      len.writeUInt32LE(bytes.length, 0);
      raw.push(...len, ...bytes);
    };
    pushString('Twentytwo');
    pushString('T22');
    pushString('');
    raw.push(0, 0, 0, 0, 1);
    const mocks: Mocks = {
      accounts: new Map([
        [
          pda,
          accountOf(
            METAPLEX_TOKEN_METADATA_PROGRAM,
            Buffer.from(raw).toString('base64'),
          ),
        ],
      ]),
      supply: new Map(),
      holders: new Map(),
    };
    const basics = await buildReader(mocks).getTokenBasics(mint);
    expect(basics?.metadata).toEqual({
      name: 'Twentytwo',
      symbol: 'T22',
      uri: '',
      isMutable: true,
    });
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

describe('OnchainSolanaReaderService.getPumpCurve (§10.16 bonding curve)', () => {
  it('derives the reference curve PDA and reads it in ONE call', async () => {
    const mocks = emptyMocks();
    mocks.accounts.set(
      REFERENCE_CURVE_PDA,
      accountOf(PUMP_FUN_PROGRAM, syntheticCurveB64()),
    );
    const { reader, getMultiple } = buildSpyReader(mocks);
    const reading = await reader.getPumpCurve(REFERENCE_MINT);
    expect(getMultiple).toHaveBeenCalledTimes(1);
    expect(getMultiple).toHaveBeenCalledWith([REFERENCE_CURVE_PDA]);
    expect(reading).toEqual({
      poolAddress: REFERENCE_CURVE_PDA,
      onCurve: true,
      launchpadId: 'pump-fun',
      quoteSymbol: null,
      quoteMint: null,
      progressPercent: 65.6882,
    });
  });

  it('fails open (null) for a bad mint, no extra reads and no throw', async () => {
    const { reader, getMultiple } = buildSpyReader(emptyMocks());
    await expect(reader.getPumpCurve('not-a-mint!!!')).resolves.toBeNull();
    expect(getMultiple).not.toHaveBeenCalled();
  });

  it('fails open (null) for a missing account', async () => {
    const mocks = emptyMocks();
    mocks.accounts.set(REFERENCE_CURVE_PDA, null);
    await expect(
      buildReader(mocks).getPumpCurve(REFERENCE_MINT),
    ).resolves.toBeNull();
  });

  it('fails open (null) for a foreign owner (never onCurve:false)', async () => {
    const mocks = emptyMocks();
    mocks.accounts.set(
      REFERENCE_CURVE_PDA,
      accountOf(RAYDIUM_AMM_V4_PROGRAM, syntheticCurveB64()),
    );
    await expect(
      buildReader(mocks).getPumpCurve(REFERENCE_MINT),
    ).resolves.toBeNull();
  });

  it('fails open (null) for a short account', async () => {
    const mocks = emptyMocks();
    const short = Buffer.from(anchorDiscriminator('BondingCurve'));
    mocks.accounts.set(
      REFERENCE_CURVE_PDA,
      accountOf(PUMP_FUN_PROGRAM, short.toString('base64')),
    );
    await expect(
      buildReader(mocks).getPumpCurve(REFERENCE_MINT),
    ).resolves.toBeNull();
  });

  it('fails open (null) for a graduated curve (complete !== 0)', async () => {
    const mocks = emptyMocks();
    const graduated = Buffer.from(syntheticCurveB64(), 'base64');
    graduated[48] = 1;
    mocks.accounts.set(
      REFERENCE_CURVE_PDA,
      accountOf(PUMP_FUN_PROGRAM, graduated.toString('base64')),
    );
    await expect(
      buildReader(mocks).getPumpCurve(REFERENCE_MINT),
    ).resolves.toBeNull();
  });

  it('returns null when the account transport throws', async () => {
    const { accounts, supply, holders } = buildClients(
      emptyMocks(),
      async () => {
        throw new Error('rpc down');
      },
    );
    const reader = new OnchainSolanaReaderService(accounts, supply, holders);
    await expect(reader.getPumpCurve(REFERENCE_MINT)).resolves.toBeNull();
  });

  it('resolves the Token-2022 embedded symbol (`Bitcoin` witness shape)', async () => {
    const mocks = emptyMocks();
    mocks.accounts.set(
      REFERENCE_CURVE_PDA,
      accountOf(
        PUMP_FUN_PROGRAM,
        syntheticCurveB64({ quoteMint: REFERENCE_QUOTE_MINT }),
      ),
    );
    mocks.accounts.set(
      REFERENCE_QUOTE_MINT,
      accountOf(TOKEN_2022_PROGRAM, token2022MintB64('Bitcoin')),
    );
    const { reader, getMultiple } = buildSpyReader(mocks);
    const reading = await reader.getPumpCurve(REFERENCE_MINT);
    expect(reading?.quoteMint).toBe(REFERENCE_QUOTE_MINT);
    expect(reading?.quoteSymbol).toBe('Bitcoin');
    // Curve + quote mint; the Metaplex leg never fires.
    expect(getMultiple).toHaveBeenCalledTimes(2);
    expect(getMultiple).toHaveBeenCalledWith([REFERENCE_QUOTE_MINT]);
  });

  it('pins the Metaplex metadata PDA for the reference quote mint', () => {
    const pda = findProgramAddress(
      [
        utf8Seed('metadata'),
        addressToBytes(METAPLEX_TOKEN_METADATA_PROGRAM),
        addressToBytes(REFERENCE_QUOTE_MINT),
      ],
      METAPLEX_TOKEN_METADATA_PROGRAM,
    ).address;
    expect(pda).toBe('2gvncxFdRKWtuz2Qz2k2fCC59pJtfoBbtQzMQNdND6sL');
  });

  it('falls back to Metaplex metadata for a classic-SPL quote mint', async () => {
    const mocks = emptyMocks();
    mocks.accounts.set(
      REFERENCE_CURVE_PDA,
      accountOf(PUMP_FUN_PROGRAM, syntheticCurveB64({ quoteMint: USDC_MINT })),
    );
    mocks.accounts.set(
      USDC_MINT,
      accountOf(
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        classicMintB64(),
      ),
    );
    const metadataPda = findProgramAddress(
      [
        utf8Seed('metadata'),
        addressToBytes(METAPLEX_TOKEN_METADATA_PROGRAM),
        addressToBytes(USDC_MINT),
      ],
      METAPLEX_TOKEN_METADATA_PROGRAM,
    ).address;
    mocks.accounts.set(
      metadataPda,
      accountOf(
        METAPLEX_TOKEN_METADATA_PROGRAM,
        metaplexMetadataB64(USDC_MINT, 'USDC'),
      ),
    );
    const { reader, getMultiple } = buildSpyReader(mocks);
    const reading = await reader.getPumpCurve(REFERENCE_MINT);
    expect(reading?.quoteMint).toBe(USDC_MINT);
    expect(reading?.quoteSymbol).toBe('USDC');
    expect(getMultiple).toHaveBeenCalledTimes(3);
    expect(getMultiple).toHaveBeenCalledWith([metadataPda]);
  });

  it('keeps quoteMint when no symbol resolves (it is data, not a guess)', async () => {
    const mocks = emptyMocks();
    mocks.accounts.set(
      REFERENCE_CURVE_PDA,
      accountOf(PUMP_FUN_PROGRAM, syntheticCurveB64({ quoteMint: USDC_MINT })),
    );
    mocks.accounts.set(
      USDC_MINT,
      accountOf(
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        classicMintB64(),
      ),
    );
    const reading = await buildReader(mocks).getPumpCurve(REFERENCE_MINT);
    expect(reading?.quoteMint).toBe(USDC_MINT);
    expect(reading?.quoteSymbol).toBeNull();
    expect(reading?.progressPercent).toBe(65.6882);
  });

  it('caches definitive answers: the second call pays ZERO extra reads', async () => {
    const mocks = emptyMocks();
    mocks.accounts.set(
      REFERENCE_CURVE_PDA,
      accountOf(
        PUMP_FUN_PROGRAM,
        syntheticCurveB64({ quoteMint: REFERENCE_QUOTE_MINT }),
      ),
    );
    mocks.accounts.set(
      REFERENCE_QUOTE_MINT,
      accountOf(TOKEN_2022_PROGRAM, token2022MintB64('Bitcoin')),
    );
    const { reader, getMultiple } = buildSpyReader(mocks);
    expect((await reader.getPumpCurve(REFERENCE_MINT))?.quoteSymbol).toBe(
      'Bitcoin',
    );
    expect(getMultiple).toHaveBeenCalledTimes(2);
    expect((await reader.getPumpCurve(REFERENCE_MINT))?.quoteSymbol).toBe(
      'Bitcoin',
    );
    // Only the curve read: the cached quote symbol costs nothing.
    expect(getMultiple).toHaveBeenCalledTimes(3);
    expect(getMultiple).toHaveBeenLastCalledWith([REFERENCE_CURVE_PDA]);
  });

  it('caches a definitive null (both legs answered) — zero extra reads', async () => {
    const mocks = emptyMocks();
    mocks.accounts.set(
      REFERENCE_CURVE_PDA,
      accountOf(PUMP_FUN_PROGRAM, syntheticCurveB64({ quoteMint: USDC_MINT })),
    );
    mocks.accounts.set(
      USDC_MINT,
      accountOf(
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        classicMintB64(),
      ),
    );
    const { reader, getMultiple } = buildSpyReader(mocks);
    expect((await reader.getPumpCurve(REFERENCE_MINT))?.quoteSymbol).toBeNull();
    expect(getMultiple).toHaveBeenCalledTimes(3);
    await reader.getPumpCurve(REFERENCE_MINT);
    expect(getMultiple).toHaveBeenCalledTimes(4);
  });

  it('does NOT cache an unreadable mint account (retries next call)', async () => {
    const mocks = emptyMocks();
    mocks.accounts.set(
      REFERENCE_CURVE_PDA,
      accountOf(PUMP_FUN_PROGRAM, syntheticCurveB64({ quoteMint: USDC_MINT })),
    );
    const { reader, getMultiple } = buildSpyReader(mocks);
    await reader.getPumpCurve(REFERENCE_MINT);
    const first = getMultiple.mock.calls.length;
    await reader.getPumpCurve(REFERENCE_MINT);
    // Both calls paid the full ladder (curve + mint + Metaplex).
    expect(getMultiple.mock.calls.length).toBe(first * 2);
  });

  it('pays ZERO extra reads for SOL-like quotes (all-zero and WSOL)', async () => {
    const zero = emptyMocks();
    zero.accounts.set(
      REFERENCE_CURVE_PDA,
      accountOf(PUMP_FUN_PROGRAM, syntheticCurveB64()),
    );
    const zeroSpy = buildSpyReader(zero);
    const zeroReading = await zeroSpy.reader.getPumpCurve(REFERENCE_MINT);
    expect(zeroSpy.getMultiple).toHaveBeenCalledTimes(1);
    expect(zeroReading?.quoteMint).toBeNull();

    const wsol = emptyMocks();
    wsol.accounts.set(
      REFERENCE_CURVE_PDA,
      accountOf(PUMP_FUN_PROGRAM, syntheticCurveB64({ quoteMint: WSOL_MINT })),
    );
    const wsolSpy = buildSpyReader(wsol);
    const wsolReading = await wsolSpy.reader.getPumpCurve(REFERENCE_MINT);
    expect(wsolSpy.getMultiple).toHaveBeenCalledTimes(1);
    expect(wsolReading?.quoteMint).toBeNull();
    expect(wsolReading?.quoteSymbol).toBeNull();
  });

  it('pumpView uses the REAL quote leg + its decimals and fills `curve`', async () => {
    const mocks = emptyMocks();
    mocks.accounts.set(
      REFERENCE_CURVE_PDA,
      accountOf(
        PUMP_FUN_PROGRAM,
        syntheticCurveB64({ quoteMint: REFERENCE_QUOTE_MINT }),
      ),
    );
    mocks.accounts.set(
      REFERENCE_QUOTE_MINT,
      accountOf(TOKEN_2022_PROGRAM, token2022MintB64('Bitcoin')),
    );
    mocks.supply.set(REFERENCE_MINT, {
      amount: '1000000000000000',
      decimals: 6,
    });
    mocks.supply.set(REFERENCE_QUOTE_MINT, { amount: '21000000', decimals: 8 });
    const { reader, getMultiple } = buildSpyReader(mocks);
    const view = await reader.getPoolView(REFERENCE_CURVE_PDA, REFERENCE_MINT);
    expect(view?.family).toBe('pump');
    expect(view?.legs[1].mint).toBe(REFERENCE_QUOTE_MINT);
    expect(view?.legs[1].decimals).toBe(8);
    // (30e9 / 1e8) / (1e12 / 1e6) = 300 / 1_000_000 = 3e-4
    expect(view?.priceBA).toBeCloseTo(3e-4, 12);
    expect(view?.curve).toEqual({
      realTokenReserves: 272_126_872_931_864n,
      tokenTotalSupply: 1_000_000_000_000_000n,
      quoteMint: REFERENCE_QUOTE_MINT,
      quoteSymbol: 'Bitcoin',
      progressPercent: 65.6882,
    });
    // Curve + quote mint; the price only needed `getTokenSupply`.
    expect(getMultiple).toHaveBeenCalledTimes(2);
  });

  it('pumpView keeps the view when leg-B decimals cannot be read', async () => {
    const mocks = emptyMocks();
    mocks.accounts.set(
      REFERENCE_CURVE_PDA,
      accountOf(
        PUMP_FUN_PROGRAM,
        syntheticCurveB64({ quoteMint: REFERENCE_QUOTE_MINT }),
      ),
    );
    mocks.supply.set(REFERENCE_MINT, {
      amount: '1000000000000000',
      decimals: 6,
    });
    const view = await buildReader(mocks).getPoolView(
      REFERENCE_CURVE_PDA,
      REFERENCE_MINT,
    );
    expect(view?.legs[1].mint).toBe(REFERENCE_QUOTE_MINT);
    expect(view?.legs[1].decimals).toBeNull();
    expect(view?.priceBA).toBeNull();
    expect(view?.curve?.quoteMint).toBe(REFERENCE_QUOTE_MINT);
    expect(view?.curve?.quoteSymbol).toBeNull();
  });

  it('shares the quote cache between pumpView and getPumpCurve', async () => {
    const mocks = emptyMocks();
    mocks.accounts.set(
      REFERENCE_CURVE_PDA,
      accountOf(
        PUMP_FUN_PROGRAM,
        syntheticCurveB64({ quoteMint: REFERENCE_QUOTE_MINT }),
      ),
    );
    mocks.accounts.set(
      REFERENCE_QUOTE_MINT,
      accountOf(TOKEN_2022_PROGRAM, token2022MintB64('Bitcoin')),
    );
    mocks.supply.set(REFERENCE_MINT, {
      amount: '1000000000000000',
      decimals: 6,
    });
    mocks.supply.set(REFERENCE_QUOTE_MINT, { amount: '21000000', decimals: 8 });
    const { reader, getMultiple } = buildSpyReader(mocks);
    await reader.getPoolView(REFERENCE_CURVE_PDA, REFERENCE_MINT);
    expect(getMultiple).toHaveBeenCalledTimes(2);
    const reading = await reader.getPumpCurve(REFERENCE_MINT);
    expect(reading?.quoteSymbol).toBe('Bitcoin');
    // getPumpCurve only re-read the curve: the symbol was already cached.
    expect(getMultiple).toHaveBeenCalledTimes(3);
    expect(getMultiple).toHaveBeenLastCalledWith([REFERENCE_CURVE_PDA]);
  });
});
