import sharp from 'sharp';
import { NotFoundException } from '@nestjs/common';
import { TokenImageService } from './token-image.service';
import { FetchedImage, TokenImageFetcher } from '../ports/token-image.fetcher';
import { LruTokenImageCache } from 'shared/cache/token-image-cache.adapter';

const buildValidPng = async (): Promise<Buffer> =>
  sharp({
    create: {
      width: 16,
      height: 16,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

class FakeFetcher extends TokenImageFetcher {
  private readonly responses = new Map<
    string,
    { result: FetchedImage; callCount: number }
  >();

  public setResponse(
    chain: string,
    address: string,
    result: FetchedImage,
  ): void {
    const key = `${chain}:${address}`;
    const existing = this.responses.get(key);
    this.responses.set(key, {
      result,
      callCount: existing?.callCount ?? 0,
    });
  }

  public getCallCount(chain: string, address: string): number {
    return this.responses.get(`${chain}:${address}`)?.callCount ?? 0;
  }

  public async fetch(chain: string, address: string): Promise<FetchedImage> {
    const key = `${chain}:${address}`;
    const entry = this.responses.get(key);
    if (!entry) {
      throw new Error(`No fake response configured for ${key}`);
    }
    entry.callCount += 1;
    return entry.result;
  }
}

describe('TokenImageService', () => {
  let fetcher: FakeFetcher;
  let cache: LruTokenImageCache;
  let service: TokenImageService;

  beforeEach(() => {
    fetcher = new FakeFetcher();
    cache = new LruTokenImageCache();
    service = new TokenImageService(fetcher, cache);
  });

  it('returns cached image on second call with same input', async () => {
    const buf = Buffer.from('png-bytes');
    fetcher.setResponse('ethereum', '0xabc', {
      buffer: buf,
      contentType: 'image/png',
      ttlMs: 60_000,
    });

    const first = await service.getImage('ethereum', '0xabc');
    const second = await service.getImage('ethereum', '0xabc');

    expect(first.buffer.equals(buf)).toBe(true);
    expect(first.contentType).toBe('image/png');
    expect(second).toEqual(first);
    expect(fetcher.getCallCount('ethereum', '0xabc')).toBe(1);
  });

  it('treats different source as a separate cache key (cache miss)', async () => {
    const bufA = Buffer.from('a');
    const bufB = Buffer.from('b');
    fetcher.setResponse('ethereum', '0xabc', {
      buffer: bufA,
      contentType: 'image/png',
      ttlMs: 60_000,
    });

    const fromDefault = await service.getImage('ethereum', '0xabc');
    expect(fromDefault.buffer.equals(bufA)).toBe(true);

    fetcher.setResponse('ethereum', '0xabc', {
      buffer: bufB,
      contentType: 'image/webp',
      ttlMs: 60_000,
    });
    const fromBirdeye = await service.getImage('ethereum', '0xabc', 'birdeye');

    expect(fromBirdeye.buffer.equals(bufB)).toBe(true);
    expect(fromBirdeye.contentType).toBe('image/webp');
    expect(fetcher.getCallCount('ethereum', '0xabc')).toBe(2);

    const fromDefaultAgain = await service.getImage('ethereum', '0xabc');
    expect(fromDefaultAgain.buffer.equals(bufA)).toBe(true);
    expect(fetcher.getCallCount('ethereum', '0xabc')).toBe(2);
  });

  it('treats different chain/address as a separate cache entry', async () => {
    fetcher.setResponse('ethereum', '0xaaa', {
      buffer: Buffer.from('a'),
      contentType: 'image/png',
      ttlMs: 60_000,
    });
    fetcher.setResponse('solana', 'SoLbbb', {
      buffer: Buffer.from('b'),
      contentType: 'image/png',
      ttlMs: 60_000,
    });

    await service.getImage('ethereum', '0xaaa');
    await service.getImage('solana', 'SoLbbb');

    expect(fetcher.getCallCount('ethereum', '0xaaa')).toBe(1);
    expect(fetcher.getCallCount('solana', 'SoLbbb')).toBe(1);
  });

  it('invalidate() removes cached entries for the chain+address across sources', async () => {
    fetcher.setResponse('ethereum', '0xabc', {
      buffer: Buffer.from('x'),
      contentType: 'image/png',
      ttlMs: 60_000,
    });
    await service.getImage('ethereum', '0xabc');
    await service.getImage('ethereum', '0xabc', 'birdeye');
    expect(fetcher.getCallCount('ethereum', '0xabc')).toBe(2);

    await service.invalidate('ethereum', '0xabc');

    await service.getImage('ethereum', '0xabc');
    await service.getImage('ethereum', '0xabc', 'birdeye');

    expect(fetcher.getCallCount('ethereum', '0xabc')).toBe(4);
  });

  it('invalidate() does not remove entries for other chain/address', async () => {
    fetcher.setResponse('ethereum', '0xaaa', {
      buffer: Buffer.from('a'),
      contentType: 'image/png',
      ttlMs: 60_000,
    });
    fetcher.setResponse('ethereum', '0xbbb', {
      buffer: Buffer.from('b'),
      contentType: 'image/png',
      ttlMs: 60_000,
    });

    await service.getImage('ethereum', '0xaaa');
    await service.getImage('ethereum', '0xbbb');

    await service.invalidate('ethereum', '0xaaa');

    await service.getImage('ethereum', '0xaaa');
    await service.getImage('ethereum', '0xbbb');

    expect(fetcher.getCallCount('ethereum', '0xaaa')).toBe(2);
    expect(fetcher.getCallCount('ethereum', '0xbbb')).toBe(1);
  });

  it('serves a deterministic SVG placeholder when the fetcher throws NotFoundException', async () => {
    const failingFetcher = {
      fetch: async () => {
        throw new NotFoundException('no image');
      },
    };
    const serviceWithFailingFetcher = new TokenImageService(
      failingFetcher as never,
      cache,
    );
    const result = await serviceWithFailingFetcher.getImage('ethereum', '0xabc');
    expect(result.contentType).toBe('image/svg+xml');
    expect(result.buffer.toString('utf8')).toContain('<svg');
  });

  it('falls back to default TTL when fetcher returns ttlMs <= 0', async () => {
    fetcher.setResponse('ethereum', '0xabc', {
      buffer: Buffer.from('x'),
      contentType: 'image/png',
      ttlMs: 0,
    });

    const result = await service.getImage('ethereum', '0xabc');
    expect(result.contentType).toBe('image/png');
  });

  it('transcodes buffer to WebP when Accept header includes image/webp', async () => {
    const pngBuffer = await buildValidPng();
    fetcher.setResponse('ethereum', '0xabc', {
      buffer: pngBuffer,
      contentType: 'image/png',
      ttlMs: 60_000,
    });

    const result = await service.getImage(
      'ethereum',
      '0xabc',
      undefined,
      'image/webp',
    );

    expect(result.contentType).toBe('image/webp');
    expect(result.buffer.equals(pngBuffer)).toBe(false);
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(fetcher.getCallCount('ethereum', '0xabc')).toBe(1);
  });

  it('caches transcoded WebP separately from original (variant in cache key)', async () => {
    const pngBuffer = await buildValidPng();
    fetcher.setResponse('ethereum', '0xabc', {
      buffer: pngBuffer,
      contentType: 'image/png',
      ttlMs: 60_000,
    });

    const original = await service.getImage('ethereum', '0xabc');
    expect(original.contentType).toBe('image/png');
    expect(original.buffer.equals(pngBuffer)).toBe(true);

    const webp = await service.getImage(
      'ethereum',
      '0xabc',
      undefined,
      'image/webp',
    );
    expect(webp.contentType).toBe('image/webp');
    expect(webp.buffer.equals(pngBuffer)).toBe(false);

    expect(fetcher.getCallCount('ethereum', '0xabc')).toBe(2);

    const originalAgain = await service.getImage('ethereum', '0xabc');
    expect(originalAgain.contentType).toBe('image/png');
    expect(originalAgain.buffer.equals(pngBuffer)).toBe(true);
    expect(fetcher.getCallCount('ethereum', '0xabc')).toBe(2);

    const webpAgain = await service.getImage(
      'ethereum',
      '0xabc',
      undefined,
      'image/webp',
    );
    expect(webpAgain.contentType).toBe('image/webp');
    expect(fetcher.getCallCount('ethereum', '0xabc')).toBe(2);
  });

  it('does not transcode when Accept header is missing or absent of image/webp', async () => {
    const pngBuffer = await buildValidPng();
    fetcher.setResponse('ethereum', '0xabc', {
      buffer: pngBuffer,
      contentType: 'image/png',
      ttlMs: 60_000,
    });

    const noAccept = await service.getImage('ethereum', '0xabc');
    expect(noAccept.contentType).toBe('image/png');
    expect(noAccept.buffer.equals(pngBuffer)).toBe(true);

    const otherAccept = await service.getImage(
      'ethereum',
      '0xabc',
      undefined,
      'image/png,image/jpeg',
    );
    expect(otherAccept.contentType).toBe('image/png');
    expect(otherAccept.buffer.equals(pngBuffer)).toBe(true);
  });

  it('matches image/webp in Accept header case-insensitively', async () => {
    const pngBuffer = await buildValidPng();
    fetcher.setResponse('ethereum', '0xabc', {
      buffer: pngBuffer,
      contentType: 'image/png',
      ttlMs: 60_000,
    });

    const result = await service.getImage(
      'ethereum',
      '0xabc',
      undefined,
      'text/html;q=0.9, IMAGE/WEBP;q=0.8',
    );
    expect(result.contentType).toBe('image/webp');
  });
});
