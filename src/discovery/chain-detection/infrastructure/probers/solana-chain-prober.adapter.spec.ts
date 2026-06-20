import { SolanaChainProberAdapter } from 'discovery/chain-detection/infrastructure/probers/solana-chain-prober.adapter';
import { ConfigService } from '@nestjs/config';

class FakeConfig {
  constructor(private readonly cfg: Record<string, unknown>) {}
  public get<T>(key: string): T {
    return this.cfg[key] as T;
  }
}

const USDC_SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

describe('SolanaChainProberAdapter', () => {
  it('reports responded=false when HELIUS_RPC_URL_MAINNET is missing', async () => {
    const cfg = new FakeConfig({
      app: { helius: { mainnet: { rpcUrl: '' } } },
    });
    const prober = new SolanaChainProberAdapter(
      cfg as unknown as ConfigService,
    );

    const result = await prober.probe(USDC_SOL);
    expect(result.responded).toBe(false);
    expect(result.isContract).toBeNull();
    expect(result.notes).toContain('solana:no_rpc_url');
  });

  it('rejects non-Base58 strings', async () => {
    const cfg = new FakeConfig({
      app: {
        helius: {
          mainnet: { rpcUrl: 'https://mainnet.helius-rpc.com/?api-key=fake' },
        },
      },
    });
    const prober = new SolanaChainProberAdapter(
      cfg as unknown as ConfigService,
    );

    const result = await prober.probe('not-base58!!!');
    expect(result.responded).toBe(false);
    expect(result.notes).toContain('solana:format_invalid_base58');
  });

  it('rejects Base58 strings of wrong length', async () => {
    const cfg = new FakeConfig({
      app: {
        helius: {
          mainnet: { rpcUrl: 'https://mainnet.helius-rpc.com/?api-key=fake' },
        },
      },
    });
    const prober = new SolanaChainProberAdapter(
      cfg as unknown as ConfigService,
    );

    const result = await prober.probe('abc'); // valid Base58 but too short
    expect(result.responded).toBe(false);
    expect(result.notes).toContain('solana:format_not_32_bytes');
  });

  it('exposes chainName="solana"', () => {
    const cfg = new FakeConfig({
      app: {
        helius: {
          mainnet: { rpcUrl: 'https://mainnet.helius-rpc.com/?api-key=fake' },
        },
      },
    });
    const prober = new SolanaChainProberAdapter(
      cfg as unknown as ConfigService,
    );
    expect(prober.chainName).toBe('solana');
  });
});
