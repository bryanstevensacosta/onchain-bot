import axios from 'axios';
import { AlchemyService } from './alchemy.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function rpcResult(result: unknown) {
  return { data: { jsonrpc: '2.0', id: 'alc-1', result } };
}

describe('AlchemyService multi-chain transport (Lane T)', () => {
  const savedDrpcKey = process.env.DRPC_API_KEY;
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DRPC_API_KEY;
  });
  afterAll(() => {
    if (savedDrpcKey !== undefined) process.env.DRPC_API_KEY = savedDrpcKey;
  });

  function service() {
    return new AlchemyService({ apiKey: 'test-key' });
  }

  it('keeps the legacy single-arg getCode on eth-mainnet (backend prober contract)', async () => {
    mockedAxios.post.mockResolvedValueOnce(rpcResult('0x60806040'));
    const res = await service().getCode('0xabc');
    expect(res).toBe('0x60806040');
    expect(mockedAxios.post.mock.calls[0][0]).toBe(
      'https://eth-mainnet.g.alchemy.com/v2/test-key',
    );
    expect(mockedAxios.post.mock.calls[0][1]).toMatchObject({
      method: 'eth_getCode',
      params: ['0xabc', 'latest'],
    });
  });

  it('routes getCode(chain, address) per chain', async () => {
    mockedAxios.post.mockResolvedValueOnce(rpcResult('0x'));
    const res = await service().getCode('base', '0xabc');
    expect(res).toBe('0x');
    expect(mockedAxios.post.mock.calls[0][0]).toBe(
      'https://base-mainnet.g.alchemy.com/v2/test-key',
    );
  });

  it('exposes getTransactionCount per chain (hex nonce)', async () => {
    mockedAxios.post.mockResolvedValueOnce(rpcResult('0x3'));
    const res = await service().getTransactionCount('arbitrum', '0xabc');
    expect(res).toBe('0x3');
    expect(mockedAxios.post.mock.calls[0][0]).toBe(
      'https://arb-mainnet.g.alchemy.com/v2/test-key',
    );
    expect(mockedAxios.post.mock.calls[0][1]).toMatchObject({
      method: 'eth_getTransactionCount',
      params: ['0xabc', 'latest'],
    });
  });

  it('exposes raw ethCall(chain, to, data) per chain', async () => {
    mockedAxios.post.mockResolvedValueOnce(rpcResult('0x01'));
    const res = await service().ethCall('bsc', '0xtarget', '0xdead');
    expect(res).toBe('0x01');
    expect(mockedAxios.post.mock.calls[0][0]).toBe(
      'https://bnb-mainnet.g.alchemy.com/v2/test-key',
    );
    expect(mockedAxios.post.mock.calls[0][1]).toMatchObject({
      method: 'eth_call',
      params: [{ to: '0xtarget', data: '0xdead' }, 'latest'],
    });
  });

  it('forwards AbortSignal so timeouts cancel in-flight HTTP', async () => {
    mockedAxios.post.mockResolvedValueOnce(rpcResult('0x01'));
    const controller = new AbortController();
    await service().ethCall('base', '0xt', '0xd', 'latest', {
      signal: controller.signal,
    });
    const config = mockedAxios.post.mock.calls[0][2] as {
      signal?: AbortSignal;
    };
    expect(config.signal).toBe(controller.signal);
  });

  it('routes robinhood via its verified row (todo 24)', async () => {
    mockedAxios.post.mockResolvedValueOnce(rpcResult('0x1234'));
    const res = await service().getCode('robinhood', '0xabc');
    expect(res).toBe('0x1234');
    expect(mockedAxios.post.mock.calls[0][0]).toBe(
      'https://robinhood-mainnet.g.alchemy.com/v2/test-key',
    );
  });

  it('resolves null with zero HTTP on chains no tier covers (solana)', async () => {
    const svc = service();
    await expect(svc.getCode('solana', '0xabc')).resolves.toBeNull();
    await expect(
      svc.getTransactionCount('solana', '0xabc'),
    ).resolves.toBeNull();
    await expect(svc.ethCall('solana', '0xt', '0xd')).resolves.toBeNull();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('falls to the public tier without an Alchemy key (keyless alchemy skips tier 1)', async () => {
    const keyless = new AlchemyService({ apiKey: '' });
    mockedAxios.post.mockResolvedValueOnce(rpcResult('0x'));
    await expect(keyless.getCode('base', '0xabc')).resolves.toBe('0x');
    expect(mockedAxios.post.mock.calls[0][0]).toBe('https://mainnet.base.org');
  });

  it('collapses JSON-RPC errors to null (fail-open)', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        jsonrpc: '2.0',
        id: 'alc-1',
        error: { code: -32000, message: 'boom' },
      },
    });
    await expect(service().getCode('base', '0xabc')).resolves.toBeNull();
  });
});
