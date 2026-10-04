import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';
import {
  TEMPLATE_MAX_LENGTH,
  TemplateRendererService,
  UnknownPlaceholder,
  UnsupportedTemplateSyntax,
} from '@/placeholders/application/template-renderer.service';
import type { DisplayResolverPort } from '@/placeholders/application/template-renderer.service';
import {
  PLACEHOLDERS_BY_COMMAND,
  placeholdersFor,
} from '@/placeholders/domain/placeholder-registry';
import type { TemplateCommand } from '@/placeholders/domain/placeholder-registry';

const TOKEN: ResolvedToken = {
  address: 'So11111111111111111111111111111111111111112',
  chain: 'solana',
  symbol: 'SOL',
  name: 'Solana',
  marketCapUsd: 80_000_000_000,
  fdvUsd: 95_000_000_000,
  priceUsd: 164.32,
  priceChange24h: 2.5,
  liquidityUsd: 12_000_000,
  lockedLiquidityPercent: 80,
  burnedPercent: 5,
  volume24hUsd: 2_500_000_000,
  holders: 1_200_000,
  top10HolderPercent: 12.5,
  top20HolderPercent: 18.75,
  totalSupply: 600_000_000,
  circulatingSupply: 480_000_000,
  maxSupply: null,
  devWallets: [
    {
      wallet: 'DevWallet1111111111111111111111111111111111',
      holdAmount: null,
      percentOfSupply: 1.25,
      pnlUsd: null,
      tag: null,
    },
  ],
  devPctSupply: 1.25,
  poolAddress: 'Pool111111111111111111111111111111111111111',
  source: 'market-data-http',
};

const NULL_TOKEN: ResolvedToken = {
  ...TOKEN,
  priceUsd: null,
  priceChange24h: null,
  marketCapUsd: null,
  fdvUsd: null,
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
  devPctSupply: null,
  devWallets: null,
  poolAddress: null,
};

const stubResolver = (display: string): DisplayResolverPort => ({
  resolve: (placeholderKey: string, matchValue: string) =>
    placeholderKey === 'chain' && matchValue === 'solana' ? display : '',
});

const RICK_BODY = [
  '{{chainDisplay}} *${{symbol}}* \\| {{name}} — {{chain}}',
  '`{{address}}`',
  '',
  '💰 {{priceUsd}} \\({{priceChange24h}}\\) • MC {{marketCapUsd}} • Liq {{liquidityUsd}}',
  '📦 FDV {{fdvUsd}} • Vol {{volume24hUsd}}',
  '👥 Holders {{holders}} • Top 10 {{top10HolderPercent}} • {{devLine}}',
  '',
  '🔗 {{scanLinks}}',
  '{{tradeHint}}',
].join('\n');

describe('TemplateRendererService (todo 4 closed semantics)', () => {
  it('renders a Rick-style body to MarkdownV2 within 4096 chars', () => {
    const renderer = new TemplateRendererService(stubResolver('🟣'));
    const out = renderer.render(RICK_BODY, TOKEN, 'ca');
    expect(out.text).toContain('🟣');
    expect(out.text).toContain('$SOL');
    expect(out.text).toContain('So11111111111111111111111111111111111111112');
    expect(out.text).toContain('dexscreener.com/solana/');
    expect(out.text).toContain('geckoterminal.com/solana/pools/');
    expect(out.text).toContain('Dev 1\\.25%');
    expect(out.truncated).toBe(false);
    expect(out.text.length).toBeLessThanOrEqual(TEMPLATE_MAX_LENGTH);
    expect(out.placeholdersUsed).toEqual(
      expect.arrayContaining([
        'symbol',
        'chainDisplay',
        'devLine',
        'scanLinks',
      ]),
    );
  });

  it('throws UnknownPlaceholder carrying the valid list ({{precio}})', () => {
    const renderer = new TemplateRendererService(stubResolver('🟣'));
    let caught: unknown;
    try {
      renderer.render('Precio: {{precio}}', TOKEN, 'ca');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UnknownPlaceholder);
    const err = caught as UnknownPlaceholder;
    expect(err.key).toBe('precio');
    expect(err.valid).toEqual(PLACEHOLDERS_BY_COMMAND.ca);
    expect(err.message).toContain('{{precio}}');
    expect(err.message).toContain('symbol');
  });

  it('maps null numerics to N/A and empty dev to Dev N/A', () => {
    const renderer = new TemplateRendererService(stubResolver('🟣'));
    const out = renderer.render(
      '{{priceUsd}} {{holders}} {{poolAddress}} {{devLine}} {{devWallets}}',
      NULL_TOKEN,
      'x',
    );
    expect(out.text).toContain('N/A');
    expect(out.text).toContain('Dev N/A');
    expect(out.truncated).toBe(false);
  });

  it('escapes each value exactly once (. and () get one backslash; $ passes raw per shared escapeV2)', () => {
    const renderer = new TemplateRendererService(stubResolver(''));
    const out = renderer.render(
      '{{symbol}}',
      { ...TOKEN, symbol: 'A.B (C)' },
      'ca',
    );
    expect(out.text).toBe('A\\.B \\(C\\)');
    expect(out.text).not.toContain('\\\\');
    // Rick parity: money carries NO `$` — `$` is literal body text now.
    const money = renderer.render(
      '{{priceUsd}}',
      { ...TOKEN, priceUsd: 164.32 },
      'ca',
    );
    expect(money.text).toBe('164\\.32');
    expect(money.text).not.toContain('\\\\');
    expect(money.text).not.toContain('$');
  });

  it('truncates a 5000-char body with the shared marker', () => {
    const renderer = new TemplateRendererService(stubResolver(''));
    const long = `${'A'.repeat(4990)}\n{{symbol}}`;
    expect(long.length).toBeGreaterThan(5000 - 20);
    const out = renderer.render(long, TOKEN, 'z');
    expect(out.truncated).toBe(true);
    expect(out.text.length).toBeLessThanOrEqual(TEMPLATE_MAX_LENGTH);
    expect(out.text).toContain('(truncated)');
  });

  it('rejects {{timeframe}} outside c/cc but renders it inside c/cc', () => {
    const renderer = new TemplateRendererService(stubResolver(''));
    expect(() => renderer.render('Chart ({{timeframe}})', TOKEN, 'ca')).toThrow(
      UnknownPlaceholder,
    );
    expect(() => renderer.render('Chart ({{timeframe}})', TOKEN, 'z')).toThrow(
      UnknownPlaceholder,
    );
    const okC = renderer.render(
      'Chart ({{timeframe}}): {{dexscreenerUrl}}',
      { ...TOKEN, timeframe: '1h' },
      'c',
    );
    expect(okC.text).toContain('1h');
    expect(okC.text).toContain('dexscreener.com');
    const okCc = renderer.render(
      '{{timeframe}}',
      { ...TOKEN, timeframe: '4h' },
      'cc',
    );
    expect(okCc.text).toBe('4h');
  });

  it('throws on conditionals/loops/filters syntax', () => {
    const renderer = new TemplateRendererService(stubResolver(''));
    expect(() =>
      renderer.render('{{#if symbol}}x{{/if}}', TOKEN, 'ca'),
    ).toThrow(UnsupportedTemplateSyntax);
    expect(() =>
      renderer.render('{% if x %}y{% endif %}', TOKEN, 'ca'),
    ).toThrow(UnsupportedTemplateSyntax);
  });

  it('cleans dangling separators left by empty derived values', () => {
    const renderer = new TemplateRendererService();
    const out = renderer.render('Stats • {{chainDisplay}}\nNext', TOKEN, 'ca');
    expect(out.text).not.toContain('•');
    expect(out.text).toContain('Stats');
    expect(out.text).toContain('Next');
  });

  it('falls back to "" when no display resolver is injected', () => {
    const renderer = new TemplateRendererService();
    const out = renderer.render('[{{chainDisplay}}] {{symbol}}', TOKEN, 'bare');
    expect(out.text).toBe('[] SOL');
  });

  it('fuzzes 50 bodies with unknown keys: every error carries the valid list', () => {
    const commands: TemplateCommand[] = ['ca', 'x', 'z', 'c', 'cc', 'bare'];
    for (let i = 0; i < 50; i += 1) {
      const command = commands[i % commands.length];
      const expected = placeholdersFor(command);
      const renderer = new TemplateRendererService(stubResolver('🟣'));
      let caught: unknown;
      try {
        renderer.render(`row-${i} {{unknown${i}}} tail`, TOKEN, command);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(UnknownPlaceholder);
      expect((caught as UnknownPlaceholder).key).toBe(`unknown${i}`);
      expect((caught as UnknownPlaceholder).valid).toEqual(expected);
    }
  });
});

describe('Rick-parity number policy (plan todo 13, evidence examples.md)', () => {
  const policyRenderer = (): TemplateRendererService =>
    new TemplateRendererService(stubResolver('🟣'));

  it.each([
    [23_300, '23\\.3K'],
    [7_900, '7\\.9K'],
    [1_460_000_000, '1\\.46B'],
    [80_000_000_000, '80B'],
    [12_900, '12\\.9K'],
    [752, '752'],
    [983.78, '983\\.78'],
    [94.31, '94\\.31'],
  ])('money %p renders compact without `$`: %p', (value, expected) => {
    const out = policyRenderer().render(
      '{{marketCapUsd}}',
      { ...TOKEN, marketCapUsd: value },
      'ca',
    );
    expect(out.text).toBe(expected);
    expect(out.text).not.toContain('$');
  });

  it.each([
    [0.00002434, '0\\.00002434'],
    [0.00004128, '0\\.00004128'],
    [0.00000086, '0\\.00000086'],
    [0.002345, '0\\.002345'],
    [3457, '3,457'],
    [164.32, '164\\.32'],
    [100, '100'],
  ])(
    'priceUsd %p renders adaptive (dust full digits, never `$0.00`)',
    (value, expected) => {
      const out = policyRenderer().render(
        'USD: {{priceUsd}}',
        { ...TOKEN, priceUsd: value },
        'ca',
      );
      expect(out.text).toBe(`USD: ${expected}`);
    },
  );

  it.each([
    [80, '80%'],
    [-34.4, '\\-34\\.4%'],
    [2.5, '2\\.5%'],
    [5, '5%'],
    [-100, '\\-100%'],
  ])(
    'percent %p renders trimmed with sign only when negative',
    (value, expected) => {
      const out = policyRenderer().render(
        '{{priceChange24h}}',
        { ...TOKEN, priceChange24h: value },
        'ca',
      );
      expect(out.text).toBe(expected);
      expect(out.text).not.toContain('+');
    },
  );

  it.each([[-0], [-0.04], [0]])(
    'percent %p normalizes negative zero to `0%`',
    (value) => {
      const out = policyRenderer().render(
        '{{priceChange24h}}',
        { ...TOKEN, priceChange24h: value },
        'ca',
      );
      expect(out.text).toBe('0%');
    },
  );

  it('Rick evidence body renders `[23.3K/80%]` + `USD: 0.00002434` + `Liq: 7.9K`', () => {
    const out = policyRenderer().render(
      '[{{marketCapUsd}}/{{priceChange24h}}]\nUSD: {{priceUsd}}\nLiq: {{liquidityUsd}}',
      {
        ...TOKEN,
        marketCapUsd: 23_300,
        priceChange24h: 80,
        priceUsd: 0.00002434,
        liquidityUsd: 7_900,
      },
      'ca',
    );
    expect(out.text).toBe('[23\\.3K/80%]\nUSD: 0\\.00002434\nLiq: 7\\.9K');
  });

  it('Proficy style gets `$` from literal body text (`MC: $27.3K`)', () => {
    const out = policyRenderer().render(
      '**MC:** ${{marketCapUsd}}',
      { ...TOKEN, marketCapUsd: 27_300 },
      'ca',
    );
    expect(out.text).toBe('**MC:** $27\\.3K');
  });

  it('KOLscope style gets `$` from literal body text (`MC $30.22K`)', () => {
    const out = policyRenderer().render(
      '`MC` **${{marketCapUsd}}**',
      { ...TOKEN, marketCapUsd: 30_220 },
      'ca',
    );
    expect(out.text).toBe('`MC` **$30\\.22K**');
  });

  it('Soul dust renders plain (`USD: 0.00004128`, never `$0.00`)', () => {
    const out = policyRenderer().render(
      '`USD:` **{{priceUsd}}**',
      { ...TOKEN, priceUsd: 0.00004128 },
      'ca',
    );
    expect(out.text).toBe('`USD:` **0\\.00004128**');
  });

  it('nulls still render `N/A` on every numeric key', () => {
    const out = policyRenderer().render(
      '{{priceUsd}} {{marketCapUsd}} {{priceChange24h}} {{holders}}',
      NULL_TOKEN,
      'ca',
    );
    expect(out.text).toBe('N/A N/A N/A N/A');
  });
});
