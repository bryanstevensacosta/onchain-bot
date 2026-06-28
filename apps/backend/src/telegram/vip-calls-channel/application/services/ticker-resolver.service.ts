import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DexScreenerService } from 'data-provider/dexscreener/dexscreener.service';
import { GeckoTerminalService } from 'data-provider/geckoterminal/geckoterminal.service';
import { CoinGeckoService } from 'data-provider/coingecko/coingecko.service';
import {
  COINGECKO_CONFIG,
  type CoinGeckoConfig,
} from 'data-provider/coingecko/coingecko.config';
import { MoralisService } from 'data-provider/moralis/moralis.service';
import { HeliusService } from 'data-provider/helius/helius.service';

/**
 * TickerResolverService implements a 9-level cascading fallback system
 * to resolve token tickers when database lookups fail.
 *
 * Fallback order:
 * 1. DexScreener → getPairsByToken() → pairs[0].baseToken.symbol
 * 2. GeckoTerminal → getTokenInfo() → symbol
 * 3. CoinGecko → getTokenContractInfo() → symbol
 * 4. Moralis (EVM only) → getTokenMetadata() → symbol
 * 5. Helius (Solana only) → getAsset() → content.metadata.symbol
 * 6. Name extraction → extractTickerFromName(name)
 * 7. Return null (caller uses "ANON" as final fallback)
 *
 * Each provider is tried sequentially. The first successful response stops the cascade.
 * All errors are caught and logged, allowing graceful degradation to the next provider.
 */
@Injectable()
export class TickerResolverService {
  private readonly logger = new Logger(TickerResolverService.name);
  private readonly coinGeckoApiKey: string | null;

  constructor(
    private readonly dexScreener: DexScreenerService,
    private readonly geckoTerminal: GeckoTerminalService,
    private readonly coinGecko: CoinGeckoService,
    private readonly moralis: MoralisService,
    private readonly helius: HeliusService,
    @Inject(COINGECKO_CONFIG) coinGeckoConfig: CoinGeckoConfig,
  ) {
    this.coinGeckoApiKey = coinGeckoConfig?.apiKey ?? null;
  }

  /**
   * Resolve ticker using cascading fallback system.
   * Returns null if all sources fail (caller should use "ANON" as final fallback).
   */
  async resolveTicker(params: {
    chain: string;
    address: string;
    name: string | null;
  }): Promise<string | null> {
    const { chain, address, name } = params;

    // Level 1: DexScreener
    try {
      this.logger.debug(
        `[TickerResolver] Attempting DexScreener for ${chain}:${address}`,
      );
      const pairs = await this.dexScreener.getPairsByToken(address);
      const ticker = pairs?.[0]?.baseToken?.symbol;
      if (ticker && typeof ticker === 'string' && ticker.length > 0) {
        this.logger.debug(`[TickerResolver] DexScreener returned: ${ticker}`);
        return ticker;
      }
      this.logger.debug(
        `[TickerResolver] DexScreener returned no valid symbol`,
      );
    } catch (err) {
      this.logger.debug(
        `[TickerResolver] DexScreener failed: ${(err as Error).message}`,
      );
    }

    // Level 2: GeckoTerminal
    try {
      const networkSlug = this.mapToGeckoTerminalSlug(chain);
      if (networkSlug) {
        this.logger.debug(
          `[TickerResolver] Attempting GeckoTerminal for ${chain}:${address}`,
        );
        const tokenInfo = await this.geckoTerminal.getTokenInfo(
          networkSlug,
          address,
        );
        const ticker = tokenInfo?.symbol;
        if (ticker && typeof ticker === 'string' && ticker.length > 0) {
          this.logger.debug(
            `[TickerResolver] GeckoTerminal returned: ${ticker}`,
          );
          return ticker;
        }
        this.logger.debug(
          `[TickerResolver] GeckoTerminal returned no valid symbol`,
        );
      }
    } catch (err) {
      this.logger.debug(
        `[TickerResolver] GeckoTerminal failed: ${(err as Error).message}`,
      );
    }

    // Level 3: CoinGecko
    try {
      const platform = this.mapToCoinGeckoPlatform(chain);
      if (platform) {
        this.logger.debug(
          `[TickerResolver] Attempting CoinGecko for ${chain}:${address}`,
        );
        // Call CoinGecko API directly to get symbol (not exposed in service's mapped response)
        const ticker = await this.fetchCoinGeckoSymbol(platform, address);
        if (ticker && typeof ticker === 'string' && ticker.length > 0) {
          this.logger.debug(`[TickerResolver] CoinGecko returned: ${ticker}`);
          return ticker;
        }
        this.logger.debug(
          `[TickerResolver] CoinGecko returned no valid symbol`,
        );
      }
    } catch (err) {
      this.logger.debug(
        `[TickerResolver] CoinGecko failed: ${(err as Error).message}`,
      );
    }

    // Level 4: Moralis (EVM only)
    const evmChains = ['ethereum', 'bsc', 'base', 'arbitrum', 'polygon'];
    if (evmChains.includes(chain.toLowerCase())) {
      try {
        this.logger.debug(
          `[TickerResolver] Attempting Moralis for ${chain}:${address}`,
        );
        const priceData = await this.moralis.getTokenPrice(
          address,
          chain.toLowerCase(),
        );
        const ticker = priceData?.tokenSymbol;
        if (ticker && typeof ticker === 'string' && ticker.length > 0) {
          this.logger.debug(`[TickerResolver] Moralis returned: ${ticker}`);
          return ticker;
        }
        this.logger.debug(`[TickerResolver] Moralis returned no valid symbol`);
      } catch (err) {
        this.logger.debug(
          `[TickerResolver] Moralis failed: ${(err as Error).message}`,
        );
      }
    }

    // Level 5: Helius (Solana only)
    if (chain.toLowerCase() === 'solana') {
      try {
        this.logger.debug(
          `[TickerResolver] Attempting Helius for ${chain}:${address}`,
        );
        const asset = await this.helius.getAsset(address);
        const ticker = asset?.content?.metadata?.symbol;
        if (ticker && typeof ticker === 'string' && ticker.length > 0) {
          this.logger.debug(`[TickerResolver] Helius returned: ${ticker}`);
          return ticker;
        }
        this.logger.debug(`[TickerResolver] Helius returned no valid symbol`);
      } catch (err) {
        this.logger.debug(
          `[TickerResolver] Helius failed: ${(err as Error).message}`,
        );
      }
    }

    // Level 6: Name extraction
    if (name) {
      try {
        this.logger.debug(
          `[TickerResolver] Attempting name extraction for ${chain}:${address}`,
        );
        const ticker = this.extractTickerFromName(name);
        if (ticker) {
          this.logger.debug(
            `[TickerResolver] Name extraction returned: ${ticker}`,
          );
          return ticker;
        }
        this.logger.debug(
          `[TickerResolver] Name extraction returned no valid ticker`,
        );
      } catch (err) {
        this.logger.debug(
          `[TickerResolver] Name extraction failed: ${(err as Error).message}`,
        );
      }
    }

    // Level 7: Return null (caller will use "ANON")
    this.logger.debug(
      `[TickerResolver] All fallback attempts failed for ${chain}:${address}`,
    );
    return null;
  }

  /**
   * Fetch symbol directly from CoinGecko API.
   * The symbol field is in the response but not exposed by the current service implementation.
   */
  private async fetchCoinGeckoSymbol(
    platform: string,
    address: string,
  ): Promise<string | null> {
    if (!this.coinGeckoApiKey) {
      return null;
    }

    try {
      // The CoinGecko API returns a "symbol" field at the root level of the response
      const { data } = await axios.get<{ symbol?: string }>(
        `https://api.coingecko.com/api/v3/coins/${platform}/contract/${address}`,
        {
          headers: {
            'x-cg-demo-api-key': this.coinGeckoApiKey,
          },
          timeout: 8_000,
        },
      );
      return data?.symbol ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return null;
      }
      throw err; // Re-throw to be caught by the outer try-catch
    }
  }

  /**
   * Extract ticker from token name by taking the first word,
   * converting to uppercase, and validating it's 2-10 alphanumeric chars.
   */
  private extractTickerFromName(name: string | null): string | null {
    if (!name || typeof name !== 'string' || name.length === 0) {
      return null;
    }

    // Split by whitespace and punctuation, take first token
    const firstWord = name.split(/[\s\-_.,!?()]+/)[0];
    if (!firstWord) {
      return null;
    }

    // Convert to uppercase and remove non-alphanumeric characters
    const ticker = firstWord.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Validate length (2-10 characters)
    if (ticker.length >= 2 && ticker.length <= 10) {
      return ticker;
    }

    return null;
  }

  /**
   * Map chain name to GeckoTerminal network slug.
   */
  private mapToGeckoTerminalSlug(chain: string): string | null {
    const mapping: Record<string, string> = {
      solana: 'solana',
      ethereum: 'eth',
      bsc: 'bsc',
      base: 'base',
      arbitrum: 'arbitrum',
      polygon: 'polygon',
    };
    return mapping[chain.toLowerCase()] ?? null;
  }

  /**
   * Map chain name to CoinGecko platform ID.
   */
  private mapToCoinGeckoPlatform(chain: string): string | null {
    const mapping: Record<string, string> = {
      solana: 'solana',
      ethereum: 'ethereum',
      bsc: 'binance-smart-chain',
      base: 'base',
    };
    return mapping[chain.toLowerCase()] ?? null;
  }
}
