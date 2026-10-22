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

  it('Rick parity: sub-1 price renders 8 fixed decimals, MC/liq compact/whole, percent trimmed', () => {
    const formatter = new MessageFormatterAdapter();
    const out = formatter.formatScanCard(FIXTURE);
    // priceUsd 0.00000086 — fixed-8-dp path, exact segment (never `$0.00`).
    expect(out.text).toContain('💰 0\\.00000086 ');
    // marketCapUsd 752 — compact, no `$`.
    expect(out.text).toContain('MC 752');
    // liquidityUsd 983.78 — sub-1000 nearest whole (plan todo 65), no `$`.
    expect(out.text).toContain('Liq 984');
    // priceChange24h -0.7 — trimmed, negative sign only.
    expect(out.text).toContain('\\-0\\.7%');
    expect(out.text).not.toContain('+');
  });
});

describe('MessageFormatterAdapter statics (Rick-parity number policy)', () => {
  it.each([
    [23_300, '23.3K'],
    [7_900, '7.9K'],
    [1_460_000_000, '1.5B'],
    [80_000_000_000, '80B'],
    [752, '752'],
    [55_670, '55.7K'],
    // toFixed(1) yields `11.0`; the dangling `.0` is stripped.
    [10_974.57, '11K'],
    [999_949, '999.9K'],
    // Edge (plan todo 64): rounding carries the mantissa, not the unit —
    // `999.96` rounds to `1000.0` → `1000K`. NO roll to `1M` (same as the
    // old 2-dec rule; unobserved in Rick; documented and pinned).
    [999_960, '1000K'],
    // Sub-1000 whole-integer re-pin (plan todo 65, SPEED evidence
    // 2026-10-18): nearest, not truncation (`10.85` → `11`).
    [983.78, '984'],
    [94.31, '94'],
    [752.1, '752'],
    [10.85, '11'],
    [146.285, '146'],
    [749, '749'],
    [0.94, '1'],
    [999.4, '999'],
    // Edge (plan todo 65): 999.5 rounds up to a bare unit-less `1000`,
    // which the sub-1000 branch must never render → carry to `1K`
    // (mirror of the ≥1000 no-carry edge above).
    [999.5, '1K'],
    [null, 'N/A'],
  ])('formatMoneyText(%p) → %p', (value, expected) => {
    expect(MessageFormatterAdapter.formatMoneyText(value)).toBe(expected);
  });

  it.each([
    [0.000002417035478, '0.00000242'],
    // Price 8-dp re-pin (plan todo 66, SPEED evidence 2026-10-18):
    // fixed 8 decimals half-up, trailing zeros stripped.
    [0.00002434, '0.00002434'],
    [0.00004128, '0.00004128'],
    [0.00000086, '0.00000086'],
    [0.002345, '0.002345'],
    [7.521e-7, '0.00000075'],
    [0.0000007521, '0.00000075'],
    [0.5, '0.5'],
    [0.001, '0.001'],
    // Ultra-dust below 1e-8 collapses to `0` at 8 dp → legacy
    // 3-sig-fig fallback, never `0` (plan todo 66 guard).
    [1.23e-9, '0.00000000123'],
    [0, '0'],
    [-0.000002417035478, '-0.00000242'],
    [-0.5, '-0.5'],
    [3457, '3,457'],
    [164.32, '164.32'],
    [null, 'N/A'],
    [NaN, 'NaN'],
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

describe('MessageFormatterAdapter.formatCompactAgeText (public static, no weeks rung)', () => {
  const now = Date.parse('2024-10-04T12:00:00.000Z');

  it.each([
    // 7-29d used to render `1w`/`3w`/`4w`; the rick-compact-card plan
    // removed the weeks rung so the days rung covers 1-29d (floored).
    ['6 days', '2024-09-28T12:00:00.000Z', '6d'],
    ['7 days', '2024-09-27T12:00:00.000Z', '7d'],
    ['13 days', '2024-09-21T12:00:00.000Z', '13d'],
    ['29 days', '2024-09-05T12:00:00.000Z', '29d'],
    ['30 days (mo rung entry)', '2024-09-04T12:00:00.000Z', '1mo'],
    ['365 days (y rung entry)', '2023-10-05T12:00:00.000Z', '1y'],
  ])('%s ago renders %s', (_label, iso, expected) => {
    expect(MessageFormatterAdapter.formatCompactAgeText(iso, now)).toBe(
      expected,
    );
  });
});
