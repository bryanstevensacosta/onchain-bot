import { MessageFormatterAdapter } from '@/scan/infrastructure/formatter/message-formatter';
import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';

const FIXTURE: ResolvedToken = {
  address: '0x5B4C3E76Df54bAbF45E9478cCDfE850F77100000',
  chain: 'ethereum',
  symbol: 'PERPS',
  name: 'perpmarkets.fun',
  marketCapUsd: 752,
  fdvUsd: 749,
  priceUsd: 0.00000086,
  priceChange24h: -0.7,
  liquidityUsd: 983.78,
  lockedLiquidityPercent: null,
  burnedPercent: null,
  volume24hUsd: 2380,
  holders: 62,
  top10HolderPercent: 20.31,
  top20HolderPercent: null,
  totalSupply: 1_000_000_000,
  circulatingSupply: 800_000_000,
  maxSupply: 1_000_000_000,
  devWallets: [
    {
      wallet: '0x6abc000000000000000000000000000000000e4f',
      holdAmount: null,
      percentOfSupply: 2.5,
      pnlUsd: null,
      tag: null,
    },
  ],
  devPctSupply: 2.5,
  poolAddress: null,
  source: 'market-data-http',
};

describe('MessageFormatterAdapter.formatScanCard (dexter own template)', () => {
  it('renders header + price/MC/liq + supplies + holders/dev + links + trade hint as MarkdownV2', () => {
    const formatter = new MessageFormatterAdapter();
    const out = formatter.formatScanCard(FIXTURE);
    expect(out.text).toContain('$PERPS');
    expect(out.text).toContain('MC');
    expect(out.text).toContain('Liq');
    expect(out.text).toContain('Total supply');
    expect(out.text).toContain('Holders');
    expect(out.text).toContain('Dev');
    expect(out.text).toContain('dexscreener.com');
    expect(out.text).toContain('geckoterminal.com');
    expect(out.text).toContain('0x5B4C3E76Df54bAbF45E9478cCDfE850F77100000');
    expect(out.parseMode).toBe('MarkdownV2');
    expect(out.text.length).toBeLessThanOrEqual(4096);
  });
});
