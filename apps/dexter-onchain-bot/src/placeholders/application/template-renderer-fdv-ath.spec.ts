import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';
import { MessageFormatterAdapter } from '@/scan/infrastructure/formatter/message-formatter';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';
import {
  TEMPLATE_COMMANDS,
  placeholdersFor,
} from '@/placeholders/domain/placeholder-registry';
import { PlaceholdersController } from '@/placeholders/api/http/placeholders.controller';

/**
 * Trivial fixture (plan todo 16): `0xCfb3...` on ethereum, pool
 * Sep-24, FDV ~5.6K. History is seeded in market-data specs;
 * here the token already carries the resolved ATH (no network).
 */
const CFB3 = '0xCfb3a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2';
const ATH_AT = '2024-09-24T12:00:00.000Z';
const NOW = Date.parse(ATH_AT) + 9 * 24 * 60 * 60 * 1000;

function baseToken(overrides: Partial<ResolvedToken> = {}): ResolvedToken {
  return {
    address: CFB3,
    chain: 'ethereum',
    symbol: 'CFB3',
    name: 'Cfb3',
    marketCapUsd: null,
    fdvUsd: 5100,
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

describe('TemplateRendererService fdv-ath keys (plan todo 16)', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('whitelists fdvAth + fdvAthAgo on every command', () => {
    for (const command of TEMPLATE_COMMANDS) {
      const keys = placeholdersFor(command);
      expect(keys).toEqual(expect.arrayContaining(['fdvAth', 'fdvAthAgo']));
    }
  });

  it('exposes META for both keys', () => {
    const controller = new PlaceholdersController();
    for (const key of ['fdvAth', 'fdvAthAgo']) {
      const entry = controller
        .list('ca')
        .placeholders.find((row) => row.key === key);
      expect(entry?.type).toBe('derived');
      expect(entry?.example).not.toBe('');
    }
  });

  it('renders exact max + ago math from seeded history (0xCfb3: 5.6K, 1w — 9d gap now hits the w rung)', () => {
    const token = baseToken({ fdvAthUsd: 5600, fdvAthAt: ATH_AT });
    expect(render('ATH {{fdvAth}} ({{fdvAthAgo}})', token)).toBe(
      'ATH 5\\.6K (1w)',
    );
  });

  it('renders fdvAth money-compact with todo-13 policy (no $)', () => {
    const token = baseToken({
      fdvUsd: 5100,
      fdvAthUsd: 1460000000,
      fdvAthAt: ATH_AT,
    });
    expect(render('FDV {{fdvUsd}} / ATH {{fdvAth}}', token)).toBe(
      'FDV 5\\.1K / ATH 1\\.46B',
    );
  });

  it('cold-start (either null) renders BOTH empty — never the current FDV as ATH', () => {
    const noHistory = baseToken({ fdvUsd: 5100 });
    expect(render('ATH {{fdvAth}} ({{fdvAthAgo}})', noHistory)).toBe('ATH  ()');
    const halfPair = baseToken({ fdvAthUsd: 5600, fdvAthAt: null });
    expect(render('ATH {{fdvAth}} ({{fdvAthAgo}})', halfPair)).toBe(
      'ATH 5\\.6K ()',
    );
    const halfPairAt = baseToken({ fdvAthUsd: null, fdvAthAt: ATH_AT });
    expect(render('ATH {{fdvAth}} ({{fdvAthAgo}})', halfPairAt)).toBe(
      'ATH  ()',
    );
  });

  it('spec-asserts the current FDV is never substituted: fdvUsd present, ATH absent', () => {
    const token = baseToken({
      fdvUsd: 99999,
      fdvAthUsd: null,
      fdvAthAt: null,
    });
    const out = render('{{fdvAth}}', token);
    expect(out).toBe('');
    expect(out).not.toContain('99');
  });

  it('clamps future timestamps to now (0m, never negative)', () => {
    const future = new Date(NOW + 60 * 60 * 1000).toISOString();
    const token = baseToken({ fdvAthUsd: 5600, fdvAthAt: future });
    expect(render('{{fdvAthAgo}}', token)).toBe('0m');
  });

  it('renders malformed rows empty, never crashes', () => {
    const badValue = baseToken({
      fdvAthUsd: Number.NaN,
      fdvAthAt: ATH_AT,
    });
    expect(render('{{fdvAth}} ({{fdvAthAgo}})', badValue)).toBe(' ()');
    const badAt = baseToken({
      fdvUsd: 5100,
      fdvAthUsd: 5600,
      fdvAthAt: 'not-a-date',
    });
    expect(render('{{fdvAth}} ({{fdvAthAgo}})', badAt)).toBe('5\\.6K ()');
  });
});

describe('MessageFormatterAdapter.formatCompactAgeText (fdvAthAgo units)', () => {
  const now = Date.parse('2024-10-04T12:00:00.000Z');

  it.each([
    ['9 days (w rung now)', '2024-09-25T12:00:00.000Z', '1w'],
    ['3 days', '2024-10-01T12:00:00.000Z', '3d'],
    ['5 hours', '2024-10-04T07:00:00.000Z', '5h'],
    ['12 minutes', '2024-10-04T11:48:00.000Z', '12m'],
    ['sub-minute', '2024-10-04T11:59:30.000Z', '0m'],
    ['exactly now', '2024-10-04T12:00:00.000Z', '0m'],
    ['6 days (d rung top)', '2024-09-28T12:00:00.000Z', '6d'],
    ['7 days (w rung entry)', '2024-09-27T12:00:00.000Z', '1w'],
    ['21 days', '2024-09-13T12:00:00.000Z', '3w'],
    ['29 days (w rung top)', '2024-09-05T12:00:00.000Z', '4w'],
    ['30 days (mo rung entry)', '2024-09-04T12:00:00.000Z', '1mo'],
    ['275 days', '2024-01-03T12:00:00.000Z', '9mo'],
    ['335 days', '2023-11-04T12:00:00.000Z', '11mo'],
    ['364 days (mo rung top)', '2023-10-06T12:00:00.000Z', '12mo'],
    ['365 days (y rung entry)', '2023-10-05T12:00:00.000Z', '1y'],
    ['730 days', '2022-10-05T12:00:00.000Z', '2y'],
  ])('%s ago renders %s', (_label, iso, expected) => {
    expect(MessageFormatterAdapter.formatCompactAgeText(iso, now)).toBe(
      expected,
    );
  });

  it('clamps future timestamps to 0m', () => {
    expect(
      MessageFormatterAdapter.formatCompactAgeText(
        '2024-10-05T12:00:00.000Z',
        now,
      ),
    ).toBe('0m');
  });

  it.each([[null], [undefined], [''], ['garbage']])(
    'returns empty for %s',
    (iso) => {
      expect(
        MessageFormatterAdapter.formatCompactAgeText(iso as string | null, now),
      ).toBe('');
    },
  );
});
