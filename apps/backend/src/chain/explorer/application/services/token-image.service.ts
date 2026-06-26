import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import {
  LruTokenImageCache,
  TOKEN_IMAGE_CACHE,
} from 'shared/cache/token-image-cache.adapter';
import type { TokenImageCache } from 'shared/cache/token-image-cache.adapter';
import {
  FetchedImage,
  TOKEN_IMAGE_FETCHER,
  TokenImageFetcher,
} from '../ports/token-image.fetcher';

export interface ImageData {
  readonly buffer: Buffer;
  readonly contentType: string;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const WEBP_QUALITY = 80;
const ORIGINAL_VARIANT = 'original';
const WEBP_VARIANT = 'webp';

@Injectable()
export class TokenImageService {
  private readonly logger = new Logger(TokenImageService.name);

  public constructor(
    @Inject(TOKEN_IMAGE_FETCHER)
    private readonly fetcher: TokenImageFetcher,
    @Inject(TOKEN_IMAGE_CACHE)
    private readonly cache: TokenImageCache = new LruTokenImageCache(),
  ) {}

  public async getImage(
    chain: string,
    address: string,
    source?: string,
    acceptHeader?: string,
  ): Promise<ImageData> {
    const wantWebP =
      acceptHeader?.toLowerCase().includes('image/webp') ?? false;
    const variant = wantWebP ? WEBP_VARIANT : ORIGINAL_VARIANT;
    const key = this.buildKey(chain, address, source, variant);
    const cached = await this.cache.get(key);
    if (cached) {
      this.logger.debug(`Cache hit: ${key}`);
      return { buffer: cached.buffer, contentType: cached.contentType };
    }
    let fetched: FetchedImage;
    try {
      fetched = await this.fetchImage(chain, address, source);
    } catch (err) {
      if (err instanceof NotFoundException) {
        this.logger.debug(
          `No CDN image for ${chain}/${address} — serving deterministic placeholder`,
        );
        return this.servePlaceholder(chain, address, variant);
      }
      throw err;
    }
    const ttl = fetched.ttlMs > 0 ? fetched.ttlMs : DEFAULT_TTL_MS;
    const buffer = wantWebP
      ? await sharp(fetched.buffer).webp({ quality: WEBP_QUALITY }).toBuffer()
      : fetched.buffer;
    const contentType = wantWebP ? 'image/webp' : fetched.contentType;
    await this.cache.set(key, buffer, contentType, ttl);
    return { buffer, contentType };
  }

  public async invalidate(chain: string, address: string): Promise<void> {
    const prefix = `${chain}:${address}:`;
    await this.cache.invalidate(prefix);
  }

  private async servePlaceholder(
    chain: string,
    address: string,
    variant: string,
  ): Promise<ImageData> {
    const palette = PLACEHOLDER_PALETTE[
      this.hashAddress(address) % PLACEHOLDER_PALETTE.length
    ];
    const initial = (address[0] ?? '?').toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="48" fill="${palette}"/><text x="48" y="48" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif" font-size="48" font-weight="600" fill="white">${initial}</text></svg>`;
    const buffer = Buffer.from(svg, 'utf8');
    const contentType = 'image/svg+xml';
    const key = this.buildKey(chain, address, undefined, variant);
    await this.cache.set(key, buffer, contentType, PLACEHOLDER_TTL_MS);
    return { buffer, contentType };
  }

  private hashAddress(address: string): number {
    let h = 0;
    for (let i = 0; i < address.length; i++) {
      h = (h * 31 + address.charCodeAt(i)) >>> 0;
    }
    return h;
  }

  private async fetchImage(
    chain: string,
    address: string,
    source?: string,
  ): Promise<FetchedImage> {
    return this.fetcher!.fetch(chain, address, source);
  }

  private buildKey(
    chain: string,
    address: string,
    source?: string,
    variant: string = ORIGINAL_VARIANT,
  ): string {
    return `${chain}:${address}:${source ?? 'default'}:${variant}`;
  }
}
