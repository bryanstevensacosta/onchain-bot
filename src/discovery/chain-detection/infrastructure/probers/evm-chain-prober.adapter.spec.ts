import { EvmChainProberAdapter } from 'discovery/chain-detection/infrastructure/probers/evm-chain-prober.adapter';
import { ConfigService } from '@nestjs/config';

class FakeConfig {
  constructor(private readonly cfg: Record<string, unknown>) {}
  public get<T>(key: string): T {
    return this.cfg[key] as T;
  }
}

const ETHEREUM_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // vitalik.eth

describe('EvmChainProberAdapter', () => {
  it('reports responded=false when ALCHEMY_API_KEY is missing', async () => {
    const cfg = new FakeConfig({ app: { alchemy: { apiKey: '' } } });
    const prober = new EvmChainProberAdapter(cfg as unknown as ConfigService);

    const result = await prober.probe(ETHEREUM_ADDRESS);
    expect(result.responded).toBe(false);
    expect(result.isContract).toBeNull();
    expect(result.notes).toContain('alchemy:no_api_key');
  });

  it('rejects non-EVM format before RPC call', async () => {
    const cfg = new FakeConfig({ app: { alchemy: { apiKey: 'fake' } } });
    const prober = new EvmChainProberAdapter(cfg as unknown as ConfigService);

    const result = await prober.probe('not-an-address');
    expect(result.responded).toBe(false);
    expect(result.notes).toContain('evm:format_invalid');
  });

  it('exposes chainName="ethereum"', () => {
    const cfg = new FakeConfig({ app: { alchemy: { apiKey: 'fake' } } });
    const prober = new EvmChainProberAdapter(cfg as unknown as ConfigService);
    expect(prober.chainName).toBe('ethereum');
  });
});
