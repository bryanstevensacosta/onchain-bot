import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';
import {
  TemplateRendererService,
  isBotStartPayload,
} from '@/placeholders/application/template-renderer.service';
import { BotIdentityService } from '@/settings/application/bot-identity.service';

const EVM = '0x1234567890abcdef1234567890abcdef12345678';
const SOL = 'So11111111111111111111111111111111111111112';

const TOKEN: ResolvedToken = {
  address: SOL,
  chain: 'solana',
  symbol: 'SOL',
  name: 'Solana',
  marketCapUsd: 1_000_000,
  fdvUsd: 2_000_000,
  priceUsd: 100,
  priceChange24h: 5,
  liquidityUsd: 50_000,
  lockedLiquidityPercent: null,
  burnedPercent: null,
  volume24hUsd: 10_000,
  holders: 1000,
  top10HolderPercent: 10,
  top20HolderPercent: 20,
  totalSupply: null,
  circulatingSupply: null,
  maxSupply: null,
  devWallets: null,
  devPctSupply: null,
  poolAddress: null,
  source: 'market-data-http',
};

function withUsername(username: string): TemplateRendererService {
  const identity = {
    getUsername: () => username,
  } as unknown as BotIdentityService;
  return new TemplateRendererService(null, identity);
}

describe('botStartUrl (todo 11 deep-link key)', () => {
  it('renders the exact t.me URL with the resolved username', () => {
    const out = withUsername('TestBot').render(
      'Open {{botStartUrl}}',
      TOKEN,
      'ca',
    );
    expect(out.text).toBe(`Open https://t.me/TestBot?start=${SOL}`);
    expect(out.placeholdersUsed).toContain('botStartUrl');
  });

  it('renders the EVM address payload verbatim (42 chars fit)', () => {
    const out = withUsername('TestBot').render(
      '{{botStartUrl}}',
      { ...TOKEN, address: EVM },
      'x',
    );
    expect(out.text).toBe(`https://t.me/TestBot?start=${EVM}`);
  });

  it('renders "" without a username (identity unresolved)', () => {
    const renderer = new TemplateRendererService(null, null);
    const out = renderer.render('Open {{botStartUrl}}', TOKEN, 'ca');
    expect(out.text).toBe('Open ');
    expect(out.placeholdersUsed).toContain('botStartUrl');
  });

  it('renders "" without an injected identity service', () => {
    const renderer = new TemplateRendererService(null);
    const out = renderer.render('{{botStartUrl}}', TOKEN, 'bare');
    expect(out.text).toBe('');
  });

  it('renders "" for a >64-char payload (never silently truncates)', () => {
    const out = withUsername('TestBot').render(
      '{{botStartUrl}}',
      { ...TOKEN, address: `${SOL}${SOL}` },
      'ca',
    );
    expect(out.text).toBe('');
  });

  it('renders "" for payload chars outside [A-Za-z0-9_-]', () => {
    const out = withUsername('TestBot').render(
      '{{botStartUrl}}',
      { ...TOKEN, address: 'not an address!' },
      'ca',
    );
    expect(out.text).toBe('');
  });

  it('is known on every command (address-carrying templates)', () => {
    for (const command of ['ca', 'x', 'z', 'c', 'cc', 'bare'] as const) {
      const out = withUsername('TestBot').render(
        '{{botStartUrl}}',
        TOKEN,
        command,
      );
      expect(out.text).toBe(`https://t.me/TestBot?start=${SOL}`);
    }
  });
});

describe('botStartUrl composition (raw URL key, authors compose links)', () => {
  it('[{{name}}]({{botStartUrl}}) renders the named deep-link', () => {
    const out = withUsername('TestBot').render(
      '[{{name}}]({{botStartUrl}})',
      TOKEN,
      'ca',
    );
    expect(out.text).toBe(`[Solana](https://t.me/TestBot?start=${SOL})`);
    expect(out.placeholdersUsed).toContain('botStartUrl');
    expect(out.placeholdersUsed).toContain('name');
  });

  it('[o]({{botStartUrl}}) renders the Rick-style short link', () => {
    const out = withUsername('TestBot').render(
      '[o]({{botStartUrl}})',
      TOKEN,
      'ca',
    );
    expect(out.text).toBe(`[o](https://t.me/TestBot?start=${SOL})`);
    expect(out.placeholdersUsed).toContain('botStartUrl');
  });
});

describe('isBotStartPayload (Bot API start rules)', () => {
  it('accepts EVM (42) and Solana (44) addresses', () => {
    expect(isBotStartPayload(EVM)).toBe(true);
    expect(isBotStartPayload(SOL)).toBe(true);
  });

  it('rejects empty, >64-char, and out-of-alphabet payloads', () => {
    expect(isBotStartPayload('')).toBe(false);
    expect(isBotStartPayload('a'.repeat(65))).toBe(false);
    expect(isBotStartPayload('a'.repeat(64))).toBe(true);
    expect(isBotStartPayload('has space')).toBe(false);
    expect(isBotStartPayload('semi;colon')).toBe(false);
    expect(isBotStartPayload('0xABCDEF1234-_')).toBe(true);
  });
});
