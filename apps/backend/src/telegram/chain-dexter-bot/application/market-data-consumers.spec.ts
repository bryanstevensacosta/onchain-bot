import { ChainId } from 'chain/identity/chain-id.vo';
import { EvmChainProberAdapter } from 'chain/detection/infrastructure/probers/evm-chain-prober.adapter';
import { SolanaChainProberAdapter } from 'chain/detection/infrastructure/probers/solana-chain-prober.adapter';
import { BirdeyeAdapter } from 'token/enrichment/infrastructure/providers/birdeye.adapter';
import { TickerResolverService } from 'telegram/vip-calls/vip-channel/application/services/ticker-resolver.service';
import { AlchemyService } from '../../../../../market-data/src/provider/infrastructure/alchemy/alchemy.service';
import { BirdeyeService } from '../../../../../market-data/src/provider/infrastructure/birdeye/birdeye.service';
import { CoinGeckoService } from '../../../../../market-data/src/provider/infrastructure/coingecko/coingecko.service';
import { DexScreenerService } from '../../../../../market-data/src/provider/infrastructure/dexscreener/dexscreener.service';
import { GeckoTerminalService } from '../../../../../market-data/src/provider/infrastructure/geckoterminal/geckoterminal.service';
import { HeliusService } from '../../../../../market-data/src/provider/infrastructure/helius/helius.service';
import { MoralisService } from '../../../../../market-data/src/provider/infrastructure/moralis/moralis.service';
import { SolanaRpcService } from '../../../../../market-data/src/provider/infrastructure/solana-rpc/solana-rpc.service';

/**
 * Adversarial consumer suite (Tramo 3, todo 4, C-DATA-01, gap-7 integrated).
 *
 * chain-dexter-bot stays INTEGRATED (standalone extraction is todo 9): its
 * scan path composes DetectChain + Enrich use cases whose providers are now
 * owned by market-data. Each case below wires a backend consumer against
 * the canonical market-data adapter with inputs that short-circuit BEFORE
 * any network call. A broken consumer (missing provider, forked class,
 * wrong import) fails here first.
 */
describe('chain-dexter-bot consumers resolve market-data providers (todo 4)', () => {
  it('EVM prober rejects a non-hex address without touching Alchemy', async () => {
    const prober = new EvmChainProberAdapter(
      new AlchemyService({ apiKey: '' }),
    );
    const result = await prober.probe('not-an-address');
    expect(result.responded).toBe(false);
  });

  it('Solana prober rejects invalid base58 without touching Solana RPC', async () => {
    const prober = new SolanaChainProberAdapter(new SolanaRpcService({}));
    const result = await prober.probe('!!!-not-base58-!!!');
    expect(result.responded).toBe(false);
    expect(result.notes).toContain('solana:format_invalid_base58');
  });

  it('enrichment Birdeye adapter short-circuits non-solana chains', async () => {
    const adapter = new BirdeyeAdapter(new BirdeyeService({ apiKey: '' }));
    const result = await adapter.fetch(ChainId.fromString('ethereum'), '0xabc');
    expect(result).toBeNull();
  });

  it('ticker resolver wires all five market-data services', () => {
    const resolver = new TickerResolverService(
      new DexScreenerService({}),
      new GeckoTerminalService({}),
      new CoinGeckoService({ apiKey: '' }),
      new MoralisService({ apiKey: '' }),
      new HeliusService({ apiKey: '', mainnet: { rpcUrl: '' } }),
      { apiKey: '' },
    );
    expect(resolver).toBeDefined();
  });
});
