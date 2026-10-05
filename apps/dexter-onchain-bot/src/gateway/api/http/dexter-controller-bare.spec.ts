import { DexterController } from './dexter.controller';
import { TemplateRendererService } from '@/placeholders/application/template-renderer.service';
import { MessageTemplate } from '@/templates/domain/message-template.entity';
import type { ResolvedToken } from '@/scan/domain/ports/scan-pipeline.port';

const SOL = 'So11111111111111111111111111111111111111112';

const TOKEN: ResolvedToken = {
  address: SOL,
  chain: 'solana',
  symbol: 'TKN',
  name: 'Token',
  marketCapUsd: null,
  fdvUsd: null,
  priceUsd: 1,
  priceChange24h: null,
  liquidityUsd: null,
  lockedLiquidityPercent: null,
  burnedPercent: null,
  volume24hUsd: null,
  holders: null,
  top10HolderPercent: null,
  top20HolderPercent: null,
  poolAddress: null,
  source: 'market-data-http',
};

function makeController(
  outcome: unknown,
  templates?: unknown,
  renderer?: unknown,
) {
  const pipeline = { resolveDetailed: async () => outcome };
  const formatter = {
    format: () => 'CARD',
    formatScanCard: () => ({
      text: 'SCAN-CARD',
      truncated: false,
      parseMode: 'MarkdownV2',
    }),
  };
  return new DexterController(
    pipeline as never,
    formatter as never,
    templates as never,
    renderer as never,
  );
}

const ACTIVE_CA = MessageTemplate.create({
  command: 'ca',
  name: 'full-dexter-v1',
  bodyMarkdown: '$${{symbol}} | {{name}}',
});

describe('DexterController bare-address lookup (explicit errors, no silent guess)', () => {
  it('returns the card for a resolved bare address', async () => {
    const controller = makeController({ status: 'resolved', token: TOKEN });
    const body = (await controller.getToken(SOL)) as Record<string, unknown>;
    expect(body['address']).toBe(SOL);
    expect(body['text']).toBe('CARD');
    expect(body['scanCard']).toBe('SCAN-CARD');
    expect(body['scanCardParseMode']).toBe('MarkdownV2');
    expect(body['templateUsed']).toBeNull();
  });

  it('names every candidate for the zero-candidate ambiguous shape', async () => {
    const controller = makeController({
      status: 'ambiguous',
      address: '0xabc',
      candidates: ['ethereum', 'base'],
    });
    const body = (await controller.getToken('0xabc')) as Record<
      string,
      unknown
    >;
    expect(String(body['error'])).toMatch(/mbiguous/);
    expect(body['candidates']).toEqual(['ethereum', 'base']);
  });

  it('rejects garbage with an explicit invalid error', async () => {
    const controller = makeController({
      status: 'invalid',
      address: 'hello',
      reason: 'unrecognized address format',
    });
    const body = (await controller.getToken('hello')) as Record<
      string,
      unknown
    >;
    expect(String(body['error'])).toMatch(/nvalid/);
  });

  it('keeps the explicit not-found error when nothing matches', async () => {
    const controller = makeController({ status: 'not-found', address: SOL });
    const body = (await controller.getToken(SOL)) as Record<string, unknown>;
    expect(body).toEqual({ error: 'Token not found' });
  });

  it('answers pending with the pinned wire shape (HTTP 200 object, copy differs from not-found)', async () => {
    const controller = makeController({ status: 'pending', address: SOL });
    const body = (await controller.getToken(SOL)) as Record<string, unknown>;
    expect(body).toEqual({
      error: 'Token pending — retry shortly',
      address: SOL,
      pending: true,
    });
    expect(body['error']).not.toBe('Token not found');
  });

  it('keeps requiring the address param', async () => {
    const controller = makeController({ status: 'not-found', address: '' });
    const body = (await controller.getToken('')) as Record<string, unknown>;
    expect(body).toEqual({ error: 'Address required' });
  });

  it('renders the active ca template with templateUsed when it renders cleanly', async () => {
    const templates = {
      findActiveByCommand: async () => ACTIVE_CA,
    };
    const controller = makeController(
      { status: 'resolved', token: TOKEN },
      templates,
      new TemplateRendererService(),
    );
    const body = (await controller.getToken(SOL)) as Record<string, unknown>;
    expect(body['text']).toContain('TKN');
    expect(body['templateUsed']).toEqual({
      command: 'ca',
      name: 'full-dexter-v1',
      version: ACTIVE_CA.version,
    });
    expect(body['scanCard']).toBe('SCAN-CARD');
  });

  it('returns the legacy shape with templateUsed null when no ca template is active', async () => {
    const templates = {
      findActiveByCommand: async () => null,
    };
    const controller = makeController(
      { status: 'resolved', token: TOKEN },
      templates,
      new TemplateRendererService(),
    );
    const body = (await controller.getToken(SOL)) as Record<string, unknown>;
    expect(body['text']).toBe('CARD');
    expect(body['scanCard']).toBe('SCAN-CARD');
    expect(body['scanCardParseMode']).toBe('MarkdownV2');
    expect(body['templateUsed']).toBeNull();
  });

  it('falls back to the legacy shape with templateUsed null when render throws', async () => {
    const templates = {
      findActiveByCommand: async () => ACTIVE_CA,
    };
    const renderer = {
      render: () => {
        throw new Error('boom');
      },
    };
    const controller = makeController(
      { status: 'resolved', token: TOKEN },
      templates,
      renderer,
    );
    const body = (await controller.getToken(SOL)) as Record<string, unknown>;
    expect(body['text']).toBe('CARD');
    expect(body['scanCard']).toBe('SCAN-CARD');
    expect(body['templateUsed']).toBeNull();
  });
});
