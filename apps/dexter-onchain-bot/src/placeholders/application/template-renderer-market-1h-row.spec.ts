import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';
import {
  TEMPLATE_COMMANDS,
  placeholdersFor,
} from '@/placeholders/domain/placeholder-registry';
import { PlaceholdersController } from '@/placeholders/api/http/placeholders.controller';

/**
 * `market1hRow` (Rick parity, 2026-10-26): ONE composed derived
 * placeholder fed by the four 1-hour snapshot fields
 * (`volume1hUsd` / `priceChange1h` / `txns1hBuys` / `txns1hSells`).
 *
 * Reference row (official docs, pricebot#reading-a-token-scan):
 * `📈 1H: 159 ⋅ 1.7% 🅑 3 Ⓢ 5` = 1h volume, 1h price change, buys,
 * sells. `📈`/`📉` is the price direction. The renderer emits the
 * MarkdownV2-escaped form (`1\.7%` is the escaped decimal point —
 * `escapeV2Text` escapes `.`), which Telegram DISPLAYS as `1.7%`;
 * `displayOf` below pins the human-facing string.
 */

const CHALE_MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';

const FULL = {
  volume1hUsd: 159,
  priceChange1h: 1.7,
  txns1hBuys: 3,
  txns1hSells: 5,
} as const;

/** MarkdownV2 unescape for display-form assertions (test-only). */
const displayOf = (text: string): string =>
  text.replace(/\\([_*[\]()~`>#+=|{}.!\\-])/g, '$1');

function baseToken(overrides: Partial<ResolvedToken> = {}): ResolvedToken {
  return {
    address: CHALE_MINT,
    chain: 'solana',
    symbol: 'CHALE',
    name: 'Chale',
    marketCapUsd: null,
    fdvUsd: null,
    priceUsd: null,
    priceChange24h: null,
    liquidityUsd: null,
    lockedLiquidityPercent: null,
    burnedPercent: null,
    volume24hUsd: null,
    holders: null,
    top10HolderPercent: null,
    top20HolderPercent: null,
    totalSupply: null,
    circulatingSupply: null,
    maxSupply: null,
    devWallets: null,
    devPctSupply: null,
    poolAddress: null,
    source: 'market-data-http',
    ...overrides,
  };
}

const render = (body: string, token: ResolvedToken): string =>
  new TemplateRendererService().render(body, token, 'ca').text;

describe('TemplateRendererService market1hRow (Rick parity, 2026-10-26)', () => {
  it('whitelists market1hRow on every command', () => {
    for (const command of TEMPLATE_COMMANDS) {
      expect(placeholdersFor(command)).toContain('market1hRow');
    }
  });

  it('exposes META for market1hRow (derived, nullable, exact Rick sample)', () => {
    const controller = new PlaceholdersController();
    const entry = controller
      .list('ca')
      .placeholders.find((row) => row.key === 'market1hRow');
    expect(entry?.type).toBe('derived');
    expect(entry?.nullable).toBe(true);
    expect(entry?.example).toBe('📈 1H: 159 ⋅ 1.7% 🅑 3 Ⓢ 5');
  });

  it('renders the exact Rick sample (positive change → 📈)', () => {
    const out = render('{{market1hRow}}', baseToken(FULL));
    // Escaped ONCE: the decimal point of `1.7%` is MarkdownV2-escaped.
    expect(out).toBe('📈 1H: 159 ⋅ 1\\.7% 🅑 3 Ⓢ 5');
    expect(displayOf(out)).toBe('📈 1H: 159 ⋅ 1.7% 🅑 3 Ⓢ 5');
  });

  it('renders 📉 for a negative change (sign escaped once)', () => {
    const out = render(
      '{{market1hRow}}',
      baseToken({ ...FULL, priceChange1h: -3.4 }),
    );
    expect(out).toBe('📉 1H: 159 ⋅ \\-3\\.4% 🅑 3 Ⓢ 5');
    expect(displayOf(out)).toBe('📉 1H: 159 ⋅ -3.4% 🅑 3 Ⓢ 5');
  });

  it('renders 📈 for a ZERO change (never 📉)', () => {
    expect(
      render('{{market1hRow}}', baseToken({ ...FULL, priceChange1h: 0 })),
    ).toBe('📈 1H: 159 ⋅ 0% 🅑 3 Ⓢ 5');
  });

  it('renders a zero volume as `0` via the shared money formatter', () => {
    expect(
      render('{{market1hRow}}', baseToken({ ...FULL, volume1hUsd: 0 })),
    ).toBe('📈 1H: 0 ⋅ 1\\.7% 🅑 3 Ⓢ 5');
  });

  it('formats volume compact (K/M/B) and counts with the count formatter', () => {
    expect(
      render(
        '{{market1hRow}}',
        baseToken({
          volume1hUsd: 1_571_900,
          priceChange1h: 12.5,
          txns1hBuys: 1_200,
          txns1hSells: 850,
        }),
      ),
    ).toBe('📈 1H: 1\\.6M ⋅ 12\\.5% 🅑 1\\.2K Ⓢ 850');
  });

  it.each([
    ['volume1hUsd', { volume1hUsd: undefined }],
    ['priceChange1h', { priceChange1h: undefined }],
    ['txns1hBuys', { txns1hBuys: undefined }],
    ['txns1hSells', { txns1hSells: undefined }],
  ])('SILENCE when %s is missing (no half-empty row)', (_key, missing) => {
    expect(render('{{market1hRow}}', baseToken({ ...FULL, ...missing }))).toBe(
      '',
    );
  });

  it('SILENCE when all four are present but buys is missing', () => {
    const token = baseToken({
      volume1hUsd: 159,
      priceChange1h: 1.7,
      txns1hSells: 5,
    });
    expect(render('{{market1hRow}}', token)).toBe('');
  });

  it.each([
    ['volume NaN', { volume1hUsd: Number.NaN }],
    ['volume Infinity', { volume1hUsd: Number.POSITIVE_INFINITY }],
    ['change NaN', { priceChange1h: Number.NaN }],
    ['buys negative', { txns1hBuys: -1 }],
    ['sells Infinity', { txns1hSells: Number.POSITIVE_INFINITY }],
  ])('SILENCE on a non-finite/invalid value (%s)', (_label, bad) => {
    expect(render('{{market1hRow}}', baseToken({ ...FULL, ...bad }))).toBe('');
  });

  it('SILENCE when every 1h field is absent (older snapshots)', () => {
    expect(render('{{market1hRow}}', baseToken())).toBe('');
  });

  it('emits no leading/trailing whitespace or newline (templates own separators)', () => {
    const out = render('Prev\n{{market1hRow}}\nNext', baseToken(FULL));
    expect(out).toBe('Prev\n📈 1H: 159 ⋅ 1\\.7% 🅑 3 Ⓢ 5\nNext');
    expect(out).not.toMatch(/^\s|\s$/);
  });

  it('carries market1hRow in placeholdersUsed', () => {
    const out = new TemplateRendererService().render(
      '{{market1hRow}}',
      baseToken(FULL),
      'ca',
    );
    expect(out.placeholdersUsed).toContain('market1hRow');
  });
});
