import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';
import {
  TEMPLATE_COMMANDS,
  placeholdersFor,
} from '@/placeholders/domain/placeholder-registry';
import { PlaceholdersController } from '@/placeholders/api/http/placeholders.controller';

/**
 * Pair-age fixture (plan todo 63): WENCAT best pair created
 * 2026-10-13T12:01:14Z (probe `1791892874000`, public on-chain pair).
 * `NOW` is pinned at +4d so the render matches the live acceptance
 * sample exactly (`Age: 4d`). The age is the best-liquidity PAIR
 * creation time — never token deploy age (proxy caveat) — and the
 * formatter is shared with `fdvAthAgo`, never forked.
 */
const WENCAT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';
const PAIR_AT = '2026-10-13T12:01:14.000Z';
const NOW = Date.parse(PAIR_AT) + 4 * 24 * 60 * 60 * 1000;

function baseToken(overrides: Partial<ResolvedToken> = {}): ResolvedToken {
  return {
    address: WENCAT,
    chain: 'solana',
    symbol: 'WENCAT',
    name: 'Wencat',
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

describe('TemplateRendererService age key (plan todo 63)', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('whitelists age on every command', () => {
    for (const command of TEMPLATE_COMMANDS) {
      expect(placeholdersFor(command)).toContain('age');
    }
  });

  it('exposes META for age (derived, nullable, example 3d)', () => {
    const controller = new PlaceholdersController();
    const entry = controller
      .list('ca')
      .placeholders.find((row) => row.key === 'age');
    expect(entry?.type).toBe('derived');
    expect(entry?.nullable).toBe(true);
    expect(entry?.example).toBe('3d');
  });

  it('renders the pair age from the top-level ISO (probe sample: 4d)', () => {
    const token = baseToken({ pairCreatedAt: PAIR_AT });
    expect(render('Age: {{age}}', token)).toBe('Age: 4d');
  });

  it('carries age in placeholdersUsed', () => {
    const out = new TemplateRendererService().render(
      'Age: {{age}}',
      baseToken({ pairCreatedAt: PAIR_AT }),
      'ca',
    );
    expect(out.placeholdersUsed).toContain('age');
  });

  it('reuses the shared formatter rungs (2d / 5h / 12m from the same ISO)', () => {
    const token = baseToken({ pairCreatedAt: PAIR_AT });
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse(PAIR_AT) + 2 * 24 * 60 * 60 * 1000);
    expect(render('{{age}}', token)).toBe('2d');
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse(PAIR_AT) + 5 * 60 * 60 * 1000);
    expect(render('{{age}}', token)).toBe('5h');
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse(PAIR_AT) + 12 * 60 * 1000);
    expect(render('{{age}}', token)).toBe('12m');
  });

  it('clamps future pair timestamps to 0m (shared formatter, never forked)', () => {
    const token = baseToken({
      pairCreatedAt: new Date(NOW + 60 * 60 * 1000).toISOString(),
    });
    expect(render('{{age}}', token)).toBe('0m');
  });

  it('renders empty on cold-start or malformed input, never crashes', () => {
    expect(render('Age: {{age}}', baseToken())).toBe('Age: ');
    expect(render('Age: {{age}}', baseToken({ pairCreatedAt: null }))).toBe(
      'Age: ',
    );
    expect(render('Age: {{age}}', baseToken({ pairCreatedAt: '' }))).toBe(
      'Age: ',
    );
    expect(
      render('Age: {{age}}', baseToken({ pairCreatedAt: 'not-a-date' })),
    ).toBe('Age: ');
  });

  it('catalog contract reflects the new key (51 base, 52 with timeframe)', () => {
    expect(placeholdersFor('ca')).toHaveLength(51);
    expect(placeholdersFor('z')).toHaveLength(51);
    expect(placeholdersFor('c')).toHaveLength(52);
    expect(placeholdersFor('cc')).toHaveLength(52);
  });
});
