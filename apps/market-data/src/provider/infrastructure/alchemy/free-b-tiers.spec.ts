import axios from 'axios';
import {
  CHAINSTACK_EVM_HOSTS,
  FREEB_QPS_REFERENCE,
  chainstackEvmRpcUrl,
  chainstackSolanaRpcUrl,
  freeBCallsForColdExplicitChainSnapshot,
  isChainstackChainAllowed,
  isFreeBTierSkippedMethod,
  parseChainstackChains,
  shyftSolanaRpcUrl,
} from './alchemy.chains';
import { AlchemyService } from './alchemy.service';
import { SolanaRpcService } from '../solana-rpc/solana-rpc.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function rpcResult(result: unknown) {
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
describe('free-B providers (dexter plan todo 30a)', () => {
  const savedDrpc = process.env.DRPC_API_KEY;
  const savedChainstack = process.env.CHAINSTACK_API_KEY;
  const savedChains = process.env.CHAINSTACK_CHAINS;

  function evmService(
    apiKey = 'k',
    drpcKey?: string,
    chainstackKey?: string,
    chainstackChains?: string,
  ) {
    if (drpcKey === undefined) delete process.env.DRPC_API_KEY;
    else process.env.DRPC_API_KEY = drpcKey;
    if (chainstackKey === undefined) delete process.env.CHAINSTACK_API_KEY;
    else process.env.CHAINSTACK_API_KEY = chainstackKey;
    if (chainstackChains === undefined) delete process.env.CHAINSTACK_CHAINS;
    else process.env.CHAINSTACK_CHAINS = chainstackChains;
    return new AlchemyService({ apiKey });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (savedDrpc !== undefined) process.env.DRPC_API_KEY = savedDrpc;
    else delete process.env.DRPC_API_KEY;
    if (savedChainstack !== undefined)
      process.env.CHAINSTACK_API_KEY = savedChainstack;
    else delete process.env.CHAINSTACK_API_KEY;
    if (savedChains !== undefined) process.env.CHAINSTACK_CHAINS = savedChains;
    else delete process.env.CHAINSTACK_CHAINS;
  });

  it('pins the Chainstack EVM host matrix (doc-proven + *-extrapolated, no robinhood row)', () => {
    expect(CHAINSTACK_EVM_HOSTS['ethereum']).toBe('ethereum-mainnet');
    expect(CHAINSTACK_EVM_HOSTS['base']).toBe('base-mainnet');
    expect(CHAINSTACK_EVM_HOSTS['robinhood']).toBeUndefined();
    expect(chainstackEvmRpcUrl('base', 'ck')).toBe(
      'https://base-mainnet.core.chainstack.com/ck',
    );
    expect(chainstackEvmRpcUrl('robinhood', 'ck')).toBeNull();
    expect(chainstackEvmRpcUrl('solana', 'ck')).toBeNull();
  });

  it('builds the Solana free-B URLs (Shyft query-key + Chainstack path-key)', () => {
    expect(shyftSolanaRpcUrl('sk')).toBe('https://rpc.shyft.to/?api_key=sk');
    expect(chainstackSolanaRpcUrl('ck')).toBe(
      'https://solana-mainnet.core.chainstack.com/ck',
    );
  });

  it('carves index/holders legs off free tiers (Shyft Index 0/s, holders excluded)', () => {
    expect(isFreeBTierSkippedMethod('getTokenLargestAccounts')).toBe(true);
    expect(isFreeBTierSkippedMethod('getProgramAccounts')).toBe(true);
    expect(isFreeBTierSkippedMethod('getMultipleAccounts')).toBe(false);
    expect(isFreeBTierSkippedMethod('getTokenSupply')).toBe(false);
    expect(isFreeBTierSkippedMethod('getAccountInfo')).toBe(false);
  });

  it('exports NO Moralis node builder (wontfix-documented, probe-or-delete closed)', () => {
    expect(
      jest.requireActual('./alchemy.chains')['moralisNodesRpcUrl'],
    ).toBeUndefined();
  });

  it('orders EVM tiers alchemy -> drpc -> chainstack -> public', async () => {
    mockedAxios.post
      .mockRejectedValueOnce(new Error('alchemy down'))
      .mockRejectedValueOnce(new Error('drpc down'))
      .mockRejectedValueOnce(new Error('chainstack down'))
      .mockResolvedValueOnce(rpcResult('0x09'));
    const res = await evmService('k', 'dk', 'ck').ethCall('base', '0xt', '0xd');
    expect(res).toBe('0x09');
    expect(mockedAxios.post).toHaveBeenCalledTimes(4);
    const urls = mockedAxios.post.mock.calls.map((c) => c[0]);
    expect(urls).toEqual([
      'https://base-mainnet.g.alchemy.com/v2/k',
      'https://lb.drpc.live/base/dk',
      'https://base-mainnet.core.chainstack.com/ck',
      'https://mainnet.base.org',
    ]);
  });

  it('skips the Chainstack tier with zero traffic when no key is set (dRPC-copy)', async () => {
    mockedAxios.post
      .mockRejectedValueOnce(new Error('alchemy down'))
      .mockResolvedValueOnce(rpcResult('0x0a'));
    const res = await evmService('k', 'dk').ethCall('base', '0xt', '0xd');
    expect(res).toBe('0x0a');
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    const urls = mockedAxios.post.mock.calls.map((c) => c[0]);
    expect(urls).toEqual([
      'https://base-mainnet.g.alchemy.com/v2/k',
      'https://lb.drpc.live/base/dk',
    ]);
    expect(urls.some((u) => String(u).includes('core.chainstack.com'))).toBe(
      false,
    );
  });

  it('skips Chainstack for robinhood (no host row — alchemy -> drpc -> public)', async () => {
    mockedAxios.post
      .mockRejectedValueOnce(new Error('alchemy down'))
      .mockRejectedValueOnce(new Error('drpc down'))
      .mockResolvedValueOnce(rpcResult('0x0b'));
    const res = await evmService('k', 'dk', 'ck').getCode(
      'robinhood',
      '0x968Be0c1A394Bf1cE239E3b40909eC0F9d4f5583',
    );
    expect(res).toBe('0x0b');
    expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    const urls = mockedAxios.post.mock.calls.map((c) => c[0]);
    expect(urls[0]).toBe('https://robinhood-mainnet.g.alchemy.com/v2/k');
    expect(urls[1]).toBe('https://lb.drpc.live/robinhood/dk');
    expect(urls[2]).toBe('https://rpc.mainnet.chain.robinhood.com');
  });

  it('routes Solana primary -> shyft -> chainstack -> public as {name,url} tiers', async () => {
    mockedAxios.post
      .mockRejectedValueOnce(new Error('primary down'))
      .mockRejectedValueOnce(new Error('shyft down'))
      .mockResolvedValueOnce(solanaResult([null]));
    const svc = new SolanaRpcService({
      primaryRpcUrl: 'https://primary.example',
      shyftApiKey: 'sk',
      chainstackApiKey: 'ck',
    });
    const res = await svc.getMultipleAccounts(['A']);
    expect(res).toEqual([null]);
    expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    const urls = mockedAxios.post.mock.calls.map((c) => c[0]);
    expect(urls).toEqual([
      'https://primary.example',
      'https://rpc.shyft.to/?api_key=sk',
      'https://solana-mainnet.core.chainstack.com/ck',
    ]);
  });

  it('carves holders off free tiers (primary -> public, shyft/chainstack untouched)', async () => {
    mockedAxios.post
      .mockRejectedValueOnce(new Error('primary down'))
      .mockResolvedValueOnce(solanaResult([]));
    const svc = new SolanaRpcService({
      primaryRpcUrl: 'https://primary.example',
      shyftApiKey: 'sk',
      chainstackApiKey: 'ck',
    });
    const res = await svc.getTokenLargestAccounts('MINT');
    expect(res).toEqual([]);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    const urls = mockedAxios.post.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual([
      'https://primary.example',
      'https://api.mainnet.solana.com',
    ]);
  });

  it('QPS-math as test: cold explicit-chain snapshot fits free-tier budgets (bare-sweep multiplier noted)', () => {
    const solana = freeBCallsForColdExplicitChainSnapshot('solana');
    const evm = freeBCallsForColdExplicitChainSnapshot('evm');
    expect(solana).toBe(
      FREEB_QPS_REFERENCE.solanaRpcLegs *
        FREEB_QPS_REFERENCE.retryMultiplierMax,
    );
    expect(evm).toBe(
      FREEB_QPS_REFERENCE.evmRpcLegsPerScan *
        FREEB_QPS_REFERENCE.retryMultiplierMax,
    );
    expect(solana <= FREEB_QPS_REFERENCE.shyftRpcRps).toBe(true);
    expect(solana <= FREEB_QPS_REFERENCE.chainstackSolanaRps).toBe(true);
    expect(FREEB_QPS_REFERENCE.shyftIndexRps).toBe(0);
  });

  it('parses CHAINSTACK_CHAINS tolerantly (trim, lowercase, ignore empties)', () => {
    expect(parseChainstackChains(undefined)).toBeNull();
    expect(parseChainstackChains('')).toBeNull();
    expect(parseChainstackChains('  ,,  ')).toBeNull();
    expect(parseChainstackChains('Solana')).toEqual(new Set(['solana']));
    expect(parseChainstackChains(' base ,,ETHEREUM, ')).toEqual(
      new Set(['base', 'ethereum']),
    );
  });

  it('defaults off: unset allowlist serves every Chainstack row', () => {
    expect(isChainstackChainAllowed('base', null)).toBe(true);
    expect(isChainstackChainAllowed('solana', null)).toBe(true);
    expect(isChainstackChainAllowed('base', undefined)).toBe(true);
    expect(
      isChainstackChainAllowed('base', parseChainstackChains(undefined)),
    ).toBe(true);
  });

  it('ignores malformed entries (empties/case/whitespace never allowlist)', () => {
    const allowlist = parseChainstackChains(' , , BASE ,,  ,');
    expect(allowlist).toEqual(new Set(['base']));
    expect(isChainstackChainAllowed('base', allowlist)).toBe(true);
    expect(isChainstackChainAllowed('BASE', allowlist)).toBe(true);
    expect(isChainstackChainAllowed(' ethereum ', allowlist)).toBe(false);
    expect(isChainstackChainAllowed('', allowlist)).toBe(false);
  });

  it('EVM allowlist honored: unlisted chain skips Chainstack with zero network (spy)', async () => {
    mockedAxios.post
      .mockRejectedValueOnce(new Error('alchemy down'))
      .mockRejectedValueOnce(new Error('drpc down'))
      .mockResolvedValueOnce(rpcResult('0x0c'));
    const res = await evmService('k', 'dk', 'ck', 'solana').ethCall(
      'base',
      '0xt',
      '0xd',
    );
    expect(res).toBe('0x0c');
    expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    const urls = mockedAxios.post.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual([
      'https://base-mainnet.g.alchemy.com/v2/k',
      'https://lb.drpc.live/base/dk',
      'https://mainnet.base.org',
    ]);
    expect(urls.some((u) => u.includes('core.chainstack.com'))).toBe(false);
  });

  it('EVM allowlist honored: listed chain still serves Chainstack (spy)', async () => {
    mockedAxios.post
      .mockRejectedValueOnce(new Error('alchemy down'))
      .mockRejectedValueOnce(new Error('drpc down'))
      .mockRejectedValueOnce(new Error('chainstack down'))
      .mockResolvedValueOnce(rpcResult('0x0d'));
    const res = await evmService('k', 'dk', 'ck', 'Base').ethCall(
      'base',
      '0xt',
      '0xd',
    );
    expect(res).toBe('0x0d');
    expect(mockedAxios.post).toHaveBeenCalledTimes(4);
    const urls = mockedAxios.post.mock.calls.map((c) => String(c[0]));
    expect(urls[2]).toBe('https://base-mainnet.core.chainstack.com/ck');
  });

  it('Solana allowlist honored: unlisted solana skips Chainstack with zero network (spy)', async () => {
    mockedAxios.post
      .mockRejectedValueOnce(new Error('primary down'))
      .mockRejectedValueOnce(new Error('shyft down'))
      .mockResolvedValueOnce(solanaResult([null]));
    const svc = new SolanaRpcService({
      primaryRpcUrl: 'https://primary.example',
      shyftApiKey: 'sk',
      chainstackApiKey: 'ck',
      chainstackChains: 'base,ethereum',
    });
    const res = await svc.getMultipleAccounts(['A']);
    expect(res).toEqual([null]);
    expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    const urls = mockedAxios.post.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual([
      'https://primary.example',
      'https://rpc.shyft.to/?api_key=sk',
      'https://api.mainnet.solana.com',
    ]);
    expect(urls.some((u) => u.includes('core.chainstack.com'))).toBe(false);
  });

  it('Solana allowlist honored: listed solana still serves Chainstack (spy)', async () => {
    mockedAxios.post
      .mockRejectedValueOnce(new Error('primary down'))
      .mockRejectedValueOnce(new Error('shyft down'))
      .mockResolvedValueOnce(solanaResult([null]));
    const svc = new SolanaRpcService({
      primaryRpcUrl: 'https://primary.example',
      shyftApiKey: 'sk',
      chainstackApiKey: 'ck',
      chainstackChains: ' Solana ',
    });
    const res = await svc.getMultipleAccounts(['A']);
    expect(res).toEqual([null]);
    expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    const urls = mockedAxios.post.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual([
      'https://primary.example',
      'https://rpc.shyft.to/?api_key=sk',
      'https://solana-mainnet.core.chainstack.com/ck',
    ]);
  });
});
