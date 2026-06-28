import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  FetchedImage,
  TokenImageFetcher as TokenImageFetcherPort,
} from '../../application/ports/token-image.fetcher';

const FETCH_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const USER_AGENT = 'onchain-bot/1.0';

const CHAIN_SLUGS: Record<string, string> = {
  ethereum: 'ethereum',
  solana: 'solana',
  bsc: 'bsc',
  base: 'base',
  arbitrum: 'arbitrum',
  polygon: 'polygon',
};

@Injectable()
export class TokenImageFetcher extends TokenImageFetcherPort {
  private readonly logger = new Logger(TokenImageFetcher.name);

  public async fetch(
    chain: string,
    address: string,
    source?: string,
  ): Promise<FetchedImage> {
    const urls = this.buildProviderUrls(chain, address, source);
    for (const url of urls) {
      const result = await this.tryFetch(url);
      if (result) {
        return result;
      }
    }
    throw new NotFoundException(`No image found for ${chain}/${address}`);
  }

  private buildProviderUrls(
    chain: string,
    address: string,
    source?: string,
  ): string[] {
    const slug = CHAIN_SLUGS[chain] ?? chain;
    const urls: string[] = [];
    if (source) {
      try {
        const decoded = decodeURIComponent(source);
        if (/^https?:\/\//i.test(decoded) || /^ipfs:\/\//i.test(decoded)) {
          urls.push(decoded);
        }
      } catch {
        return urls;
      }
    }
    urls.push(
      `https://dd.dexscreener.com/ds-data/tokens/${slug}/${address}.png`,
    );
    if (chain === 'solana') {
      urls.push(`https://cdn.birdeye.so/tokens/${address}/logo.png`);
    }
    return urls;
  }

  private async tryFetch(url: string): Promise<FetchedImage | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.debug(`Provider returned ${response.status} for ${url}`);
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') ?? 'image/png';
      return {
        buffer: Buffer.from(arrayBuffer),
        contentType,
        ttlMs: CACHE_TTL_MS,
      };
    } catch (err) {
      this.logger.debug(
        `Provider fetch failed for ${url}: ${(err as Error).message}`,
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
