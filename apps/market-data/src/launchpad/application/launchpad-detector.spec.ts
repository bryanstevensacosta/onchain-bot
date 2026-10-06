import axios from 'axios';
import { LaunchpadDetectorService } from './launchpad-detector.service';
import { STONKFUN_PLATFORM_CONFIGS } from '../domain/launchpad-table';
import { addressToBytes } from '../infrastructure/solana-pda';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const CHALE = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';

function account(owner: string, raw?: Uint8Array) {
  return {
    data: [
      raw ? Buffer.from(raw).toString('base64') : '',
      'base64',
    ] as unknown as readonly [string, string],
    executable: false,
    lamports: 1000,
    owner,
    rentEpoch: 1,
  };
}

function detectorWith(batch: unknown, heavenData: unknown = {}) {
  const solanaRpc = {
    getMultipleAccounts: jest.fn().mockResolvedValue(batch),
    getAccountInfo: jest.fn().mockResolvedValue(null),
  };
  mockedAxios.post.mockResolvedValue({ data: heavenData });
  mockedAxios.get.mockResolvedValue({ status: 404, data: null });
  return {
    detector: new LaunchpadDetectorService(solanaRpc as never),
    solanaRpc,
  };
}

describe('LaunchpadDetectorService (ordered strategies, null-safe)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('takes ONLY (chain, address) — market-data independence by signature', () => {
    const { detector } = detectorWith(null);
    expect(detector.detectLaunchpad.length).toBe(2);
  });

  it('pump-fun bonding-curve hit resolves the canonical /coin/ URL', async () => {
    const { detector, solanaRpc } = detectorWith([
      account('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'),
      null,
      null,
      null,
      null,
    ]);
    const res = await detector.detectLaunchpad('solana', CHALE);
    expect(res).toEqual({
      id: 'pump-fun',
      name: 'Pump.fun',
      url: `https://pump.fun/coin/${CHALE}`,
    });
    expect(solanaRpc.getMultipleAccounts).toHaveBeenCalledTimes(1);
    expect(solanaRpc.getMultipleAccounts.mock.calls[0][0]).toHaveLength(5);
  });

  it('ORDER: stonkfun marker beats generic raydium-launchlab', async () => {
    const marker = addressToBytes(STONKFUN_PLATFORM_CONFIGS[0]);
    const poolData = new Uint8Array([...marker, 0, 1, 2, 3]);
    const { detector } = detectorWith([
      null,
      account('LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj', poolData),
      null,
      null,
      null,
    ]);
    const res = await detector.detectLaunchpad('solana', CHALE);
    expect(res?.id).toBe('stonkfun');
    expect(res?.url).toBe(`https://www.stonkfun.xyz/token/${CHALE}`);
  });

  it('generic LaunchLab pool without brand markers collapses correctly', async () => {
    const { detector } = detectorWith([
      null,
      account(
        'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj',
        new Uint8Array([9, 9, 9]),
      ),
      null,
      null,
      null,
    ]);
    const res = await detector.detectLaunchpad('solana', CHALE);
    expect(res?.id).toBe('raydium-launchlab');
  });

  it('ORDER: pump-fun wins over a simultaneous LaunchLab pool', async () => {
    const { detector } = detectorWith([
      account('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'),
      account(
        'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj',
        new Uint8Array([9]),
      ),
      null,
      null,
      null,
    ]);
    const res = await detector.detectLaunchpad('solana', CHALE);
    expect(res?.id).toBe('pump-fun');
  });

  it('moonit curve hit resolves moonit', async () => {
    const { detector } = detectorWith([
      null,
      null,
      null,
      account('MoonCVVNZFSYkqNXP6bxHLPL6QQJiMagDL3qcqUQTrG'),
      null,
    ]);
    const res = await detector.detectLaunchpad('solana', CHALE);
    expect(res?.id).toBe('moonit');
  });

  it('boop bonding_curve hit resolves boop (IDL-verified seeds)', async () => {
    const { detector, solanaRpc } = detectorWith([
      null,
      null,
      null,
      null,
      account('boop8hVGQGqehUK2iVEMEnMrL5RbjywRzHKBmBE7ry4'),
    ]);
    const res = await detector.detectLaunchpad('solana', CHALE);
    expect(res?.id).toBe('boop');
    expect(res?.name).toBe('Boop.fun');
    expect(res?.url).toBe(`https://defined.fi/token/solana/${CHALE}`);
    expect(solanaRpc.getMultipleAccounts.mock.calls[0][0]).toHaveLength(5);
  });

  it('boop no-match (curve absent) falls through to null', async () => {
    const { detector } = detectorWith([null, null, null, null, null]);
    await expect(detector.detectLaunchpad('solana', CHALE)).resolves.toBeNull();
  });

  it('unknown mint (all null) resolves null, never throws', async () => {
    const { detector } = detectorWith([null, null, null, null, null]);
    await expect(detector.detectLaunchpad('solana', CHALE)).resolves.toBeNull();
  });

  it('transport failure resolves null, never throws', async () => {
    const solanaRpc = {
      getMultipleAccounts: jest.fn().mockRejectedValue(new Error('down')),
      getAccountInfo: jest.fn().mockResolvedValue(null),
    };
    mockedAxios.post.mockRejectedValue(new Error('down'));
    const detector = new LaunchpadDetectorService(solanaRpc as never);
    await expect(detector.detectLaunchpad('solana', CHALE)).resolves.toBeNull();
  });

  it('invalid chain and address inputs resolve null', async () => {
    const { detector, solanaRpc } = detectorWith([
      null,
      null,
      null,
      null,
      null,
    ]);
    await expect(detector.detectLaunchpad('tron', CHALE)).resolves.toBeNull();
    await expect(
      detector.detectLaunchpad('solana', 'not-a-mint'),
    ).resolves.toBeNull();
    await expect(detector.detectLaunchpad('', '')).resolves.toBeNull();
    expect(solanaRpc.getMultipleAccounts).not.toHaveBeenCalled();
  });

  it('ORDER: bankr API hit beats a clanker factory receipt', async () => {
    const token = '0x86Cd12345678901234567890123456789012Ab07';
    const solanaRpc = {
      getMultipleAccounts: jest.fn(),
      getAccountInfo: jest.fn(),
    };
    mockedAxios.post.mockResolvedValue({ data: {} });
    mockedAxios.get.mockImplementation(async (url: string) => {
      if (String(url).includes('api.bankr.bot')) {
        return { status: 200, data: { token, fees: '1' } };
      }
      return { status: 404, data: null };
    });
    const detector = new LaunchpadDetectorService(solanaRpc as never);
    const res = await detector.detectLaunchpad('base', token);
    expect(res?.id).toBe('bankr');
    expect(solanaRpc.getMultipleAccounts).not.toHaveBeenCalled();
  });

  it('clanker factory receipt-to resolves clanker on base', async () => {
    const token = '0x1111111111111111111111111111111111111111';
    const solanaRpc = {
      getMultipleAccounts: jest.fn(),
      getAccountInfo: jest.fn(),
    };
    mockedAxios.post.mockImplementation(async (url: string, body?: unknown) => {
      if (String(url).includes('heaven')) return { data: {} };
      const params = (body as { params?: unknown[] })?.params ?? [];
      expect(params[0]).toBe('0xdeadbeef');
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
    const detector = new LaunchpadDetectorService(solanaRpc as never);
    const res = await detector.detectLaunchpad('base', token);
    expect(res).toEqual({
      id: 'clanker',
      name: 'Clanker',
      url: `https://clanker.world/clanker/${token}`,
    });
  });

  it('EVM unknown factory resolves null (official team launches)', async () => {
    const token = '0x9251B3B071C0f64d4F38AdAaf0f5b3D058a87842d';
    const solanaRpc = {
      getMultipleAccounts: jest.fn(),
      getAccountInfo: jest.fn(),
    };
    mockedAxios.post.mockImplementation(async (url: string) => {
      if (String(url).includes('heaven')) return { data: {} };
      return {
        status: 200,
        data: { result: { to: '0x0000000000000000000000000000000000000000' } },
      };
    });
    mockedAxios.get.mockImplementation(async (url: string) => {
      if (String(url).includes('blockscout')) {
        return {
          status: 200,
          data: { result: [{ contractAddress: token, txHash: '0xabc' }] },
        };
      }
      return { status: 404, data: null };
    });
    const detector = new LaunchpadDetectorService(solanaRpc as never);
    await expect(detector.detectLaunchpad('bsc', token)).resolves.toBeNull();
  });

  it('pinksale PYRD (presale-pattern, live shape) resolves null without market data', async () => {
    const pyrd = '0x1c15DEB2469da726AE3dAd11B5B0051F121949a1';
    const solanaRpc = {
      getMultipleAccounts: jest.fn(),
      getAccountInfo: jest.fn(),
    };
    mockedAxios.post.mockImplementation(async (url: string) => {
      if (String(url).includes('heaven')) return { data: {} };
      return {
        status: 200,
        data: {
          result: {
            transactionHash:
              '0x07332d7fab7a3491025656b375ef1206134c6e1834ccf225da1dd1b7752f0585',
            to: null,
            contractAddress: pyrd.toLowerCase(),
            status: '0x1',
          },
        },
      };
    });
    mockedAxios.get.mockImplementation(async (url: string) => {
      if (String(url).includes('blockscout')) {
        return {
          status: 200,
          data: {
            message: 'OK',
            result: [
              {
                blockNumber: '94069323',
                contractAddress: pyrd.toLowerCase(),
                contractCreator: '0xac3ed7b1b178f89f36eaeaa9ae7fe6e485df5e71',
                contractFactory: '',
                txHash:
                  '0x07332d7fab7a3491025656b375ef1206134c6e1834ccf225da1dd1b7752f0585',
              },
            ],
          },
        };
      }
      return { status: 404, data: null };
    });
    const detector = new LaunchpadDetectorService(solanaRpc as never);
    await expect(detector.detectLaunchpad('polygon', pyrd)).resolves.toBeNull();
    expect(solanaRpc.getMultipleAccounts).not.toHaveBeenCalled();
  });

  it('pinksale resolves null when Blockscout knows nothing (negative leg)', async () => {
    const pyrd = '0x1c15DEB2469da726AE3dAd11B5B0051F121949a1';
    const solanaRpc = {
      getMultipleAccounts: jest.fn(),
      getAccountInfo: jest.fn(),
    };
    mockedAxios.post.mockResolvedValue({ data: {} });
    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: { message: 'OK', result: [] },
    });
    const detector = new LaunchpadDetectorService(solanaRpc as never);
    await expect(detector.detectLaunchpad('polygon', pyrd)).resolves.toBeNull();
  });

  it('malformed EVM address resolves null without any HTTP', async () => {
    const solanaRpc = {
      getMultipleAccounts: jest.fn(),
      getAccountInfo: jest.fn(),
    };
    mockedAxios.post.mockResolvedValue({ data: {} });
    mockedAxios.get.mockResolvedValue({ status: 404, data: null });
    const detector = new LaunchpadDetectorService(solanaRpc as never);
    await expect(detector.detectLaunchpad('base', 'nope')).resolves.toBeNull();
    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  describe('pons SSR registry leg (plan todo 26)', () => {
    const STAGEVEIL = '0xcf7f57cd2924d5c34758a3363b0fb237687f3597';

    function ponsPage(title: string, canonical: boolean) {
      return (
        `<html><head><title>${title}</title>` +
        (canonical
          ? `<link rel="canonical" href="https://www.ponsfamily.com/launchpad/${STAGEVEIL}"/>`
          : '') +
        `</head><body/></html>`
      );
    }

    function evmDetector(
      ponsBody: string | null,
      seen: string[] = [],
    ): LaunchpadDetectorService {
      const solanaRpc = {
        getMultipleAccounts: jest.fn(),
        getAccountInfo: jest.fn(),
      };
      mockedAxios.post.mockResolvedValue({ data: {} });
      mockedAxios.get.mockImplementation(async (url: string) => {
        seen.push(String(url));
        if (String(url).includes('ponsfamily.com')) {
          return ponsBody === null
            ? { status: 500, data: null }
            : { status: 200, data: ponsBody };
        }
        return { status: 404, data: null };
      });
      return new LaunchpadDetectorService(solanaRpc as never);
    }

    it('pons match resolves pons without consulting the factory receipt', async () => {
      const seen: string[] = [];
      const detector = evmDetector(
        ponsPage('STAGEVEIL ($SVEIL) · pons', true),
        seen,
      );
      const res = await detector.detectLaunchpad('robinhood', STAGEVEIL);
      expect(res).toEqual({
        id: 'pons',
        name: 'Pons',
        url: `https://ponsfamily.com/launchpad/${STAGEVEIL}`,
      });
      expect(seen.some((url) => url.includes('blockscout'))).toBe(false);
    });

    it('pons no-match (Buy token shell) falls through to null', async () => {
      const detector = evmDetector(ponsPage('Buy token · pons', false));
      await expect(
        detector.detectLaunchpad('robinhood', STAGEVEIL),
      ).resolves.toBeNull();
    });

    it('title-match without canonical fails open to null (redesign guard)', async () => {
      const detector = evmDetector(
        ponsPage('STAGEVEIL ($SVEIL) · pons', false),
      );
      await expect(
        detector.detectLaunchpad('robinhood', STAGEVEIL),
      ).resolves.toBeNull();
    });

    it('flight-data address echo without canonical still resolves null (live dead-page shape)', async () => {
      const echo =
        `<html><head><title>Buy token · pons</title></head>` +
        `<body>{"c":["","launchpad","${STAGEVEIL}"]}</body></html>`;
      const detector = evmDetector(echo);
      await expect(
        detector.detectLaunchpad('robinhood', STAGEVEIL),
      ).resolves.toBeNull();
    });

    it('non-robinhood chains never fetch the pons registry', async () => {
      const seen: string[] = [];
      const detector = evmDetector(
        ponsPage('STAGEVEIL ($SVEIL) · pons', true),
        seen,
      );
      const token = '0x1111111111111111111111111111111111111111';
      await expect(detector.detectLaunchpad('base', token)).resolves.toBeNull();
      expect(seen.some((url) => url.includes('ponsfamily.com'))).toBe(false);
    });

    it('pons transport failure resolves null, never throws', async () => {
      mockedAxios.get.mockRejectedValue(new Error('down'));
      mockedAxios.post.mockResolvedValue({ data: {} });
      const solanaRpc = {
        getMultipleAccounts: jest.fn(),
        getAccountInfo: jest.fn(),
      };
      const detector = new LaunchpadDetectorService(solanaRpc as never);
      await expect(
        detector.detectLaunchpad('robinhood', STAGEVEIL),
      ).resolves.toBeNull();
    });
  });
});
