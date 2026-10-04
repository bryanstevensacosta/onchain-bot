import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';
import { TEMPLATE_COMMANDS } from '@/placeholders/domain/placeholder-registry';
import { PlaceholdersController } from '@/placeholders/api/http/placeholders.controller';

const EVM = '0xFf8104251E7761163faC3211eF5583FB3F8583d6';

function baseToken(overrides: Partial<ResolvedToken> = {}): ResolvedToken {
  return {
    address: EVM,
    chain: 'base',
    symbol: 'VIRT',
    name: 'Virtuals',
    marketCapUsd: null,
    fdvUsd: null,
    priceUsd: null,
    priceChange24h: null,
    liquidityUsd: 9000,
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

describe('TemplateRendererService alternatives key (plan todo 17)', () => {
  it('whitelists alternatives on every command', () => {
    for (const command of TEMPLATE_COMMANDS) {
      const keys = new PlaceholdersController()
        .list(command)
        .placeholders.map((row) => row.key);
      expect(keys).toContain('alternatives');
    }
  });

  it('exposes META for the key', () => {
    const entry = new PlaceholdersController()
      .list('ca')
      .placeholders.find((row) => row.key === 'alternatives');
    expect(entry?.type).toBe('derived');
    expect(entry?.example).toBe('Also on: bsc, eth');
  });

  it('renders empty when the token resolved alone (no alternatives)', () => {
    expect(render('[{{alternatives}}]', baseToken())).toBe('[]');
    expect(render('[{{alternatives}}]', baseToken({ alternatives: [] }))).toBe(
      '[]',
    );
  });

  it('renders one alternative chain as resolved (single, no trailing comma)', () => {
    const token = baseToken({
      alternatives: [{ chain: 'bsc', address: EVM, liquidityUsd: 100 }],
    });
    expect(render('{{alternatives}}', token)).toBe('Also on: bsc');
  });

  it('renders several alternatives comma-space joined in pick-rule order', () => {
    const token = baseToken({
      alternatives: [
        { chain: 'bsc', address: EVM, liquidityUsd: 5000 },
        { chain: 'ethereum', address: EVM, liquidityUsd: 100 },
      ],
    });
    expect(render('{{alternatives}}', token)).toBe('Also on: bsc, ethereum');
  });

  it('never self-lists: the picked chain is excluded by construction', () => {
    const token = baseToken({
      chain: 'base',
      alternatives: [{ chain: 'bsc', address: EVM, liquidityUsd: 100 }],
    });
    const out = render('{{alternatives}}', token);
    expect(out).toBe('Also on: bsc');
    expect(out).not.toContain('base');
  });
});
