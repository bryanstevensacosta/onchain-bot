import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';
import {
  TEMPLATE_COMMANDS,
  placeholdersFor,
} from '@/placeholders/domain/placeholder-registry';
import { PlaceholdersController } from '@/placeholders/api/http/placeholders.controller';

const MINT_6E8 = '6e8LLHh9mDfhVnxyGHx3q7K3b8pQr4t2vWnZxY1aBcDeFgHiJk';
const HUMA = '0x925061143Df8D59f5EB980A8cA33d649f0a4B4aC7';
const ADDR_FF81 = '0xFf81c1fB997478e08A0e0A0e0A0e0A0e0A0e0A0e0A';
const JUP = 'JUPyiwrYJFskUPiHa7hVuNQPiyaPZ3ar1ZkL6vwdB';

function baseToken(overrides: Partial<ResolvedToken> = {}): ResolvedToken {
  return {
    address: MINT_6E8,
    chain: 'solana',
    symbol: 'TKN',
    name: 'Token',
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

describe('TemplateRendererService venue keys (plan todo 14)', () => {
  it('whitelists the 4 venue keys on every command', () => {
    for (const command of TEMPLATE_COMMANDS) {
      const keys = placeholdersFor(command);
      expect(keys).toEqual(
        expect.arrayContaining([
          'chainName',
          'venue',
          'venueTech',
          'venueLine',
        ]),
      );
    }
  });

  it('exposes META for all 4 keys', () => {
    const controller = new PlaceholdersController();
    const keys = controller.list('ca').placeholders.map((entry) => entry.key);
    for (const key of ['chainName', 'venue', 'venueTech', 'venueLine']) {
      expect(keys).toContain(key);
      const entry = controller
        .list('ca')
        .placeholders.find((row) => row.key === key);
      expect(entry?.type).toBe('derived');
      expect(entry?.example).not.toBe('');
    }
  });

  it.each([
    ['solana', 'Solana'],
    ['ethereum', 'Ethereum'],
    ['bnb', 'BNB'],
    ['base', 'Base'],
    ['arbitrum', 'Arbitrum'],
    ['polygon', 'Polygon'],
    ['robinhood', 'Robinhood'],
    ['unichain', 'Unichain'],
    ['SOLANA', 'Solana'],
  ])('chainName %s → %s', (chain, expected) => {
    expect(render('{{chainName}}', baseToken({ chain: chain as never }))).toBe(
      expected,
    );
  });

  it.each([['bsc'], ['unknown'], ['fantom'], ['ton'], ['']])(
    'chainName %s → empty (never the raw slug)',
    (chain) => {
      expect(
        render('{{chainName}}', baseToken({ chain: chain as never })),
      ).toBe('');
    },
  );

  it.each([
    ['pancakeswap', 'Pancakeswap'],
    ['raydium', 'Raydium'],
    ['orca', 'Orca'],
    ['meteora', 'Meteora'],
    ['pumpswap', 'PumpSwap'],
    ['uniswap', 'Uniswap'],
    ['baseline', 'Baseline'],
    ['fourmeme', 'FourMeme'],
    ['meteoradbc', 'Meteoradbc'],
    ['clanker', 'Clanker'],
    ['some-new-dex', 'Some\\-new\\-dex'],
  ])('dex table %s → %s', (dexId, expected) => {
    const token = baseToken({ venue: { dexId, labels: [] } });
    expect(render('{{venueTech}}', token)).toBe(expected);
  });

  it.each([
    ['pancakeswap', ['v3'], 'Pancakeswap V3'],
    ['orca', ['wp'], 'Orca WP'],
    ['orca', ['CPMM'], 'Orca CPMM'],
    ['uniswap', ['v4'], 'Uniswap V4'],
    ['baseline', [], 'Baseline'],
    ['pancakeswap', ['v3', 'extra'], 'Pancakeswap V3 EXTRA'],
    ['pancakeswap', ['  '], 'Pancakeswap'],
    ['raydium', ['CLMM'], 'Raydium CLMM'],
  ])('labels %s %j → %s', (dexId, labels, expected) => {
    const token = baseToken({ venue: { dexId, labels } });
    expect(render('{{venueTech}}', token)).toBe(expected);
  });

  it('venue renders the origin when known, ignoring the DEX display entirely', () => {
    const token = baseToken({
      launchpad: {
        id: 'raydium-launchlab',
        name: 'LaunchLab',
        url: 'https://raydium.io/launchlab',
      },
      venue: { dexId: 'raydium', labels: [] },
    });
    expect(render('{{venue}}', token)).toBe('LaunchLab');
    expect(render('{{venue}}', token)).not.toContain('Raydium');
    expect(render('{{venueTech}}', token)).toBe('Raydium');
  });

  it('venue falls back to DexDisplay + labels without an origin', () => {
    const token = baseToken({
      launchpad: null,
      venue: { dexId: 'pancakeswap', labels: ['v3'] },
    });
    expect(render('{{venue}}', token)).toBe('Pancakeswap V3');
  });

  it('venue is empty with neither origin nor tech', () => {
    expect(
      render('{{venue}}', baseToken({ launchpad: null, venue: null })),
    ).toBe('');
  });

  it.each([
    [
      'origin + tech-different',
      { id: 'l', name: 'LaunchLab', url: 'https://x' },
      { dexId: 'raydium', labels: [] },
      'LaunchLab via Raydium',
    ],
    [
      'origin-only',
      { id: 'l', name: 'LaunchLab', url: 'https://x' },
      null,
      'LaunchLab',
    ],
    [
      'tech-only',
      null,
      { dexId: 'pancakeswap', labels: ['v3'] },
      'Pancakeswap V3',
    ],
    ['neither', null, null, ''],
  ])('venueLine %s', (_label, launchpad, venue, expected) => {
    const token = baseToken({
      launchpad: launchpad as never,
      venue: venue as never,
    });
    expect(render('{{venueLine}}', token)).toBe(expected);
  });

  it('venueLine collapses origin === tech to the single name', () => {
    const token = baseToken({
      launchpad: { id: 'm', name: 'Meteora', url: 'https://x' },
      venue: { dexId: 'meteora', labels: [] },
    });
    expect(render('{{venueLine}}', token)).toBe('Meteora');
  });

  it('Conway deviation: origin Bankr wins over tech Clanker V4', () => {
    const token = baseToken({
      launchpad: { id: 'bankr', name: 'Bankr', url: 'https://bankr.bot' },
      venue: { dexId: 'clanker', labels: ['v4'] },
    });
    expect(render('{{venue}}', token)).toBe('Bankr');
    expect(render('{{venueTech}}', token)).toBe('Clanker V4');
    expect(render('{{venueLine}}', token)).toBe('Bankr via Clanker V4');
  });

  it('keeps dexId and launchpad.id in separate tables (meteoradbc vs meteora-dbc)', () => {
    const token = baseToken({
      launchpad: {
        id: 'meteora-dbc',
        name: 'Meteora DBC',
        url: 'https://meteora.ag',
      },
      venue: { dexId: 'meteoradbc', labels: [] },
    });
    expect(render('{{venue}}', token)).toBe('Meteora DBC');
    expect(render('{{venueTech}}', token)).toBe('Meteoradbc');
    expect(render('{{venueTech}}', token)).not.toBe('Meteora DBC');
  });

  it('never consults the launchpad table for the tech side', () => {
    const token = baseToken({
      launchpad: { id: 'meteora-dbc', name: 'Meteora DBC', url: 'https://x' },
      venue: null,
    });
    expect(render('{{venueTech}}', token)).toBe('');
    expect(render('{{venueLine}}', token)).toBe('Meteora DBC');
  });

  it.each([
    ['6e8LLH Solana LaunchLab', 'solana', MINT_6E8, 'Solana @ LaunchLab'],
    ['0x9251 BNB Pancakeswap V3', 'bnb', HUMA, 'BNB @ Pancakeswap V3'],
    ['0xFf81 Base Virtuals', 'base', ADDR_FF81, 'Base @ Virtuals'],
    ['robinhood Virtuals', 'robinhood', ADDR_FF81, 'Robinhood @ Virtuals'],
  ])('fixture %s', (_label, chain, address, expected) => {
    const withOrigin =
      expected.endsWith('LaunchLab') || expected.endsWith('Virtuals');
    const token = baseToken({
      address,
      chain: chain as never,
      launchpad: withOrigin
        ? {
            id: expected.endsWith('LaunchLab') ? 'launchlab' : 'virtuals',
            name: expected.endsWith('LaunchLab') ? 'LaunchLab' : 'Virtuals',
            url: 'https://example.com',
          }
        : null,
      venue:
        expected === 'BNB @ Pancakeswap V3'
          ? { dexId: 'pancakeswap', labels: ['v3'] }
          : null,
    });
    expect(
      new TemplateRendererService().render(
        '{{chainName}} @ {{venueLine}}',
        token,
        'ca',
      ).text,
    ).toBe(expected);
  });

  it('JUP-null renders the whole venue line empty (no dangling @)', () => {
    const token = baseToken({
      address: JUP,
      chain: 'solana',
      launchpad: null,
      venue: null,
    });
    expect(
      new TemplateRendererService().render(
        '{{chainName}} @ {{venueLine}}',
        token,
        'ca',
      ).text,
    ).toBe('');
  });

  it('cleans dangling @ remnants like the •/| family', () => {
    const clean = TemplateRendererService.cleanupDanglingSeparators;
    expect(clean('Solana @ ')).toBe('');
    expect(clean('Solana @')).toBe('');
    expect(clean(' @ X')).toBe('X');
    expect(clean('@ X')).toBe('X');
    expect(clean('a@b.com')).toBe('a@b.com');
    expect(clean('a @ b')).toBe('a @ b');
    expect(clean('Solana @ LaunchLab')).toBe('Solana @ LaunchLab');
  });

  it('drops a dangling-@ line but keeps its neighbours', () => {
    const clean = TemplateRendererService.cleanupDanglingSeparators;
    expect(clean('Price 5\nSolana @ \nLinks')).toBe('Price 5\n\nLinks');
  });
});
