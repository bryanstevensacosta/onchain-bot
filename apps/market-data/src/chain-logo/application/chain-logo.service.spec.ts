import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ChainLogoFetcherPort } from './chain-logo-fetcher.port';
import { ChainLogoService } from './chain-logo.service';
import { PLACEHOLDER_PNG } from '../domain/chain-logo';

/**
 * Failing-first spec (chain-logo): fetch-ONCE + fallback + placeholder.
 *
 * Resolver contract: fetch remote bytes ONCE per chain (persist to
 * uploads/chain-logo/<chain>.png); second reads are served from disk
 * with zero re-fetch. Upstream 404s degrade to the placeholder and
 * never throw.
 */
class FakeFetcher extends ChainLogoFetcherPort {
  public bytesCalls: Array<string> = [];
  public jsonCalls: Array<string> = [];
  public constructor(
    private readonly bytesImpl: (url: string) => Promise<Buffer | null>,
    private readonly jsonImpl: (
      url: string,
    ) => Promise<{ image?: unknown } | null>,
  ) {
    super();
  }

  public async fetchBytes(url: string): Promise<Buffer | null> {
    this.bytesCalls.push(url);
    return this.bytesImpl(url);
  }

  public async fetchJson(url: string): Promise<{ image?: unknown } | null> {
    this.jsonCalls.push(url);
    return this.jsonImpl(url);
  }
}

function makeService(fetcher: ChainLogoFetcherPort): {
  service: ChainLogoService;
  dir: string;
} {
  const dir = mkdtempSync(join(tmpdir(), 'chain-logo-'));
  return { service: new ChainLogoService(fetcher, dir), dir };
}

describe('ChainLogoService (fetch-once resolver)', () => {
  it('fetches ONCE: second read is cached with no re-fetch', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01]);
    const fetcher = new FakeFetcher(
      async () => png,
      async () => null,
    );
    const { service } = makeService(fetcher);

    const first = await service.resolveLogo('solana');
    expect(first.source).toBe('trustwallet');
    expect(first.bytes.equals(png)).toBe(true);

    const second = await service.resolveLogo('solana');
    expect(second.source).toBe('cache');
    expect(second.bytes.equals(png)).toBe(true);
    expect(fetcher.bytesCalls.length).toBe(1);
  });

  it('falls back to the CoinGecko asset_platforms image when TrustWallet 404s', async () => {
    const fallback = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x02]);
    const fetcher = new FakeFetcher(
      async (url) => {
        if (url.includes('trustwallet')) {
          return null;
        }
        return fallback;
      },
      async () => ({ image: 'https://example.com/coin.png' }),
    );
    const { service } = makeService(fetcher);

    const result = await service.resolveLogo('ethereum');
    expect(result.source).toBe('coingecko');
    expect(result.bytes.equals(fallback)).toBe(true);
    expect(fetcher.jsonCalls.length).toBe(1);
  });

  it('serves the placeholder (no crash) when every upstream 404s', async () => {
    const fetcher = new FakeFetcher(
      async () => null,
      async () => null,
    );
    const { service } = makeService(fetcher);

    const result = await service.resolveLogo('polygon');
    expect(result.source).toBe('placeholder');
    expect(result.bytes.equals(PLACEHOLDER_PNG)).toBe(true);
  });

  it('serves the placeholder for a missing/unknown chain (no crash)', async () => {
    const fetcher = new FakeFetcher(
      async () => {
        throw new Error('must not fetch for unknown chains');
      },
      async () => {
        throw new Error('must not fetch for unknown chains');
      },
    );
    const { service } = makeService(fetcher);

    const result = await service.resolveLogo('nope');
    expect(result.source).toBe('placeholder');
    expect(result.bytes.equals(PLACEHOLDER_PNG)).toBe(true);
    expect(fetcher.bytesCalls.length).toBe(0);
    expect(fetcher.jsonCalls.length).toBe(0);
  });

  it('refresh forces a re-fetch even when cached', async () => {
    const first = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0a]);
    const second = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0b]);
    let calls = 0;
    const fetcher = new FakeFetcher(
      async () => {
        calls += 1;
        return calls === 1 ? first : second;
      },
      async () => null,
    );
    const { service } = makeService(fetcher);

    await service.resolveLogo('base');
    const refreshed = await service.refreshLogo('base');
    expect(refreshed.source).toBe('trustwallet');
    expect(refreshed.bytes.equals(second)).toBe(true);
    expect(fetcher.bytesCalls.length).toBe(2);
  });
});
