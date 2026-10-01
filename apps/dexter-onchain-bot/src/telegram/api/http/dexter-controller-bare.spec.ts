import { DexterController } from './dexter.controller';
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

function makeController(outcome: unknown) {
  const pipeline = { resolveDetailed: async () => outcome };
  const formatter = {
    format: () => 'CARD',
    formatScanCard: () => ({
      text: 'SCAN-CARD',
      truncated: false,
      parseMode: 'MarkdownV2',
    }),
  };
  return new DexterController(pipeline as never, formatter as never);
}

describe('DexterController bare-address lookup (explicit errors, no silent guess)', () => {
  it('returns the card for a resolved bare address', async () => {
    const controller = makeController({ status: 'resolved', token: TOKEN });
    const body = (await controller.getToken(SOL)) as Record<string, unknown>;
    expect(body['address']).toBe(SOL);
    expect(body['text']).toBe('CARD');
    expect(body['scanCard']).toBe('SCAN-CARD');
    expect(body['scanCardParseMode']).toBe('MarkdownV2');
  });

  it('names every candidate when the address is ambiguous', async () => {
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

  it('keeps requiring the address param', async () => {
    const controller = makeController({ status: 'not-found', address: '' });
    const body = (await controller.getToken('')) as Record<string, unknown>;
    expect(body).toEqual({ error: 'Address required' });
  });
});
