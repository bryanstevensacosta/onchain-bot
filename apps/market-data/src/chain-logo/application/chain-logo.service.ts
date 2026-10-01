import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import { join } from 'path';
import {
  CHAIN_LOGO_FETCHER,
  ChainLogoFetcherPort,
} from './chain-logo-fetcher.port';
import {
  PLACEHOLDER_PNG,
  coingeckoPlatformUrl,
  isSupportedChainLogo,
  normalizeChainLogoId,
  primaryLogoUrl,
} from '../domain/chain-logo';

export type ChainLogoSource =
  | 'cache'
  | 'trustwallet'
  | 'coingecko'
  | 'placeholder';

export interface ChainLogoResult {
  readonly bytes: Buffer;
  readonly source: ChainLogoSource;
  readonly filePath: string | null;
}

/**
 * ChainLogoService (chain-logo resolver, fetch-ONCE).
 *
 * Primary: TrustWallet assets repo
 * (`raw.githubusercontent.com/trustwallet/assets/...`). Fallback: the
 * CoinGecko `asset_platforms` image. Remote bytes are fetched ONCE per
 * chain and persisted to `uploads/chain-logo/<chain>.png`; later reads
 * hit disk with zero re-fetch. There is NO periodic refresh — only the
 * explicit `refreshLogo` path (gateway POST) re-fetches.
 *
 * Adversarial: every upstream gap (404, network error, bad payload)
 * degrades to the in-memory PNG placeholder and is logged — never
 * thrown. Unknown chains resolve to the placeholder without touching
 * the network or the disk.
 */
@Injectable()
export class ChainLogoService {
  private readonly logger = new Logger(ChainLogoService.name);
  private readonly baseDir: string;

  public constructor(
    @Inject(CHAIN_LOGO_FETCHER) private readonly fetcher: ChainLogoFetcherPort,
    @Optional() baseDir?: string,
  ) {
    this.baseDir =
      baseDir ??
      process.env.CHAIN_LOGO_DIR ??
      join(process.cwd(), 'uploads', 'chain-logo');
  }

  public logoFilePath(chainId: string): string {
    return join(this.baseDir, `${normalizeChainLogoId(chainId)}.png`);
  }

  public async resolveLogo(chainId: string): Promise<ChainLogoResult> {
    const normalized = normalizeChainLogoId(chainId);
    if (!isSupportedChainLogo(normalized)) {
      return { bytes: PLACEHOLDER_PNG, source: 'placeholder', filePath: null };
    }
    const cached = await this.readCached(normalized);
    if (cached !== null) {
      return {
        bytes: cached,
        source: 'cache',
        filePath: this.logoFilePath(normalized),
      };
    }
    return this.refreshLogo(normalized);
  }

  public async refreshLogo(chainId: string): Promise<ChainLogoResult> {
    const normalized = normalizeChainLogoId(chainId);
    if (!isSupportedChainLogo(normalized)) {
      return { bytes: PLACEHOLDER_PNG, source: 'placeholder', filePath: null };
    }
    const primary = await this.fetchPrimary(normalized);
    if (primary !== null) {
      await this.persist(normalized, primary);
      return {
        bytes: primary,
        source: 'trustwallet',
        filePath: this.logoFilePath(normalized),
      };
    }
    const fallback = await this.fetchFallback(normalized);
    if (fallback !== null) {
      await this.persist(normalized, fallback);
      return {
        bytes: fallback,
        source: 'coingecko',
        filePath: this.logoFilePath(normalized),
      };
    }
    this.logger.warn(
      `chain-logo upstream 404 for ${normalized}, serving placeholder`,
    );
    await this.persist(normalized, PLACEHOLDER_PNG);
    return {
      bytes: PLACEHOLDER_PNG,
      source: 'placeholder',
      filePath: this.logoFilePath(normalized),
    };
  }

  private async readCached(normalized: string): Promise<Buffer | null> {
    try {
      const info = await stat(this.logoFilePath(normalized));
      if (!info.isFile() || info.size === 0) {
        return null;
      }
      return await readFile(this.logoFilePath(normalized));
    } catch {
      return null;
    }
  }

  private async fetchPrimary(normalized: string): Promise<Buffer | null> {
    const url = primaryLogoUrl(normalized);
    if (url === null) {
      return null;
    }
    try {
      return await this.fetcher.fetchBytes(url);
    } catch (error) {
      this.logger.warn(
        `chain-logo primary fetch failed for ${normalized}: ${String(error)}`,
      );
      return null;
    }
  }

  private async fetchFallback(normalized: string): Promise<Buffer | null> {
    const platformUrl = coingeckoPlatformUrl(normalized);
    if (platformUrl === null) {
      return null;
    }
    try {
      const meta = await this.fetcher.fetchJson(platformUrl);
      const image = typeof meta?.image === 'string' ? meta.image : null;
      if (image === null || image === '') {
        return null;
      }
      return await this.fetcher.fetchBytes(image);
    } catch (error) {
      this.logger.warn(
        `chain-logo fallback fetch failed for ${normalized}: ${String(error)}`,
      );
      return null;
    }
  }

  private async persist(normalized: string, bytes: Buffer): Promise<void> {
    try {
      await mkdir(this.baseDir, { recursive: true });
      await writeFile(this.logoFilePath(normalized), bytes);
    } catch (error) {
      this.logger.warn(
        `chain-logo persist failed for ${normalized}: ${String(error)}`,
      );
    }
  }
}
