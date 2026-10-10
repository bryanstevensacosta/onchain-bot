import type {
  LaunchpadInfo,
  ResolvedToken,
} from '@/scan/domain/ports/scan-pipeline.port';
import {
  TemplateRendererService,
  resolveLaunchpadDisplayName,
} from '@/placeholders/application/template-renderer.service';
import type { DisplayResolverPort } from '@/placeholders/application/template-renderer.service';

const MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';
const PUMP: LaunchpadInfo = {
  id: 'pump-fun',
  name: 'Pump.fun',
  url: `https://pump.fun/coin/${MINT}`,
};

const tokenWith = (launchpad: LaunchpadInfo | null): ResolvedToken => ({
  address: MINT,
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
  launchpad,
});

const nameResolver = (display: string): DisplayResolverPort => ({
  resolve: (placeholderKey: string, matchValue: string) =>
    placeholderKey === 'launchpadName' && matchValue === 'pump-fun'
      ? display
      : '',
});

describe('TemplateRendererService launchpad display-name override', () => {
  it('override wins on launchpadText while id stays canonical', () => {
    const renderer = new TemplateRendererService(nameResolver('Pump'));
    const out = renderer.render('{{launchpadText}}', tokenWith(PUMP), 'ca');
    expect(out.text).toBe('Pump');
    expect(PUMP.id).toBe('pump-fun');
  });

  it('falls back to detector name when no row exists', () => {
    const renderer = new TemplateRendererService(nameResolver(''));
    const out = renderer.render('{{launchpadText}}', tokenWith(PUMP), 'ca');
    expect(out.text).toBe('Pump\\.fun');
  });

  it('falls back to detector name when no resolver is injected', () => {
    const renderer = new TemplateRendererService();
    const out = renderer.render('{{launchpadText}}', tokenWith(PUMP), 'ca');
    expect(out.text).toBe('Pump\\.fun');
  });

  it.each([[''], ['   ']])(
    'whitespace/empty display %j falls back, never blank',
    (display) => {
      const renderer = new TemplateRendererService(nameResolver(display));
      const out = renderer.render('{{launchpadText}}', tokenWith(PUMP), 'ca');
      expect(out.text).toBe('Pump\\.fun');
      expect(out.text).not.toBe('');
    },
  );

  it('launchpadTextLink text consumes the override', () => {
    const renderer = new TemplateRendererService(nameResolver('Pump'));
    const out = renderer.render('{{launchpadTextLink}}', tokenWith(PUMP), 'ca');
    expect(out.text).toBe(`[Pump](https://pump.fun/coin/${MINT})`);
    expect(PUMP.id).toBe('pump-fun');
  });

  it('launchpadIconLink fallback text consumes the override', () => {
    const iconAndName: DisplayResolverPort = {
      resolve: (placeholderKey: string, matchValue: string) => {
        if (placeholderKey === 'launchpad' && matchValue === 'pump-fun')
          return '';
        if (placeholderKey === 'launchpadName' && matchValue === 'pump-fun')
          return 'Pump';
        return '';
      },
    };
    const renderer = new TemplateRendererService(iconAndName);
    const out = renderer.render('{{launchpadIconLink}}', tokenWith(PUMP), 'ca');
    expect(out.text).toBe(`[Pump](https://pump.fun/coin/${MINT})`);
  });

  it('venue consumes the override on the origin branch', () => {
    const renderer = new TemplateRendererService(nameResolver('Pump'));
    const out = renderer.render('{{venue}}', tokenWith(PUMP), 'ca');
    expect(out.text).toBe('Pump');
  });

  it('venueLine consumes the override on the origin branch', () => {
    const renderer = new TemplateRendererService(nameResolver('Pump'));
    const token: ResolvedToken = {
      ...tokenWith(PUMP),
      venue: { dexId: 'raydium', labels: [] },
    };
    const out = renderer.render('{{venueLine}}', token, 'ca');
    expect(out.text).toBe('Pump via Raydium');
  });

  it('helper resolves case-insensitively via the live resolver contract', () => {
    const live: DisplayResolverPort = {
      resolve: (placeholderKey: string, matchValue: string) =>
        placeholderKey.trim() === 'launchpadName' &&
        matchValue.trim().toLowerCase() === 'pump-fun'
          ? 'Pump'
          : '',
    };
    expect(
      resolveLaunchpadDisplayName({ ...PUMP, id: '  PUMP-FUN  ' }, live),
    ).toBe('Pump');
  });

  it('helper returns empty for null launchpad', () => {
    expect(resolveLaunchpadDisplayName(null, nameResolver('Pump'))).toBe('');
    expect(resolveLaunchpadDisplayName(undefined, nameResolver('Pump'))).toBe(
      '',
    );
  });
});
