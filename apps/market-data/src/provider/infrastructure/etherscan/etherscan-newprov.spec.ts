import axios from 'axios';
import {
  ETHERSCAN_SUPPORTED_CHAINS,
  EtherscanService,
  resolveEtherscanChainId,
} from './etherscan.service';

/**
 * New providers (dexter plan todo 32): Etherscan V2 keyed legs.
 *
 * Fixtures follow the V2 envelope `{ status, message, result }`
 * (https://docs.etherscan.io/endpoint-overview); the keyless NOTOK
 * shape (`status 0 / 'Missing/Invalid API Key'`) was pinned live
 * 2026-10-09 (evidence `.omo/evidence/task-fe-newprov.log`). No owner
 * key exists, so every live assertion here is mock-level by design
 * (4663 gate = `wontfix-documentado`).
 */
const TOKEN = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

function keyless(): EtherscanService {
  return new EtherscanService({ apiKey: '' });
}

function keyed(): EtherscanService {
  return new EtherscanService({ apiKey: 'test-key-never-a-real-key' });
}

describe('Etherscan V2 (todo 32: holders/supply/verified, skip-if-absent)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('maps EVM chainids incl. 4663, refuses solana (non-EVM)', () => {
    expect(resolveEtherscanChainId('ethereum')).toBe(1);
    expect(resolveEtherscanChainId('unichain')).toBe(130);
    expect(resolveEtherscanChainId('robinhood')).toBe(4663);
    expect(resolveEtherscanChainId('solana')).toBeNull();
  });

  it('queries only STATIC-catalog chains', () => {
    expect([...ETHERSCAN_SUPPORTED_CHAINS]).toEqual([
      'ethereum',
      'bsc',
      'base',
      'arbitrum',
      'polygon',
      'robinhood',
    ]);
  });

  it('skips zero-network without a key (DEFAULT state, never 401-crashes)', async () => {
    const svc = keyless();
    const spy = jest.spyOn(axios, 'get');
    await expect(
      svc.getTokenHolderCount('ethereum', TOKEN),
    ).resolves.toBeNull();
    await expect(svc.getTokenSupplyRaw('ethereum', TOKEN)).resolves.toBeNull();
    await expect(svc.isContractVerified('ethereum', TOKEN)).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('getTokenHolderCount pins action=tokenholdercount + chainid (live shape)', async () => {
    const svc = keyed();
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: { status: '1', message: 'OK', result: '12345' },
    });
    await expect(svc.getTokenHolderCount('ethereum', TOKEN)).resolves.toBe(
      12345,
    );
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('api.etherscan.io/v2/api'),
      expect.objectContaining({
        params: expect.objectContaining({
          chainid: 1,
          module: 'token',
          action: 'tokenholdercount',
          contractaddress: TOKEN,
        }),
      }),
    );
  });

  it('getTokenSupplyRaw pins action=tokensupply and keeps raw units (never UI-mapped)', async () => {
    const svc = keyed();
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: { status: '1', message: 'OK', result: '126876345678901234567890' },
    });
    await expect(svc.getTokenSupplyRaw('ethereum', TOKEN)).resolves.toBe(
      '126876345678901234567890',
    );
  });

  it('isContractVerified pins action=getsourcecode (free on all chains)', async () => {
    const svc = keyed();
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        status: '1',
        message: 'OK',
        result: [{ SourceCode: 'pragma solidity ^0.8.0;', ABI: '[]' }],
      },
    });
    await expect(svc.isContractVerified('base', TOKEN)).resolves.toBe(true);
    expect(spy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        params: expect.objectContaining({
          chainid: 8453,
          module: 'contract',
          action: 'getsourcecode',
        }),
      }),
    );
    jest.restoreAllMocks();
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        status: '1',
        message: 'OK',
        result: [{ SourceCode: '', ABI: 'Contract source code not verified' }],
      },
    });
    await expect(svc.isContractVerified('base', TOKEN)).resolves.toBe(false);
  });

  it('collapses NOTOK envelopes to null (key/tier rejections are fail-open)', async () => {
    const svc = keyed();
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        status: '0',
        message: 'NOTOK',
        result: 'Missing/Invalid API Key',
      },
    });
    await expect(
      svc.getTokenHolderCount('ethereum', TOKEN),
    ).resolves.toBeNull();
    await expect(svc.getTokenSupplyRaw('ethereum', TOKEN)).resolves.toBeNull();
    await expect(svc.isContractVerified('ethereum', TOKEN)).resolves.toBeNull();
  });

  it('propagates retryable errors to the 19b2 wrapper (429-with-Retry-After)', async () => {
    const svc = keyed();
    jest.spyOn(axios, 'get').mockRejectedValue({
      response: { status: 429, headers: { 'retry-after': '1' } },
      code: 'ERR_BAD_REQUEST',
    });
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);
    await expect(svc.getTokenHolderCount('ethereum', TOKEN)).rejects.toThrow();
  });
});
