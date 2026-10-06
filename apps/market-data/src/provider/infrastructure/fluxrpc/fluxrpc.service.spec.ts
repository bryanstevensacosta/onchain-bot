import { FluxRpcService } from './fluxrpc.service';

describe('FluxRpcService.getAccountInfo (Lane T base64 read)', () => {
  function service() {
    return new FluxRpcService({ apiKey: 'k', rpcUrl: 'https://x.example' });
  }

  it('requests base64 encoding and returns the raw value', async () => {
    const svc = service();
    const value = {
      data: ['aGVsbG8=', 'base64'] as unknown as [string, string],
      executable: false,
      lamports: 1000,
      owner: 'prog1',
      rentEpoch: 1,
    };
    const rpcCall = jest
      .spyOn(svc, 'rpcCall')
      .mockResolvedValue({ context: { slot: 1 }, value });
    const res = await svc.getAccountInfo('addr1');
    expect(res).toEqual(value);
    expect(rpcCall).toHaveBeenCalledWith('getAccountInfo', [
      'addr1',
      { encoding: 'base64', commitment: 'confirmed' },
    ]);
  });

  it('resolves null for missing accounts (never throws)', async () => {
    const svc = service();
    jest
      .spyOn(svc, 'rpcCall')
      .mockResolvedValue({ context: { slot: 1 }, value: null });
    await expect(svc.getAccountInfo('addr-missing')).resolves.toBeNull();
  });

  it('leaves the jsonParsed getMultipleAccounts untouched', async () => {
    const svc = service();
    const rpcCall = jest.spyOn(svc, 'rpcCall').mockResolvedValue('raw');
    await svc.getMultipleAccounts(['a', 'b']);
    expect(rpcCall).toHaveBeenCalledWith('getMultipleAccounts', [
      ['a', 'b'],
      { encoding: 'jsonParsed' },
    ]);
  });
});
