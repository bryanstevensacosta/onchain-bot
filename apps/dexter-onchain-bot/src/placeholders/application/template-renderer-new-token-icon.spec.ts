import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';
import {
  NEW_TOKEN_ICON_MAX_AGE_MS,
  TemplateRendererService,
} from '@/placeholders/application/template-renderer.service';
import type { DisplayResolverPort } from '@/placeholders/application/template-renderer.service';
import {
  DERIVED_PLACEHOLDERS,
  TEMPLATE_COMMANDS,
  placeholdersFor,
} from '@/placeholders/domain/placeholder-registry';
import { PlaceholdersController } from '@/placeholders/api/http/placeholders.controller';

/**
 * Rick title status emoji (docs: pricebot#scan-icons,
 * "🆕 - token age under 15 minutes"). Same best-pair ISO fixture as
 * `template-renderer-age.spec.ts` — the 🆕 window is computed from the
 * SAME `values.pairCreatedAt` proxy (`age`), never a new data source.
 * `NOW` defaults to +4d (an old pair → silence) so every window test
 * has to say explicitly how old the pair is.
 */
const KODA = '0xd3775c4D5C517AaCAe0CCF906DCD96713b5749cF';
const PAIR_AT = '2026-10-13T12:01:14.000Z';
const MINUTE = 60 * 1000;
const NOW = Date.parse(PAIR_AT) + 4 * 24 * 60 * 60 * 1000;

const CHAIN_RESOLVER: DisplayResolverPort = {
  resolve: (placeholderKey: string, matchValue: string) =>
    placeholderKey === 'chain' && matchValue === 'bsc' ? '🟡' : '',
};

function baseToken(overrides: Partial<ResolvedToken> = {}): ResolvedToken {
  return {
    address: KODA,
    chain: 'bsc',
    symbol: 'KODA',
    name: 'Koda',
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

const render = (
  body: string,
  token: ResolvedToken,
  displayResolver: DisplayResolverPort | null = null,
): string =>
  new TemplateRendererService(displayResolver).render(body, token, 'ca').text;

const setNow = (offsetMs: number): void => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse(PAIR_AT) + offsetMs);
};

describe('TemplateRendererService newTokenIcon key (Rick scan-icons)', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('whitelists newTokenIcon on every command', () => {
    for (const command of TEMPLATE_COMMANDS) {
      expect(placeholdersFor(command)).toContain('newTokenIcon');
    }
  });

  it('registers newTokenIcon in DERIVED_PLACEHOLDERS right after headerIcon', () => {
    const keys = [...DERIVED_PLACEHOLDERS];
    expect(keys).toContain('newTokenIcon');
    expect(keys.indexOf('newTokenIcon')).toBe(keys.indexOf('headerIcon') + 1);
  });

  it('exposes META for newTokenIcon (derived, nullable, example 🆕)', () => {
    const controller = new PlaceholdersController();
    const entry = controller
      .list('ca')
      .placeholders.find((row) => row.key === 'newTokenIcon');
    expect(entry?.type).toBe('derived');
    expect(entry?.nullable).toBe(true);
    expect(entry?.example).toBe('🆕');
    expect(entry?.description).toEqual(expect.any(String));
  });

  it('renders 🆕 for a pair created exactly now (0s)', () => {
    setNow(0);
    expect(
      render('{{newTokenIcon}}', baseToken({ pairCreatedAt: PAIR_AT })),
    ).toBe('🆕');
  });

  it('renders 🆕 at 14m59s (under the 15 minute window)', () => {
    setNow(14 * MINUTE + 59 * 1000);
    expect(
      render('{{newTokenIcon}}', baseToken({ pairCreatedAt: PAIR_AT })),
    ).toBe('🆕');
  });

  it('renders silence at exactly 15m (docs say UNDER 15 minutes)', () => {
    setNow(NEW_TOKEN_ICON_MAX_AGE_MS);
    expect(
      render('{{newTokenIcon}}', baseToken({ pairCreatedAt: PAIR_AT })),
    ).toBe('');
  });

  it('renders silence at 16m', () => {
    setNow(16 * MINUTE);
    expect(
      render('{{newTokenIcon}}', baseToken({ pairCreatedAt: PAIR_AT })),
    ).toBe('');
  });

  it('renders silence on null, empty or unparseable pairCreatedAt', () => {
    expect(render('A{{newTokenIcon}}B', baseToken())).toBe('AB');
    expect(
      render('A{{newTokenIcon}}B', baseToken({ pairCreatedAt: null })),
    ).toBe('AB');
    expect(render('A{{newTokenIcon}}B', baseToken({ pairCreatedAt: '' }))).toBe(
      'AB',
    );
    expect(
      render('A{{newTokenIcon}}B', baseToken({ pairCreatedAt: 'not-a-date' })),
    ).toBe('AB');
  });

  it('renders silence on a FUTURE timestamp (never claims an age)', () => {
    setNow(0);
    const future = new Date(Date.parse(PAIR_AT) + 60 * MINUTE).toISOString();
    expect(
      render('A{{newTokenIcon}}B', baseToken({ pairCreatedAt: future })),
    ).toBe('AB');
  });

  it('composes {{newTokenIcon}}{{headerIcon}} as 🆕🟡 (BSC chain emoji)', () => {
    setNow(2 * MINUTE);
    const out = render(
      '{{newTokenIcon}}{{headerIcon}}',
      baseToken({ pairCreatedAt: PAIR_AT }),
      CHAIN_RESOLVER,
    );
    expect(out).toBe('🆕🟡');
  });

  it('renders only the header icon for an old pair (no 🆕)', () => {
    const out = render(
      '{{newTokenIcon}}{{headerIcon}}',
      baseToken({ pairCreatedAt: PAIR_AT }),
      CHAIN_RESOLVER,
    );
    expect(out).toBe('🟡');
    expect(out).not.toContain('🆕');
  });

  it('emits the raw emoji with zero backslashes, exactly once', () => {
    setNow(60 * 1000);
    const out = render(
      '{{newTokenIcon}}',
      baseToken({ pairCreatedAt: PAIR_AT }),
    );
    expect(out).toBe('🆕');
    expect(out.match(/\\/g)).toBeNull();
    expect(out.split('🆕').length - 1).toBe(1);
  });

  it('carries newTokenIcon in placeholdersUsed', () => {
    setNow(60 * 1000);
    const out = new TemplateRendererService().render(
      '{{newTokenIcon}}',
      baseToken({ pairCreatedAt: PAIR_AT }),
      'ca',
    );
    expect(out.placeholdersUsed).toContain('newTokenIcon');
  });
});
