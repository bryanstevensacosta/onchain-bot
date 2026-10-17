import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';
import {
  TEMPLATE_COMMANDS,
  isKnownPlaceholder,
  placeholdersFor,
} from '@/placeholders/domain/placeholder-registry';
import { PlaceholdersController } from '@/placeholders/api/http/placeholders.controller';

/**
 * Rick-parity `{{liquidityRatio}}` (plan todo 62): `[xN]` bracket with
 * `N = Math.round(fdvUsd / liquidityUsd)` over the SERVED values
 * (entity-verified samples: Chale `Liq: 7.9K [x3]`, WENCAT-Rick
 * `Liq: 6.7K [x3]`; PERPS `Liq: 1.8K ⚠️` with NO bracket → omission
 * rule). Pure renderer computation — no snapshot/market-data field,
 * no network. `""` (never `N/A` nor `[x0]`) when either side is
 * absent/non-finite/≤0 or the rounded `N` falls below 1.
 */
function baseToken(overrides: Partial<ResolvedToken> = {}): ResolvedToken {
  return {
    address: 'So11111111111111111111111111111111111111112',
    chain: 'solana',
    symbol: 'TEST',
    name: 'Test',
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

describe('TemplateRendererService liquidityRatio key (plan todo 62)', () => {
  it('renders the Chale sample verbatim: 23300/7900 → [x3]', () => {
    const token = baseToken({ fdvUsd: 23300, liquidityUsd: 7900 });
    expect(render('{{liquidityRatio}}', token)).toBe('\\[x3\\]');
    // Full Rick-style Liq line (money key + bracket, both escaped once).
    expect(render('💦 Liq: {{liquidityUsd}} {{liquidityRatio}}', token)).toBe(
      '💦 Liq: 7\\.9K \\[x3\\]',
    );
  });

  it('renders the WENCAT-Rick sample: 19100/6700 (≈2.85) → [x3]', () => {
    const token = baseToken({ fdvUsd: 19100, liquidityUsd: 6700 });
    expect(render('{{liquidityRatio}}', token)).toBe('\\[x3\\]');
  });

  it('rounds half-up like the legacy toFixed(0) convention: 2.5 → [x3], 2.1 → [x2]', () => {
    expect(
      render('{{liquidityRatio}}', baseToken({ fdvUsd: 25, liquidityUsd: 10 })),
    ).toBe('\\[x3\\]');
    // round(2.1) = 2 (a ceil rule would print [x3] — round is the pin).
    expect(
      render(
        '{{liquidityRatio}}',
        baseToken({ fdvUsd: 210, liquidityUsd: 100 }),
      ),
    ).toBe('\\[x2\\]');
  });

  it('renders the sub-1 fraction that rounds up to the floor bracket: 100/140 → [x1]', () => {
    const token = baseToken({ fdvUsd: 100, liquidityUsd: 140 });
    expect(render('{{liquidityRatio}}', token)).toBe('\\[x1\\]');
  });

  it('handles the 0.5 boundary: exactly 0.5 → [x1]; 0.4999 → empty', () => {
    expect(
      render(
        '{{liquidityRatio}}',
        baseToken({ fdvUsd: 50, liquidityUsd: 100 }),
      ),
    ).toBe('\\[x1\\]');
    expect(
      render(
        '{{liquidityRatio}}',
        baseToken({ fdvUsd: 4999, liquidityUsd: 10000 }),
      ),
    ).toBe('');
  });

  it('omits below 1× (42/100 → empty, never N/A nor [x0]); PERPS sample 749/1800 → empty', () => {
    const belowOne = render(
      '{{liquidityRatio}}',
      baseToken({ fdvUsd: 42, liquidityUsd: 100 }),
    );
    expect(belowOne).toBe('');
    expect(belowOne).not.toBe('N/A');
    expect(belowOne).not.toContain('[x0]');
    expect(
      render(
        '{{liquidityRatio}}',
        baseToken({ fdvUsd: 749, liquidityUsd: 1800 }),
      ),
    ).toBe('');
  });

  it.each([
    ['fdv null', { fdvUsd: null, liquidityUsd: 100 }],
    ['liq null', { fdvUsd: 100, liquidityUsd: null }],
    ['both null', { fdvUsd: null, liquidityUsd: null }],
    ['liq absent', { fdvUsd: 100, liquidityUsd: undefined }],
    ['fdv zero', { fdvUsd: 0, liquidityUsd: 100 }],
    ['liq zero', { fdvUsd: 100, liquidityUsd: 0 }],
    ['fdv negative', { fdvUsd: -100, liquidityUsd: 50 }],
    ['liq negative', { fdvUsd: 100, liquidityUsd: -50 }],
    ['fdv NaN', { fdvUsd: Number.NaN, liquidityUsd: 100 }],
    ['liq Infinity', { fdvUsd: 100, liquidityUsd: Number.POSITIVE_INFINITY }],
    ['fdv Infinity', { fdvUsd: Number.POSITIVE_INFINITY, liquidityUsd: 100 }],
  ])('renders empty for invalid input: %s', (_label, overrides) => {
    expect(
      render(
        '{{liquidityRatio}}',
        baseToken(overrides as Partial<ResolvedToken>),
      ),
    ).toBe('');
  });

  it('reports the key in placeholdersUsed exactly once', () => {
    const token = baseToken({ fdvUsd: 23300, liquidityUsd: 7900 });
    const result = new TemplateRendererService().render(
      '{{liquidityRatio}}{{liquidityRatio}}',
      token,
      'ca',
    );
    expect(result.placeholdersUsed).toEqual(['liquidityRatio']);
  });

  it('whitelists liquidityRatio on every command (membership gates)', () => {
    for (const command of TEMPLATE_COMMANDS) {
      expect(placeholdersFor(command)).toContain('liquidityRatio');
      expect(isKnownPlaceholder(command, 'liquidityRatio')).toBe(true);
    }
    expect(placeholdersFor('ca')).not.toContain('liquidityRation');
  });

  it('exposes META in the placeholder catalog', () => {
    const controller = new PlaceholdersController();
    for (const command of TEMPLATE_COMMANDS) {
      const entry = controller
        .list(command)
        .placeholders.find((row) => row.key === 'liquidityRatio');
      expect(entry?.type).toBe('derived');
      expect(entry?.nullable).toBe(true);
      expect(entry?.example).toBe('[x3]');
    }
  });

  it('accepts the key in template bodies (closed-vocabulary gate passes)', () => {
    const token = baseToken({ fdvUsd: 19100, liquidityUsd: 6700 });
    expect(() => render('Liq {{liquidityRatio}}', token)).not.toThrow();
    // Unknown keys still fail (guard is membership, not a bypass).
    expect(() => render('{{liquidityRation}}', token)).toThrow(
      'Unknown placeholder',
    );
  });
});
