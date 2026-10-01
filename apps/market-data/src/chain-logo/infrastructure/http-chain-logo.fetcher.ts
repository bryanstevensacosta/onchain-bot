import { Injectable } from '@nestjs/common';
import { ChainLogoFetcherPort } from '../application/chain-logo-fetcher.port';

const FETCH_TIMEOUT_MS = 8000;

/**
 * HttpChainLogoFetcher (chain-logo resolver).
 *
 * Production `ChainLogoFetcherPort` over global fetch with a short
 * timeout. Any non-OK status, empty body, or network error resolves to
 * `null` so the service can fall through to CoinGecko/placeholder.
 */
@Injectable()
export class HttpChainLogoFetcher extends ChainLogoFetcherPort {
  public async fetchBytes(url: string): Promise<Buffer | null> {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        return null;
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      return bytes.length > 0 ? bytes : null;
    } catch {
      return null;
    }
  }

  public async fetchJson(url: string): Promise<{ image?: unknown } | null> {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        return null;
      }
      return (await res.json()) as { image?: unknown };
    } catch {
      return null;
    }
  }
}
