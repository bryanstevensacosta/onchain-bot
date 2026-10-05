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

  it('Rick parity: dust price renders full digits, MC/liq compact, percent trimmed', () => {
    const formatter = new MessageFormatterAdapter();
    const out = formatter.formatScanCard(FIXTURE);
    // priceUsd 0.00000086 — adaptive dust path, exact segment (never `$0.00`).
    expect(out.text).toContain('💰 0\\.00000086 ');
    // marketCapUsd 752 — compact, no `$`.
    expect(out.text).toContain('MC 752');
    // liquidityUsd 983.78 — compact, no `$`.
    expect(out.text).toContain('Liq 983\\.78');
    // priceChange24h -0.7 — trimmed, negative sign only.
    expect(out.text).toContain('\\-0\\.7%');
    expect(out.text).not.toContain('+');
  });
});

describe('MessageFormatterAdapter statics (Rick-parity number policy)', () => {
  it.each([
    [23_300, '23.3K'],
    [7_900, '7.9K'],
    [1_460_000_000, '1.46B'],
    [80_000_000_000, '80B'],
    [752, '752'],
    [null, 'N/A'],
  ])('formatMoneyText(%p) → %p', (value, expected) => {
    expect(MessageFormatterAdapter.formatMoneyText(value)).toBe(expected);
  });

  it.each([
    [0.00002434, '0.00002434'],
    [0.00004128, '0.00004128'],
    [0.00000086, '0.00000086'],
    [3457, '3,457'],
    [164.32, '164.32'],
    [null, 'N/A'],
  ])('formatPriceText(%p) → %p', (value, expected) => {
    expect(MessageFormatterAdapter.formatPriceText(value)).toBe(expected);
  });

  it.each([
    [80, '80%'],
    [-34.4, '-34.4%'],
    [2.5, '2.5%'],
    [-0, '0%'],
    [-0.04, '0%'],
    [0, '0%'],
    [null, 'N/A'],
  ])('formatPercentText(%p) → %p', (value, expected) => {
    expect(MessageFormatterAdapter.formatPercentText(value)).toBe(expected);
  });

  it('formatNumberText counts are unchanged', () => {
    expect(MessageFormatterAdapter.formatNumberText(382)).toBe('382');
    expect(MessageFormatterAdapter.formatNumberText(1_200_000)).toBe('1.2M');
    expect(MessageFormatterAdapter.formatNumberText(null)).toBe('N/A');
  });
});
