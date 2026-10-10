import axios from 'axios';
import {
  HELIUS_ORIGIN_HISTORY_LIMIT,
  HELIUS_ORIGIN_TIMEOUT_MS_DEFAULT,
  LaunchpadDetectorService,
  mapHeliusOriginToLaunchpad,
  resolveHeliusOriginTimeoutMs,
} from './launchpad-detector.service';
import { PUMP_FUN_PROGRAM } from '../domain/launchpad-table';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// INCOME — graduated-old Solana mint (curve closed, 0 DexScreener
// pairs, pump API 1016 from both IPs). Live Helius attempt
// 2026-10-10: history 200 (100-tx window 450534185→453388576),
// earliest-in-window = generic ATA INITIALIZE_ACCOUNT (ComputeBudget
// + Associated-Token programs only, `signer` undefined), full-tx
// fetch 429-walled twice (incl. one 6s-backoff retry). Live does NOT
// confirm pump-fun origin → fixtures below are SYNTHETIC-but-labeled,
// live attempt documented in code + notepad + evidence log.
const INCOME = '7DyyqPAz5RZMiAu9e6h3ynbiREzbNu46gxpJNvimkYdX';

const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111';
const ASSOCIATED_TOKEN = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

function account(owner: string) {
  return {
    data: ['', 'base64'] as unknown as readonly [string, string],
    executable: false,
    lamports: 1000,
    owner,
    rentEpoch: 1,
  };
}

function heliusStub(history: unknown, full: unknown) {
  return {
    getAddressHistory: jest.fn().mockResolvedValue(history),
    parseTransaction: jest.fn().mockResolvedValue(full),
  };
}

function detectorWithHelius(helius: unknown) {
  const solanaRpc = {
    getMultipleAccounts: jest
      .fn()
      .mockResolvedValue([null, null, null, null, null]),
    getAccountInfo: jest.fn().mockResolvedValue(null),
  };
  mockedAxios.post.mockResolvedValue({ data: {} });
  mockedAxios.get.mockResolvedValue({ status: 404, data: null });
  return {
    detector: new LaunchpadDetectorService(
      solanaRpc as never,
      null,
      helius as never,
    ),
    solanaRpc,
  };
}

describe('LaunchpadDetectorService Helius origin leg (todo 36, LAST resort)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('SYNTHETIC graduated-old resolves pump-fun via earliest full-tx program (live 429-walled, see file comment)', async () => {
    const newest = {
      signature: 'sig-newest',
      slot: 453388576,
      type: 'SWAP',
      signer: ['wallet-new'],
      instructions: [{ programId: COMPUTE_BUDGET }],
    };
    const oldest = {
      signature: 'sig-oldest',
      slot: 450534185,
      type: 'UNKNOWN',
      signer: ['creator-wallet'],
      instructions: [{ programId: PUMP_FUN_PROGRAM }],
    };
    const helius = heliusStub([newest, oldest], {
      signature: 'sig-oldest',
      slot: 450534185,
      type: 'UNKNOWN',
      signer: ['creator-wallet'],
      instructions: [
        { programId: COMPUTE_BUDGET },
        { programId: PUMP_FUN_PROGRAM },
      ],
    });
    const { detector } = detectorWithHelius(helius);
    const res = await detector.detectLaunchpad('solana', INCOME);
    expect(res).toEqual({
      id: 'pump-fun',
      name: 'Pump.fun',
      url: `https://pump.fun/coin/${INCOME}`,
    });
    // Seam discipline: ONE history pull (window limit) + ONE full-tx
    // fetch for the slot-ascending earliest ONLY (never the newest).
    expect(helius.getAddressHistory).toHaveBeenCalledTimes(1);
    expect(helius.getAddressHistory).toHaveBeenCalledWith(
      INCOME,
      HELIUS_ORIGIN_HISTORY_LIMIT,
    );
    expect(helius.parseTransaction).toHaveBeenCalledTimes(1);
    expect(helius.parseTransaction).toHaveBeenCalledWith('sig-oldest');
  });

  it('fast legs win with ZERO Helius calls (PDA pump hit short-circuits)', async () => {
    const solanaRpc = {
      getMultipleAccounts: jest
        .fn()
        .mockResolvedValue([
          account('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'),
          null,
          null,
          null,
          null,
        ]),
      getAccountInfo: jest.fn().mockResolvedValue(null),
    };
    mockedAxios.post.mockResolvedValue({ data: {} });
    mockedAxios.get.mockResolvedValue({ status: 404, data: null });
    const helius = heliusStub([], null);
    const detector = new LaunchpadDetectorService(
      solanaRpc as never,
      null,
      helius as never,
    );
    const res = await detector.detectLaunchpad('solana', INCOME);
    expect(res?.id).toBe('pump-fun');
    expect(helius.getAddressHistory).not.toHaveBeenCalled();
    expect(helius.parseTransaction).not.toHaveBeenCalled();
  });

  it('EVM factory hit never touches Helius (Solana-only leg)', async () => {
    const token = '0x1111111111111111111111111111111111111111';
    const solanaRpc = {
      getMultipleAccounts: jest.fn(),
      getAccountInfo: jest.fn(),
    };
    mockedAxios.post.mockImplementation(async (url: string) => {
      if (String(url).includes('heaven')) return { data: {} };
      return {
        status: 200,
        data: {
          result: { to: '0xE85A59c628F7d27878ACeB4bf3b35733630083a9' },
        },
      };
    });
    mockedAxios.get.mockImplementation(async (url: string) => {
      if (String(url).includes('blockscout')) {
        return {
          status: 200,
          data: {
            result: [{ contractAddress: token, txHash: '0xdeadbeef' }],
          },
        };
      }
      return { status: 404, data: null };
    });
    const helius = heliusStub([], null);
    const detector = new LaunchpadDetectorService(
      solanaRpc as never,
      null,
      helius as never,
    );
    const res = await detector.detectLaunchpad('base', token);
    expect(res?.id).toBe('clanker');
    expect(helius.getAddressHistory).not.toHaveBeenCalled();
    expect(helius.parseTransaction).not.toHaveBeenCalled();
  });

  it('Helius history rejection fails open to null', async () => {
    const helius = {
      getAddressHistory: jest.fn().mockRejectedValue(new Error('429')),
      parseTransaction: jest.fn(),
    };
    const { detector } = detectorWithHelius(helius);
    await expect(
      detector.detectLaunchpad('solana', INCOME),
    ).resolves.toBeNull();
    expect(helius.parseTransaction).not.toHaveBeenCalled();
  });

  it('Helius empty history fails open to null', async () => {
    const helius = heliusStub([], null);
    const { detector } = detectorWithHelius(helius);
    await expect(
      detector.detectLaunchpad('solana', INCOME),
    ).resolves.toBeNull();
    expect(helius.parseTransaction).not.toHaveBeenCalled();
  });

  it('Helius parse failure (null + throw) fails open to null', async () => {
    for (const full of [null, Promise.reject(new Error('down'))]) {
      const helius = {
        getAddressHistory: jest
          .fn()
          .mockResolvedValue([
            { signature: 'sig-x', slot: 1, instructions: [] },
          ]),
        parseTransaction: jest.fn().mockReturnValue(full),
      };
      const { detector } = detectorWithHelius(helius);
      await expect(
        detector.detectLaunchpad('solana', INCOME),
      ).resolves.toBeNull();
    }
  });

  it('absent Helius DI resolves null with zero network (hand-built specs intact)', async () => {
    const solanaRpc = {
      getMultipleAccounts: jest
        .fn()
        .mockResolvedValue([null, null, null, null, null]),
      getAccountInfo: jest.fn().mockResolvedValue(null),
    };
    mockedAxios.post.mockResolvedValue({ data: {} });
    mockedAxios.get.mockResolvedValue({ status: 404, data: null });
    const detector = new LaunchpadDetectorService(solanaRpc as never);
    await expect(
      detector.detectLaunchpad('solana', INCOME),
    ).resolves.toBeNull();
  });

  it('INCOME live shape (generic ATA earliest, no known program) resolves null — never guesses', async () => {
    const helius = heliusStub(
      [
        {
          signature:
            '4BHXsRinstsMyqChtP7XLXhxbor9FYgvzb7WZz19Sem2G63N2EJ4UJmq3GVserhcgzNKxYGVeBtK9rmA2hASgp8J',
          slot: 450534185,
          type: 'INITIALIZE_ACCOUNT',
          instructions: [
            { programId: COMPUTE_BUDGET },
            { programId: ASSOCIATED_TOKEN },
          ],
        },
      ],
      {
        signature:
          '4BHXsRinstsMyqChtP7XLXhxbor9FYgvzb7WZz19Sem2G63N2EJ4UJmq3GVserhcgzNKxYGVeBtK9rmA2hASgp8J',
        slot: 450534185,
        type: 'INITIALIZE_ACCOUNT',
        signer: undefined,
        instructions: [
          { programId: COMPUTE_BUDGET },
          { programId: ASSOCIATED_TOKEN },
        ],
      },
    );
    const { detector } = detectorWithHelius(helius);
    await expect(
      detector.detectLaunchpad('solana', INCOME),
    ).resolves.toBeNull();
  });

  it('suggestive metadata without actor hit resolves null (never name/symbol keying)', async () => {
    const helius = heliusStub([{ signature: 'sig-x', slot: 7 }], {
      signature: 'sig-x',
      slot: 7,
      signer: ['7xRandomWallet1111111111111111111111111111'],
      instructions: [{ programId: '11111111111111111111111111111111' }],
      name: 'Believe',
      symbol: 'BELIEVE',
    });
    const { detector } = detectorWithHelius(helius);
    await expect(
      detector.detectLaunchpad('solana', INCOME),
    ).resolves.toBeNull();
  });
});

describe('mapHeliusOriginToLaunchpad (pure actor table)', () => {
  it('first KNOWN program in tx order wins', () => {
    expect(
      mapHeliusOriginToLaunchpad({
        instructions: [
          { programId: COMPUTE_BUDGET },
          { programId: PUMP_FUN_PROGRAM },
        ],
        signer: ['w'],
      }),
    ).toBe('pump-fun');
  });

  it('null/undefined/empty inputs resolve null', () => {
    expect(mapHeliusOriginToLaunchpad(null)).toBeNull();
    expect(mapHeliusOriginToLaunchpad(undefined)).toBeNull();
    expect(mapHeliusOriginToLaunchpad({})).toBeNull();
    expect(mapHeliusOriginToLaunchpad({ instructions: [] })).toBeNull();
    expect(
      mapHeliusOriginToLaunchpad({ instructions: [{ programId: '' }] }),
    ).toBeNull();
  });

  it('fee-payer Believe path stays null while the allowlist is empty (gated, never guessed)', () => {
    expect(
      mapHeliusOriginToLaunchpad({
        instructions: [{ programId: COMPUTE_BUDGET }],
        signer: ['SomeDeployerWallet111111111111111111111'],
        feePayer: 'SomeDeployerWallet111111111111111111111',
      }),
    ).toBeNull();
  });
});

describe('resolveHeliusOriginTimeoutMs (archival budget)', () => {
  it('defaults to 8000 on undefined/garbage', () => {
    expect(resolveHeliusOriginTimeoutMs(undefined)).toBe(
      HELIUS_ORIGIN_TIMEOUT_MS_DEFAULT,
    );
    expect(resolveHeliusOriginTimeoutMs('nope')).toBe(
      HELIUS_ORIGIN_TIMEOUT_MS_DEFAULT,
    );
    expect(resolveHeliusOriginTimeoutMs('-5')).toBe(
      HELIUS_ORIGIN_TIMEOUT_MS_DEFAULT,
    );
  });

  it('floors numeric input', () => {
    expect(resolveHeliusOriginTimeoutMs('12000.9')).toBe(12000);
  });
});
