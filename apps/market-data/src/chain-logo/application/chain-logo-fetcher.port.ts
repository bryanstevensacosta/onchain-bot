/**
 * ChainLogoFetcherPort (chain-logo resolver).
 *
 * Thin HTTP seam so the fetch-once service is unit-testable without
 * network. `null` means "upstream has nothing usable" (404, wrong
 * content, network error) — never throws for expected upstream gaps.
 */
export abstract class ChainLogoFetcherPort {
  public abstract fetchBytes(url: string): Promise<Buffer | null>;
  public abstract fetchJson(url: string): Promise<{ image?: unknown } | null>;
}

export const CHAIN_LOGO_FETCHER = 'CHAIN_LOGO_FETCHER';
