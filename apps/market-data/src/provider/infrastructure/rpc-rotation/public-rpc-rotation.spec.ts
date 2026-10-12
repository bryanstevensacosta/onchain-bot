import axios from 'axios';
import { Logger } from '@nestjs/common';
import { AlchemyService } from '../alchemy/alchemy.service';
import { SolanaRpcService } from '../solana-rpc/solana-rpc.service';
import { PUBLIC_EVM_RPC_URLS } from '../alchemy/alchemy.chains';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function evmResult(result: unknown) {
  return { data: { jsonrpc: '2.0', id: 't', result } };
}

function solanaResult(value: unknown) {
  return {
    data: {
      jsonrpc: '2.0',
      id: 'solana-rpc',
      result: { context: { slot: 1 }, value },
    },
  };
}

function axios429() {
  (mockedAxios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
  return Object.assign(new Error('Request failed with status code 429'), {
    isAxiosError: true,
    response: { status: 429 },
  });
}

describe('public-RPC rotation (dexter plan todo 42)', () => {
  const savedDrpc = process.env.DRPC_API_KEY;
  const savedChainstack = process.env.CHAINSTACK_API_KEY;
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DRPC_API_KEY;
    delete process.env.CHAINSTACK_API_KEY;
    (mockedAxios.isAxiosError as unknown as jest.Mock).mockReturnValue(false);
    debugSpy = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    debugSpy.mockRestore();
  });

  afterAll(() => {
    if (savedDrpc !== undefined) process.env.DRPC_API_KEY = savedDrpc;
    else delete process.env.DRPC_API_KEY;
    if (savedChainstack !== undefined)
      process.env.CHAINSTACK_API_KEY = savedChainstack;
    else delete process.env.CHAINSTACK_API_KEY;
  });

  it('lists 2-4 verified-live endpoints per chain (1 for robinhood, single-endpoint documented)', () => {
    for (const [chain, urls] of Object.entries(PUBLIC_EVM_RPC_URLS)) {
      if (chain === 'robinhood') {
        expect(urls).toHaveLength(1);
      } else {
        expect(urls.length).toBeGreaterThanOrEqual(2);
        expect(urls.length).toBeLessThanOrEqual(4);
      }
    }
  });

  it('EVM: keyed tiers keep order, public rotates on consecutive calls', async () => {
    const svc = new AlchemyService({ apiKey: '' });
    mockedAxios.post
      .mockResolvedValueOnce(evmResult('0x01'))
      .mockResolvedValueOnce(evmResult('0x02'));
    await svc.ethCall('base', '0xt', '0xd');
    await svc.ethCall('base', '0xt', '0xd');
    const urls = mockedAxios.post.mock.calls.map((call) => String(call[0]));
    // Round-robin: consecutive public-leg calls start on different
    // endpoints (exact sibling varies with score-vs-cursor order).
    expect(urls[0]).toBe('https://mainnet.base.org');
    expect(urls[1]).not.toBe(urls[0]);
    expect(PUBLIC_EVM_RPC_URLS['base']).toContain(urls[1]);
  });

  it('EVM: second failure goes to another endpoint (failover within the tier)', async () => {
    const svc = new AlchemyService({ apiKey: '' });
    mockedAxios.post
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce(evmResult('0x03'));
    const res = await svc.ethCall('base', '0xt', '0xd');
    expect(res).toBe('0x03');
    const urls = mockedAxios.post.mock.calls.map((call) => String(call[0]));
    expect(urls).toEqual([
      'https://mainnet.base.org',
      'https://base.publicnode.com',
    ]);
  });

  it('EVM: 429 parks the endpoint (zero traffic) with a served-by host label + enter-note, then re-admits', async () => {
    const svc = new AlchemyService({ apiKey: '' });
    mockedAxios.post
      .mockRejectedValueOnce(axios429())
      .mockResolvedValueOnce(evmResult('0x04'));
    const res = await svc.ethCall('base', '0xt', '0xd');
    expect(res).toBe('0x04');
    // Parked endpoint skipped on the next call (zero traffic to it —
    // the sibling served instead, whichever scores first).
    mockedAxios.post.mockResolvedValueOnce(evmResult('0x05'));
    await svc.ethCall('base', '0xt', '0xd');
    const urls = mockedAxios.post.mock.calls.map((call) => String(call[0]));
    expect(urls[2]).not.toBe('https://mainnet.base.org');
    const lines = debugSpy.mock.calls.map((call) => String(call[0]));
    expect(
      lines.some((line) =>
        line.includes('served-by=public:base.publicnode.com'),
      ),
    ).toBe(true);
    const notes = svc.drainRotationNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].key).toBe('public-rotation:mainnet.base.org');
    expect(notes[0].value).toMatch(/backoff enter/);
    expect(notes[0].value).toMatch(/429/);
    expect(svc.drainRotationNotes()).toEqual([]);
  });

  it('EVM: keyed order alchemy -> public intact (no keyed reordering)', async () => {
    const svc = new AlchemyService({ apiKey: 'k' });
    mockedAxios.post
      .mockRejectedValueOnce(new Error('alchemy down'))
      .mockResolvedValueOnce(evmResult('0x06'));
    const res = await svc.ethCall('ethereum', '0xt', '0xd');
    expect(res).toBe('0x06');
    const urls = mockedAxios.post.mock.calls.map((call) => String(call[0]));
    expect(urls).toEqual([
      'https://eth-mainnet.g.alchemy.com/v2/k',
      'https://ethereum.publicnode.com',
    ]);
  });

  it('Solana: public leg rotates with served-by=public:<host>', async () => {
    const svc = new SolanaRpcService({});
    mockedAxios.post
      .mockResolvedValueOnce(solanaResult([{ supply: 1 }]))
      .mockResolvedValueOnce(solanaResult([{ supply: 2 }]));
    await svc.getTokenSupply('MINT');
    await svc.getTokenSupply('MINT');
    const urls = mockedAxios.post.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toBe('https://api.mainnet.solana.com');
    expect(urls[1]).not.toBe(urls[0]);
    const lines = debugSpy.mock.calls.map((call) => String(call[0]));
    expect(
      lines.some((line) =>
        line.includes('served-by=public:api.mainnet.solana.com'),
      ),
    ).toBe(true);
  });

  it('Solana: 429 parks with enter-note, exit-note on re-admit', async () => {
    const svc = new SolanaRpcService({});
    mockedAxios.post
      .mockRejectedValueOnce(axios429())
      .mockResolvedValueOnce(solanaResult([{ supply: 1 }]))
      .mockResolvedValueOnce(solanaResult([{ supply: 2 }]));
    await svc.getTokenSupply('MINT');
    await svc.getTokenSupply('MINT');
    const urls = mockedAxios.post.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toBe('https://api.mainnet.solana.com');
    expect(urls[1]).toBe('https://api.mainnet-beta.solana.com');
    // Third call skips the parked endpoint (zero traffic to it).
    expect(urls[2]).not.toBe('https://api.mainnet.solana.com');
    const notes = svc.drainRotationNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].key).toBe('public-rotation:api.mainnet.solana.com');
    expect(notes[0].value).toMatch(/backoff enter/);
  });

  it('QPS-math: worst-case public fan-out is bounded by the list length', async () => {
    process.env.DRPC_API_KEY = 'dk';
    const keyed = new AlchemyService({ apiKey: 'k' });
    mockedAxios.post.mockRejectedValue(new Error('all down'));
    await expect(keyed.ethCall('polygon', '0xt', '0xd')).resolves.toBeNull();
    // alchemy + dRPC + every listed polygon endpoint exactly once.
    const expected = 2 + PUBLIC_EVM_RPC_URLS['polygon'].length;
    expect(mockedAxios.post).toHaveBeenCalledTimes(expected);
  });
});
