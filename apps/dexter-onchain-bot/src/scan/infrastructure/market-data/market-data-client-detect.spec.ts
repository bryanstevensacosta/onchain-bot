import { MarketDataClient } from './market-data.client';

const SOL = 'So11111111111111111111111111111111111111112';

describe('MarketDataClient.detectChain (market-data chain-detect reuse)', () => {
  const OLD_FETCH = global.fetch;

  afterEach(() => {
    global.fetch = OLD_FETCH;
    jest.restoreAllMocks();
  });

  it('returns the detect-chain winner for a bare address', async () => {
    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          chainId: 'solana',
          points: 70,
          reasons: ['solana:format_valid'],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;
    const client = new MarketDataClient();
    await expect(client.detectChain(SOL)).resolves.toEqual({
      chainId: 'solana',
      points: 70,
      reasons: ['solana:format_valid'],
    });
  });

  it('returns null when market-data answers non-ok, never throws', async () => {
    global.fetch = (async () =>
      new Response('nope', { status: 404 })) as typeof fetch;
    const client = new MarketDataClient();
    await expect(client.detectChain(SOL)).resolves.toBeNull();
  });

  it('returns null when the fetch itself fails, never throws', async () => {
    global.fetch = (async () => {
      throw new Error('conn refused');
    }) as typeof fetch;
    const client = new MarketDataClient();
    await expect(client.detectChain(SOL)).resolves.toBeNull();
  });
});
