import axios from 'axios';
import { AlchemyService } from './alchemy.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function rpcResult(result: unknown) {
  return { data: { jsonrpc: '2.0', id: 't', result } };
}

function rpcError(code: number, message: string) {
  return { data: { jsonrpc: '2.0', id: 't', error: { code, message } } };
}

const ALCHEMY_BASE = 'https://base-mainnet.g.alchemy.com/v2/k';
const DRPC_BASE = 'https://lb.drpc.live/base/dk';
const PUBLIC_BASE = 'https://mainnet.base.org';

describe('AlchemyService fallback tiers (todo 24)', () => {
  const savedDrpcKey = process.env.DRPC_API_KEY;

  function service(apiKey = 'k', drpcKey?: string) {
    if (drpcKey === undefined) delete process.env.DRPC_API_KEY;
    else process.env.DRPC_API_KEY = drpcKey;
    return new AlchemyService({ apiKey });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (savedDrpcKey !== undefined) process.env.DRPC_API_KEY = savedDrpcKey;
    else delete process.env.DRPC_API_KEY;
  });

  it('serves from Alchemy first (single call, no fallback traffic)', async () => {
    mockedAxios.post.mockResolvedValueOnce(rpcResult('0x01'));
    const res = await service('k', 'dk').ethCall('base', '0xt', '0xd');
    expect(res).toBe('0x01');
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post.mock.calls[0][0]).toBe(ALCHEMY_BASE);
  });

  it('falls to dRPC when Alchemy is down (order alchemy -> drpc)', async () => {
    mockedAxios.post
      .mockRejectedValueOnce(new Error('alchemy 403'))
      .mockResolvedValueOnce(rpcResult('0x02'));
    const res = await service('k', 'dk').ethCall('base', '0xt', '0xd');
    expect(res).toBe('0x02');
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(mockedAxios.post.mock.calls[0][0]).toBe(ALCHEMY_BASE);
    expect(mockedAxios.post.mock.calls[1][0]).toBe(DRPC_BASE);
  });

  it('falls through JSON-RPC errors, not just transport failures', async () => {
    mockedAxios.post
      .mockResolvedValueOnce(rpcError(-32000, 'over quota'))
      .mockResolvedValueOnce(rpcResult('0x03'));
    const res = await service('k', 'dk').ethCall('base', '0xt', '0xd');
    expect(res).toBe('0x03');
    expect(mockedAxios.post.mock.calls[1][0]).toBe(DRPC_BASE);
  });

  it('falls through null results to the next tier', async () => {
    mockedAxios.post
      .mockResolvedValueOnce(rpcResult(null))
      .mockResolvedValueOnce(rpcResult('0x04'));
    const res = await service('k', 'dk').ethCall('base', '0xt', '0xd');
    expect(res).toBe('0x04');
    expect(mockedAxios.post.mock.calls[1][0]).toBe(DRPC_BASE);
  });

  it('falls to the public tier when Alchemy + dRPC are down', async () => {
    mockedAxios.post
      .mockRejectedValueOnce(new Error('alchemy down'))
      .mockRejectedValueOnce(new Error('drpc down'))
      .mockResolvedValueOnce(rpcResult('0x05'));
    const res = await service('k', 'dk').ethCall('base', '0xt', '0xd');
    expect(res).toBe('0x05');
    expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    expect(mockedAxios.post.mock.calls[2][0]).toBe(PUBLIC_BASE);
  });

  it('skips dRPC with zero dRPC traffic when no key is set', async () => {
    mockedAxios.post
      .mockRejectedValueOnce(new Error('alchemy down'))
      .mockResolvedValueOnce(rpcResult('0x06'));
    const res = await service('k').ethCall('base', '0xt', '0xd');
    expect(res).toBe('0x06');
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    const urls = mockedAxios.post.mock.calls.map((call) => call[0]);
    expect(urls).toEqual([ALCHEMY_BASE, PUBLIC_BASE]);
  });

  it('resolves honest null when every tier is down', async () => {
    mockedAxios.post.mockRejectedValue(new Error('all down'));
    const res = await service('k', 'dk').ethCall('base', '0xt', '0xd');
    expect(res).toBeNull();
    expect(mockedAxios.post).toHaveBeenCalledTimes(3);
  });

  it('routes robinhood through alchemy then dRPC then public (slug live-verified 2026-10-07)', async () => {
    mockedAxios.post
      .mockRejectedValueOnce(new Error('alchemy down'))
      .mockRejectedValueOnce(new Error('drpc down'))
      .mockResolvedValueOnce(rpcResult('0x0707'));
    // dRPC slug for robinhood verified live: tier 2 is dRPC, so the
    // public tier answers third with 3 HTTP calls total.
    const res = await service('k', 'dk').getCode(
      'robinhood',
      '0x968Be0c1A394Bf1cE239E3b40909eC0F9d4f5583',
    );
    expect(res).toBe('0x0707');
    expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    expect(mockedAxios.post.mock.calls[0][0]).toBe(
      'https://robinhood-mainnet.g.alchemy.com/v2/k',
    );
    expect(mockedAxios.post.mock.calls[1][0]).toBe(
      'https://lb.drpc.live/robinhood/dk',
    );
    expect(mockedAxios.post.mock.calls[2][0]).toBe(
      'https://rpc.mainnet.chain.robinhood.com',
    );
  });
});
