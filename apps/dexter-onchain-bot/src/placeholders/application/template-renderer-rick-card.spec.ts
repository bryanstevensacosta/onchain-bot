import type {
  HoneypotInfo,
  ResolvedToken,
} from '@/scan/domain/ports/scan-pipeline.port';
import { BotIdentityService } from '@/settings/application/bot-identity.service';
import {
  LOW_LIQUIDITY_SIDE_USD,
  TemplateRendererService,
} from '@/placeholders/application/template-renderer.service';
import type { DisplayResolverPort } from '@/placeholders/application/template-renderer.service';
import {
  DERIVED_PLACEHOLDERS,
  TEMPLATE_COMMANDS,
  isKnownPlaceholder,
  placeholdersFor,
} from '@/placeholders/domain/placeholder-registry';
import { PlaceholdersController } from '@/placeholders/api/http/placeholders.controller';

/**
 * Rick compact card parity (plan dexter-rick-compact-card, 2026-10-22).
 * Live fixture: KODA on BSC (pair created 2026-10-14T14:30:02Z), with
 * the honest snapshot values from the plan (§2/§6): FDV 751, price
 * 0.00007707, total liquidity 787.253 (one-side 393.6 → 394), volume
 * 1.5719 (→ 2), GoPlus SIM ok + 2.97% sell tax, LP locked 100% /
 * burned 0%. `NOW` is pinned at +7d so the shared floored formatter
 * renders `7d`, matching the acceptance sample.
 */
const KODA = '0xd3775c4D5C517AaCAe0CCF906DCD96713b5749cF';
const PAIR_AT = '2026-10-14T14:30:02.000Z';
const NOW = Date.parse(PAIR_AT) + 7 * 24 * 60 * 60 * 1000;
const BOT_URL = `https://t.me/DexterBot?start=${KODA}`;

const NEW_KEYS = [
  'headerIcon',
  'liquidityUsdSide',
  'liquidityFlags',
  'honeypotBlock',
  'ageSuffix',
  'nameLink',
] as const;

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

function renderer(
  displayResolver: DisplayResolverPort | null = CHAIN_RESOLVER,
  username: string | null = 'DexterBot',
): TemplateRendererService {
  const identity =
    username === null
      ? null
      : ({
          getUsername: () => username,
        } as unknown as BotIdentityService);
  return new TemplateRendererService(displayResolver, identity);
}

const render = (
  body: string,
  token: ResolvedToken,
  displayResolver: DisplayResolverPort | null = CHAIN_RESOLVER,
  username: string | null = 'DexterBot',
): string => renderer(displayResolver, username).render(body, token, 'ca').text;

describe('TemplateRendererService rick compact card keys', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('whitelists the 6 new derived keys on every command (29 derived total)', () => {
    expect(DERIVED_PLACEHOLDERS).toHaveLength(29);
    for (const command of TEMPLATE_COMMANDS) {
      for (const key of NEW_KEYS) {
        expect(isKnownPlaceholder(command, key)).toBe(true);
        expect(placeholdersFor(command)).toContain(key);
      }
    }
  });

  it('exposes catalog META for all 6 keys (derived, nullable, non-empty example)', () => {
    const controller = new PlaceholdersController();
    for (const key of NEW_KEYS) {
      const entry = controller
        .list('ca')
        .placeholders.find((row) => row.key === key);
      expect(entry).toBeDefined();
      expect(entry?.type).toBe('derived');
      expect(entry?.nullable).toBe(true);
      expect(entry?.example).not.toBe('');
    }
  });

  it('catalog docstring counts are 51 (ca/x/z/bare) and 52 (c/cc)', () => {
    for (const command of ['ca', 'x', 'z', 'bare'] as const) {
      expect(placeholdersFor(command)).toHaveLength(51);
    }
    for (const command of ['c', 'cc'] as const) {
      expect(placeholdersFor(command)).toHaveLength(52);
    }
  });

  describe('headerIcon', () => {
    it('prefers the launchpad icon-link (Solana pump keeps its icon)', () => {
      const resolver: DisplayResolverPort = {
        resolve: (placeholderKey, matchValue) => {
          if (placeholderKey === 'launchpad' && matchValue === 'pump-fun')
            return '💊';
          if (placeholderKey === 'chain' && matchValue === 'bsc') return '🟡';
          return '';
        },
      };
      const token = baseToken({
        launchpad: { id: 'pump-fun', name: 'Pump.fun', url: 'https://p' },
      });
      expect(render('{{headerIcon}}', token, resolver)).toBe('[💊](https://p)');
    });

    it('falls back to the chainDisplay value on BSC (no launchpad)', () => {
      expect(render('{{headerIcon}}', baseToken())).toBe('🟡');
    });

    it('uses the launchpad display-name link when the icon row is absent', () => {
      const resolver: DisplayResolverPort = {
        resolve: (placeholderKey, matchValue) =>
          placeholderKey === 'chain' && matchValue === 'bsc' ? '🟡' : '',
      };
      const token = baseToken({
        launchpad: { id: 'pump-fun', name: 'Pump.fun', url: 'https://p' },
      });
      expect(render('{{headerIcon}}', token, resolver)).toBe(
        '[Pump\\.fun](https://p)',
      );
    });

    it('renders "" when both sources are empty (accepted leading-space caveat, never an invented icon)', () => {
      expect(render('{{headerIcon}}', baseToken(), null)).toBe('');
      // Header composition keeps ONE leading hspace when both are
      // empty — accepted class, documented; the fix is data (a BSC
      // DisplayMap row / a launchpad), never a fabricated emoji.
      expect(render('{{headerIcon}} {{nameLink}}', baseToken(), null)).toBe(
        ' [**Koda**](https://t.me/DexterBot?start=0xd3775c4D5C517AaCAe0CCF906DCD96713b5749cF)',
      );
    });
  });

  describe('liquidityUsdSide (D4: display-only one-side)', () => {
    it('halves the TOTAL liquidity and escapes the money value (KODA 787.253 → 394)', () => {
      expect(
        render('{{liquidityUsdSide}}', baseToken({ liquidityUsd: 787.253 })),
      ).toBe('394');
    });

    it('keeps the core liquidityUsd meaning TOTAL (never overridden)', () => {
      expect(
        render('{{liquidityUsd}}', baseToken({ liquidityUsd: 787.253 })),
      ).toBe('787');
    });

    it('renders N/A for absent or non-finite inputs', () => {
      expect(render('{{liquidityUsdSide}}', baseToken())).toBe('N/A');
      expect(
        render('{{liquidityUsdSide}}', baseToken({ liquidityUsd: Number.NaN })),
      ).toBe('N/A');
    });
  });

  describe('liquidityFlags (D2 ⚠️ + D3 🔒, raw emoji)', () => {
    const flags = (
      liquidityUsd: number | null,
      locked: number | null,
      burned: number | null,
    ): string =>
      render(
        '{{liquidityFlags}}',
        baseToken({
          liquidityUsd,
          lockedLiquidityPercent: locked,
          burnedPercent: burned,
        }),
      );

    it('pins the ⚠️ threshold constant (one-side USD)', () => {
      expect(LOW_LIQUIDITY_SIDE_USD).toBe(1_000);
    });

    it('low + locked (KODA: 787.253 total → 393.6 side, 100% locked) → ` ⚠️🔒`', () => {
      expect(flags(787.253, 100, 0)).toBe(' ⚠️🔒');
    });

    it('low only (no lock data) → ` ⚠️`', () => {
      expect(flags(787.253, null, null)).toBe(' ⚠️');
    });

    it('lock only (side ≥ threshold) → ` 🔒` with ONE leading space', () => {
      expect(flags(10_000, 100, 0)).toBe(' 🔒');
    });

    it('neither → "" (silence, no stray space)', () => {
      expect(flags(10_000, 0, 0)).toBe('');
      expect(flags(10_000, null, null)).toBe('');
    });

    it('burns count toward the lock sum (60% burned, no locked) → ` 🔒`', () => {
      expect(flags(10_000, null, 60)).toBe(' 🔒');
    });

    it('locked + burned sums at the 50% boundary → ` 🔒`', () => {
      expect(flags(10_000, 30, 20)).toBe(' 🔒');
      expect(flags(10_000, 29.9, 20)).toBe('');
    });

    it('the threshold is strict: side exactly $1,000 is not low', () => {
      expect(flags(2_000, null, null)).toBe('');
      expect(flags(1_999, null, null)).toBe(' ⚠️');
    });

    it('non-finite lock inputs never trigger 🔒', () => {
      expect(flags(10_000, Number.NaN, null)).toBe('');
      expect(flags(10_000, null, Number.POSITIVE_INFINITY)).toBe('');
    });
  });

  describe('honeypotBlock (D9: same core, blank line)', () => {
    const HONEYPOT: HoneypotInfo = { sim: 'ok', buy: 0, sell: 2.97 };

    it('lowers the same 🍯 core after a BLANK line', () => {
      expect(
        render('{{honeypotBlock}}', baseToken({ honeypot: HONEYPOT })),
      ).toBe('\n\n🍯 SIM: OK ⋅ T: 0/2\\.97');
    });

    it('renders "" when there is no row (absent / null)', () => {
      expect(render('{{honeypotBlock}}', baseToken())).toBe('');
      expect(render('{{honeypotBlock}}', baseToken({ honeypot: null }))).toBe(
        '',
      );
      expect(
        render(
          '{{honeypotBlock}}',
          baseToken({ honeypot: { sim: 'ok', buy: 0, sell: 0 } }),
        ),
      ).toBe('');
    });

    it('keeps honeypotLine byte-identical (existing templates untouched)', () => {
      expect(
        render('{{honeypotLine}}', baseToken({ honeypot: HONEYPOT })),
      ).toBe('\n🍯 SIM: OK ⋅ T: 0/2\\.97');
    });

    it('composes inline after Age without eating the next line', () => {
      const body = ['📊 Vol: `2`{{ageSuffix}}{{honeypotBlock}}', 'END'].join(
        '\n',
      );
      expect(
        render(body, baseToken({ honeypot: HONEYPOT, pairCreatedAt: PAIR_AT })),
      ).toBe('📊 Vol: `2` ⋅ Age: `7d`\n\n🍯 SIM: OK ⋅ T: 0/2\\.97\nEND');
    });
  });

  describe('ageSuffix (P1-2)', () => {
    it('carries the shared floored age with static backticks', () => {
      expect(
        render('Vol: 2{{ageSuffix}}', baseToken({ pairCreatedAt: PAIR_AT })),
      ).toBe('Vol: 2 ⋅ Age: `7d`');
    });

    it('renders "" (no dangling separator) when the age is unknown', () => {
      expect(render('Vol: 2{{ageSuffix}}', baseToken())).toBe('Vol: 2');
      expect(
        render('Vol: 2{{ageSuffix}}', baseToken({ pairCreatedAt: 'garbage' })),
      ).toBe('Vol: 2');
    });

    it('future pair timestamps clamp to 0m (shared formatter)', () => {
      expect(
        render(
          '{{ageSuffix}}',
          baseToken({ pairCreatedAt: new Date(NOW + 3_600_000).toISOString() }),
        ),
      ).toBe(' ⋅ Age: `0m`');
    });
  });

  describe('nameLink (D8)', () => {
    it('renders the bold link when botStartUrl resolves', () => {
      expect(render('{{nameLink}}', baseToken())).toBe(
        `[**Koda**](${BOT_URL})`,
      );
    });

    it('renders plain bold name without a URL (never `[Koda]()`)', () => {
      expect(render('{{nameLink}}', baseToken(), CHAIN_RESOLVER, null)).toBe(
        '**Koda**',
      );
    });

    it('reuses the {{name}} default: empty name → N/A (escaped once)', () => {
      expect(render('{{nameLink}}', baseToken({ name: '' }))).toBe(
        `[**N/A**](${BOT_URL})`,
      );
      expect(render('{{name}}', baseToken({ name: '' }))).toBe('N/A');
    });

    it('keeps the metadata provenance suffix (`(unverified)`, escaped once)', () => {
      const token = baseToken({
        name: 'Koda',
        identityProvenance: 'metadata',
      });
      expect(render('{{nameLink}}', token)).toBe(
        `[**Koda \\(unverified\\)**](${BOT_URL})`,
      );
      expect(render('{{name}}', token)).toBe('Koda \\(unverified\\)');
    });
  });

  describe('venue display (D12/P0-12: pancakeswap_v2)', () => {
    it('renders `Pancakeswap V2` from the GeckoTerminal dexId', () => {
      const token = baseToken({
        venue: { dexId: 'pancakeswap_v2', labels: [] },
      });
      expect(render('{{chainName}}{{venueSuffixShort}}', token)).toBe(
        'BNB @ Pancakeswap V2',
      );
      expect(render('{{venueLine}}', token)).toBe('Pancakeswap V2');
    });

    it('renders `Pancakeswap V3` from the GeckoTerminal dexId', () => {
      const token = baseToken({
        venue: { dexId: 'pancakeswap_v3', labels: [] },
      });
      expect(render('{{venueLine}}', token)).toBe('Pancakeswap V3');
    });

    it('leaves the plain `pancakeswap` dexId untouched', () => {
      const token = baseToken({ venue: { dexId: 'pancakeswap', labels: [] } });
      expect(render('{{venueLine}}', token)).toBe('Pancakeswap');
      expect(render('{{chainName}}{{venueSuffixShort}}', token)).toBe(
        'BNB @ Pancakeswap',
      );
    });
  });

  it('renders the full KODA target body (structure, honest snapshot values)', () => {
    const body = [
      '{{headerIcon}} {{nameLink}} *[{{fdvUsd}}/{{priceChange24h}}] ${{symbol}}*',
      '🌐 {{chainName}}{{venueSuffixShort}}',
      '💰 USD: `{{priceUsd}}`',
      '💎 FDV: `{{fdvUsd}}` ⇨ `{{fdvAth}}` [`{{fdvAthAgo}}`]',
      '💦 Liq: `{{liquidityUsdSide}}`{{liquidityFlags}}',
      '📊 Vol: `{{volume24hUsd}}`{{ageSuffix}}{{honeypotBlock}}',
    ].join('\n');
    const token = baseToken({
      fdvUsd: 751,
      fdvAthUsd: 2600,
      fdvAthAt: PAIR_AT,
      priceUsd: 0.00007707,
      priceChange24h: 0,
      liquidityUsd: 787.253,
      lockedLiquidityPercent: 100,
      burnedPercent: 0,
      volume24hUsd: 1.5719,
      pairCreatedAt: PAIR_AT,
      honeypot: { sim: 'ok', buy: 0, sell: 2.97 },
      venue: { dexId: 'pancakeswap_v2', labels: [] },
    });
    const out = renderer().render(body, token, 'bare');

    expect(out.text).toBe(
      [
        `🟡 [**Koda**](${BOT_URL}) *[751/0%] $KODA*`,
        '🌐 BNB @ Pancakeswap V2',
        '💰 USD: `0\\.00007707`',
        '💎 FDV: `751` ⇨ `2\\.6K` [`7d`]',
        '💦 Liq: `394` ⚠️🔒',
        '📊 Vol: `2` ⋅ Age: `7d`',
        '',
        '🍯 SIM: OK ⋅ T: 0/2\\.97',
      ].join('\n'),
    );
    expect(out.truncated).toBe(false);
    for (const key of [
      'headerIcon',
      'nameLink',
      'liquidityUsdSide',
      'liquidityFlags',
      'ageSuffix',
      'honeypotBlock',
    ]) {
      expect(out.placeholdersUsed).toContain(key);
    }
  });
});
