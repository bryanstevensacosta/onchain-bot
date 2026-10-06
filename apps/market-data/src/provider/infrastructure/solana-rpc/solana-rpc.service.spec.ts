import axios from 'axios';
import { SolanaRpcService } from './solana-rpc.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function rpcResult(value: unknown) {
  return { data: { jsonrpc: '2.0', id: 'solana-rpc', result: value } };
}

function account(owner: string) {
  return {
    data: ['', 'base58'],
    executable: false,
    lamports: 1000,
    owner,
    rentEpoch: 1,
  };
}

describe('SolanaRpcService.getMultipleAccounts (batch PDA reads)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function service(primaryRpcUrl?: string) {
    return new SolanaRpcService({ primaryRpcUrl });
  }

  it('returns one entry per address in order, null for missing accounts', async () => {
    mockedAxios.post.mockResolvedValueOnce(
      rpcResult({
        context: { slot: 1 },
        value: [account('prog1'), null, account('prog3')],
      }),
    );
    const res = await service('https://primary.example').getMultipleAccounts([
      'A',
      'B',
      'C',
    ]);
    expect(res).toHaveLength(3);
    expect(res?.[0]).toMatchObject({ owner: 'prog1' });
    expect(res?.[1]).toBeNull();
    expect(res?.[2]).toMatchObject({ owner: 'prog3' });
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const [, body] = mockedAxios.post.mock.calls[0];
    expect(body).toMatchObject({
      method: 'getMultipleAccounts',
      params: [['A', 'B', 'C'], { encoding: 'base64' }],
    });
  });

  it('returns [] without any HTTP call for empty input', async () => {
    const res = await service().getMultipleAccounts([]);
    expect(res).toEqual([]);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('falls back to the public RPC when the primary transport fails', async () => {
    mockedAxios.post
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(
        rpcResult({ context: { slot: 2 }, value: [null] }),
      );
    const res = await service('https://primary.example').getMultipleAccounts([
      'A',
    ]);
    expect(res).toEqual([null]);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(mockedAxios.post.mock.calls[1][0]).toBe(
      'https://api.mainnet.solana.com',
    );
  });

  it('resolves per-address nulls (never whole-batch null) when every URL fails', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'));
    const res = await service().getMultipleAccounts(['A', 'B']);
    expect(res).toEqual([null, null]);
  });

  it('skips a non-array value and tries the next URL', async () => {
    mockedAxios.post
      .mockResolvedValueOnce(rpcResult({ context: { slot: 3 } }))
      .mockResolvedValueOnce(
        rpcResult({ context: { slot: 3 }, value: [account('p')] }),
      );
    const res = await service('https://primary.example').getMultipleAccounts([
      'A',
    ]);
    expect(res).toHaveLength(1);
    expect(res?.[0]).toMatchObject({ owner: 'p' });
  });

  it('chunks 150 addresses into 2 parallel RPC calls (Lane T chunking)', async () => {
    const addrs = Array.from({ length: 150 }, (_, i) => `addr-${i}`);
    mockedAxios.post.mockImplementation((_url, body) => {
      const params = (body as { params: [string[]] }).params;
      const chunk = params[0];
      return Promise.resolve(
        rpcResult({
          context: { slot: 9 },
          value: chunk.map(() => null),
        }),
      );
    });
    const res = await service('https://primary.example').getMultiple(addrs);
    expect(res).toHaveLength(150);
    expect(res.every((v) => v === null)).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    const firstChunk = (
      mockedAxios.post.mock.calls[0][1] as { params: [string[]] }
    ).params[0];
    const secondChunk = (
      mockedAxios.post.mock.calls[1][1] as { params: [string[]] }
    ).params[0];
    expect(firstChunk).toHaveLength(100);
    expect(secondChunk).toHaveLength(50);
    expect([...firstChunk, ...secondChunk]).toEqual(addrs);
  });

  it('fail-open per chunk: a dead chunk resolves nulls without failing the batch', async () => {
    const addrs = Array.from({ length: 120 }, (_, i) => `addr-${i}`);
    mockedAxios.post.mockImplementation((url, body) => {
      const params = (body as { params: [string[]] }).params;
      const chunk = params[0];
      if (url === 'https://primary.example' && chunk[0] === 'addr-0') {
        return Promise.reject(new Error('chunk-0 primary down'));
      }
      if (url === 'https://api.mainnet.solana.com' && chunk[0] === 'addr-0') {
        return Promise.reject(new Error('chunk-0 fallback down'));
      }
      return Promise.resolve(
        rpcResult({
          context: { slot: 9 },
          value: chunk.map(() => account('alive')),
        }),
      );
    });
    const res = await service('https://primary.example').getMultiple(addrs);
    expect(res).toHaveLength(120);
    expect(res.slice(0, 100).every((v) => v === null)).toBe(true);
    expect(res.slice(100).every((v) => v !== null && v.owner === 'alive')).toBe(
      true,
    );
  });

  it('getMultiple is the frozen BatchAccountsClient alias of getMultipleAccounts', async () => {
    mockedAxios.post.mockResolvedValueOnce(
      rpcResult({ context: { slot: 1 }, value: [account('prog1')] }),
    );
    const svc = service('https://primary.example');
    const res = await svc.getMultiple(['A']);
    expect(res).toHaveLength(1);
    expect(res?.[0]).toMatchObject({ owner: 'prog1' });
  });
});
