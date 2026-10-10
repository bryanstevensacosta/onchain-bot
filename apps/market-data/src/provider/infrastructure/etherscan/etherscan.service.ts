import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { throwIfRetryableProviderError } from '../../domain/retryable-provider.error';
import { DataProviderPort } from '../../domain/data-provider.port';
import type { EtherscanConfig } from './etherscan.config';
import { ETHERSCAN_CONFIG } from './etherscan.config';
import type {
  EtherscanSourceCodeRow,
  EtherscanV2Envelope,
} from './etherscan.types';

const DEFAULT_BASE_URL = 'https://api.etherscan.io/v2/api';

function isSourceCodeRows(
  value: unknown,
): value is ReadonlyArray<EtherscanSourceCodeRow> {
  return Array.isArray(value);
}

/**
 * Our chain id -> Etherscan V2 `chainid` (dexter plan todo 32).
 *
 * Chain ids per https://docs.etherscan.io/supported-chains. Solana is
 * NOT mappable (non-EVM, no V2 surface — excluded, never guessed).
 *
 * Free-tier caveat (same page): free covers ethereum/polygon/arbitrum/
 * unichain (+ robinhood/arc only until 2026-10-15, then Lite $49+);
 * bsc/base/optimism are paid-tier-only. The fetcher attempts every
 * mapped chain — a free-key PRO/tier rejection collapses to null with
 * the tier caveat (never throws, never blocks the card).
 */
export const ETHERSCAN_CHAIN_IDS: Readonly<Record<string, number>> = {
  ethereum: 1,
  bsc: 56,
  base: 8453,
  arbitrum: 42161,
  polygon: 137,
  optimism: 10,
  unichain: 130,
  robinhood: 4663,
};

/**
 * Our chains whose snapshots may consult Etherscan (dexter plan
 * todo 32): the chainid-map entries that also exist in `STATIC_CHAINS`.
 * `optimism` + `unichain` stay mapped-but-unqueried until the catalog
 * lands (birdeye/gecko precedent).
 */
export const ETHERSCAN_SUPPORTED_CHAINS: ReadonlyArray<string> = [
  'ethereum',
  'bsc',
  'base',
  'arbitrum',
  'polygon',
  'robinhood',
];

/**
 * Resolve our chain id to its V2 `chainid`, or `null` when unmapped
 * (honest null — the caller must NOT default to mainnet).
 */
export function resolveEtherscanChainId(chain: string): number | null {
  return ETHERSCAN_CHAIN_IDS[chain] ?? null;
}

/**
 * Etherscan V2 provider — keyed enrichment legs (dexter plan todo 32).
 *
 * KEY OBLIGATORY (`ETHERSCAN_API_KEY`, owner creates one at
 * https://etherscan.io/apis — setup https://docs.etherscan.io/set-up-your-api-key).
 * Without a key every method returns null ZERO-network (skip-if-absent,
 * moralis precedent) — the DEFAULT state until the owner wires a key.
 *
 * Pinned `action=` per field (https://docs.etherscan.io/endpoint-overview):
 * - supply: `module=token&action=tokensupply&contractaddress=` (raw base
 *   units — see fetcher note on why it never maps to `totalSupply`).
 * - holders: `module=token&action=tokenholdercount&contractaddress=`
 *   (exact count; PRO-gated = Standard plan+, so free-key answers null —
 *   documented tier caveat, not a bug).
 * - verified: `module=contract&action=getsourcecode&address=` (free on
 *   ALL chains incl. free tier; empty `SourceCode` = unverified).
 *
 * Gate (todo 32): 4663 on a free key is UNVERIFIED without a key —
 * `wontfix-documentado` (no key in shell or `.env` 2026-10-09; free
 * Robinhood/Arc window EXPIRES 2026-10-15 per
 * https://docs.etherscan.io/supported-chains — a key minted after
 * must re-verify or go Lite $49).
 *
 * Quota math (https://docs.etherscan.io/rate-limits): free = 3 calls/s,
 * 100k/day. Our outbound bucket pins 60/min (conservative: 1 call per
 * snapshot worst case = 1/scan, far under 3/s; burst spacing honors
 * `Retry-After` via the 19b2 cap — `min(header,2000ms)` + jitter,
 * never 120s).
 */
@Injectable()
export class EtherscanService extends DataProviderPort {
  public readonly name = 'etherscan';
  protected readonly logger = new Logger(EtherscanService.name);

  private readonly apiKey: string;
  private readonly baseUrl: string;

  public constructor(@Inject(ETHERSCAN_CONFIG) config: EtherscanConfig) {
    super();
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    if (!this.apiKey) {
      this.logger.warn(
        'ETHERSCAN_API_KEY missing — Etherscan provider will return null',
      );
    }
  }

  public async onModuleInit(): Promise<void> {
    if (this.apiKey) {
      this.logger.log('Etherscan provider initialized');
    }
  }

  private async callV2<T>(
    chainid: number,
    params: Readonly<Record<string, string>>,
  ): Promise<T | null> {
    try {
      const { data } = await axios.get<EtherscanV2Envelope<T>>(this.baseUrl, {
        params: { chainid, apikey: this.apiKey, ...params },
        timeout: 8_000,
      });
      if (data?.status !== '1') {
        return null;
      }
      return data.result ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return null;
      }
      // 19b2: transient (timeout / 429-with-Retry-After / 5xx) surfaces
      // for the per-fetcher single retry (Retry-After capped at 2000ms
      // + jitter inside); absence stays null.
      throwIfRetryableProviderError(err, 'etherscan');
      this.logger.debug(`Etherscan V2 failed: ${(err as Error).message}`);
      return null;
    }
  }

  private guardedChainId(chain: string): number | null {
    if (!this.apiKey) {
      return null;
    }
    return resolveEtherscanChainId(chain);
  }

  /**
   * Raw total supply in base units (`action=tokensupply`).
   *
   * UNIT-UNSAFE: the result carries NO decimals, so the snapshot
   * fetcher NEVER maps it to `totalSupply` (UI units) — mapping raw
   * base units would poison downstream math by 10^decimals. Exposed
   * for future decimals-aware consumers only.
   */
  public async getTokenSupplyRaw(
    chain: string,
    address: string,
  ): Promise<string | null> {
    const chainid = this.guardedChainId(chain);
    if (chainid === null || address.trim().length === 0) {
      return null;
    }
    const result = await this.callV2<string>(chainid, {
      module: 'token',
      action: 'tokensupply',
      contractaddress: address,
    });
    return typeof result === 'string' && result.trim().length > 0
      ? result
      : null;
  }

  /**
   * Exact holder count (`action=tokenholdercount`).
   *
   * PRO-gated (Standard plan+): free-key answers collapse to null via
   * the envelope check above — expected, documented, fail-open.
   */
  public async getTokenHolderCount(
    chain: string,
    address: string,
  ): Promise<number | null> {
    const chainid = this.guardedChainId(chain);
    if (chainid === null || address.trim().length === 0) {
      return null;
    }
    const result = await this.callV2<string | number>(chainid, {
      module: 'token',
      action: 'tokenholdercount',
      contractaddress: address,
    });
    const parsed =
      typeof result === 'number' ? result : parseInt(String(result), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  /**
   * Contract verification (`action=getsourcecode`, free on all chains).
   *
   * `SnapshotQuote` has NO verified column (snapshot-core change is out
   * of scope), so the fetcher never maps this — exposed for future
   * detector/venue consumers.
   */
  public async isContractVerified(
    chain: string,
    address: string,
  ): Promise<boolean | null> {
    const chainid = this.guardedChainId(chain);
    if (chainid === null || address.trim().length === 0) {
      return null;
    }
    const rows = await this.callV2<ReadonlyArray<EtherscanSourceCodeRow>>(
      chainid,
      { module: 'contract', action: 'getsourcecode', address },
    );
    if (!isSourceCodeRows(rows) || rows.length === 0) {
      return null;
    }
    const source = rows[0]?.SourceCode;
    if (typeof source !== 'string') {
      return null;
    }
    return source.trim().length > 0;
  }
}
