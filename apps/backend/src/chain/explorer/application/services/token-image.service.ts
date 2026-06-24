import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import sharp from 'sharp';
import {
  LruTokenImageCache,
  TOKEN_IMAGE_CACHE,
} from 'shared/cache/token-image-cache.adapter';
import type { TokenImageCache } from 'shared/cache/token-image-cache.adapter';
import { FetchedImage, TokenImageFetcher } from '../ports/token-image.fetcher';

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
    @Optional()
    @Inject(TokenImageFetcher)
    private readonly fetcher?: TokenImageFetcher,
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
    if (!this.fetcher) {
      throw new Error('TokenImageFetcher not yet wired');
    }
    const fetched = await this.fetchImage(chain, address, source);
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
