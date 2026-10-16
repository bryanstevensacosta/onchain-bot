import axios from 'axios';
import {
  PUMP_MINT_SUFFIX,
  corroboratePumpSuffix,
  hasPumpSuffix,
} from '../domain/pump-suffix-corroboration';
import { LaunchpadDetectorService } from './launchpad-detector.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Synthetic mints (valid base58, decode to 32 bytes — verified):
// one WITH the `...pump` suffix, one without. Neither has a live
// curve in these specs (all legs mocked to miss), so both MUST
// resolve null at the detector level regardless of suffix.
const SUFFIX_MINT = 'So1111111111111111111111111111111111111pump';
const PLAIN_MINT = 'So11111111111111111111111111111111111111112';

function allMissDetector(helius: unknown = null) {
  const solanaRpc = {
    getMultipleAccounts: jest
      .fn()
      .mockResolvedValue([null, null, null, null, null]),
    getAccountInfo: jest.fn().mockResolvedValue(null),
  };
  mockedAxios.post.mockResolvedValue({ data: {} });
  mockedAxios.get.mockResolvedValue({ status: 404, data: null });
  return new LaunchpadDetectorService(
    solanaRpc as never,
    null,
    helius as never,
  );
}

describe('hasPumpSuffix (mint shape, case-sensitive)', () => {
  it('matches a trailing lowercase pump', () => {
    expect(hasPumpSuffix(SUFFIX_MINT)).toBe(true);
    expect(hasPumpSuffix('2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump')).toBe(
      true,
    );
  });

  it('rejects wrong case, empty, and EVM hex (no u/m in hex)', () => {
    expect(hasPumpSuffix(PLAIN_MINT)).toBe(false);
    expect(hasPumpSuffix('So1111111111111111111111111111111111111PUMP')).toBe(
      false,
    );
    expect(hasPumpSuffix('So1111111111111111111111111111111111111Pump')).toBe(
      false,
    );
    expect(hasPumpSuffix('')).toBe(false);
    expect(hasPumpSuffix('0x1111111111111111111111111111111111111111')).toBe(
      false,
    );
  });

  it('pins the suffix constant', () => {
    expect(PUMP_MINT_SUFFIX).toBe('pump');
  });
});

describe('corroboratePumpSuffix (decision table, ranks 2-4)', () => {
  it('detector pump-fun + suffix -> same id, corroborated', () => {
    expect(corroboratePumpSuffix('pump-fun', SUFFIX_MINT)).toEqual({
      id: 'pump-fun',
      corroborated: true,
    });
  });

  it('detector pump-fun without suffix -> same id, uncorroborated', () => {
    expect(corroboratePumpSuffix('pump-fun', PLAIN_MINT)).toEqual({
      id: 'pump-fun',
      corroborated: false,
    });
  });

  it('detector other-id + suffix -> other id wins, never re-keyed to pump-fun', () => {
    expect(corroboratePumpSuffix('raydium-launchlab', SUFFIX_MINT)).toEqual({
      id: 'raydium-launchlab',
      corroborated: false,
    });
    expect(corroboratePumpSuffix('meteora-dbc', SUFFIX_MINT)).toEqual({
      id: 'meteora-dbc',
      corroborated: false,
    });
  });

  it('MANDATORY FALSIFIER (R1 dexter-launchpad.md:57): detector null + suffix -> null', () => {
    expect(corroboratePumpSuffix(null, SUFFIX_MINT)).toEqual({
      id: null,
      corroborated: false,
    });
  });

  it('detector null/undefined/empty without suffix -> null', () => {
    for (const detectorId of [null, undefined, '']) {
      expect(corroboratePumpSuffix(detectorId, PLAIN_MINT)).toEqual({
        id: null,
        corroborated: false,
      });
    }
  });

  it('no-bit-without-value invariant: id null always implies corroborated false', () => {
    for (const mint of [SUFFIX_MINT, PLAIN_MINT, '']) {
      const out = corroboratePumpSuffix(null, mint);
      expect(out.id).toBeNull();
      expect(out.corroborated).toBe(false);
    }
  });
});

describe('detector-level falsifier (suffix never decides)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('suffix mint + all legs miss (no Helius DI) -> null, not pump-fun', async () => {
    const detector = allMissDetector();
    await expect(
      detector.detectLaunchpad('solana', SUFFIX_MINT),
    ).resolves.toBeNull();
  });

  it('plain mint + all legs miss -> null (control: suffix changes nothing)', async () => {
    const detector = allMissDetector();
    await expect(
      detector.detectLaunchpad('solana', PLAIN_MINT),
    ).resolves.toBeNull();
  });

  it('seam identity: detector verdict passes through byte-identical (positive case)', async () => {
    const solanaRpc = {
      getMultipleAccounts: jest.fn().mockResolvedValue([
        {
          data: ['', 'base64'] as unknown as readonly [string, string],
          executable: false,
          lamports: 1000,
          owner: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
          rentEpoch: 1,
        },
        null,
        null,
        null,
        null,
      ]),
      getAccountInfo: jest.fn().mockResolvedValue(null),
    };
    mockedAxios.post.mockResolvedValue({ data: {} });
    mockedAxios.get.mockResolvedValue({ status: 404, data: null });
    const detector = new LaunchpadDetectorService(
      solanaRpc as never,
      null,
      null,
    );
    // PDA pump hit on a suffix mint: verdict is pump-fun WITH
    // corroboration available — the seam returns the SAME verdict
    // (observe-only; the debug log is the only observable).
    const res = await detector.detectLaunchpad('solana', SUFFIX_MINT);
    expect(res).toEqual({
      id: 'pump-fun',
      name: 'Pump.fun',
      url: `https://pump.fun/coin/${SUFFIX_MINT}`,
    });
    expect(corroboratePumpSuffix(res?.id ?? null, SUFFIX_MINT)).toEqual({
      id: 'pump-fun',
      corroborated: true,
    });
  });
});
