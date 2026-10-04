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

  it('returns null when every URL fails (whole-batch miss)', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'));
    const res = await service().getMultipleAccounts(['A', 'B']);
    expect(res).toBeNull();
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
});
