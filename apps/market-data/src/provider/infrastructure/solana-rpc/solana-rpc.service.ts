import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DataProviderPort } from '../../domain/data-provider.port';
import type { SolanaRpcConfig } from './solana-rpc.config';
import { SOLANA_RPC_CONFIG } from './solana-rpc.config';
import type {
  AccountInfoResult,
  BatchAccountsClient,
  GetMultipleAccountsResult,
  GetTokenLargestAccountsResult,
  GetTokenSupplyResult,
  JsonRpcResponse,
  SolanaAccountInfoValue,
  TokenAccountEntry,
} from './solana-rpc.types';

const PUBLIC_SOLANA_RPC = 'https://api.mainnet.solana.com';

/**
 * `getMultipleAccounts` chunk ceiling (Lane T, todo 22).
 *
 * QPS BUDGET (assumptions, numeric): the public RPC caps
 * `getMultipleAccounts` at 100 accounts per call (enforced upstream —
 * larger batches are rejected, not truncated). So N addresses cost
 * `ceil(N / 100)` RPC calls per URL attempt. Worst case here is 150
 * pool PDAs → 2 calls (one round, parallel chunks) against the primary
 * (Helius free tier: ~100 req/s burst on paid, ~10 req/s effective on
 * free — 2 parallel calls are noise) with the public-RPC fallback only
 * on transport failure (public RPC: 40 req/10s per IP rolling — a
 * single 2-call burst is ~5% of that window; backoff on 429 stays in
 * the aggregator, not here).
 */
export const GET_MULTIPLE_ACCOUNTS_CHUNK_SIZE = 100;

/**
 * Hostname-only rendering of an RPC URL for logs (dexter plan todo
 * 28): the keyed Helius URL carries the key in path/query — logs
 * must never carry it. Unparseable input renders a fixed token.
 */
const redactRpcHost = (url: string): string => {
  try {
    return new URL(url).hostname || 'unparseable';
  } catch {
    return 'unparseable';
  }
};

/**
 * Key/quota distress signal (dexter plan todo 28): 401/403/429 or a
 * quota-flavoured message. Anything else stays a quiet debug (fail-open).
 */
const isKeyOrQuotaSignal = (code: unknown, message: string): boolean => {
  if (code === 401 || code === 403 || code === 429) return true;
  return /quota|rate[\s-]?limit|unauthorized|forbidden|too many requests|exceed/i.test(
    message,
  );
};

const SOLANA_KEY_RUNBOOK =
  'check HELIUS_RPC_URL_MAINNET validity + Helius free-tier budget (10 rps); runbook: apps/market-data/AGENTS.md "Helius free-tier math"';

/**
 * Solana JSON-RPC provider.
 *
 * Primary: Helius RPC URL from config. Fallback: public Solana RPC
 * on transport errors only (404 / protocol errors short-circuit to null).
 *
 * Exposes `getTokenSupply` (total supply) + `getTokenLargestAccounts`
 * (holders data) and `getAccountInfo` (chain probing) as lightweight
 * JSON-RPC 2.0 calls. Plain RPC only — NO DAS/enhanced methods in
 * this hot path (Helius free tier ~10 rps effective; `HeliusService`
 * owns DAS, out of blast radius, never called here).
 */
@Injectable()
export class SolanaRpcService
  extends DataProviderPort
  implements BatchAccountsClient
{
  public readonly name = 'solana-rpc';
  protected readonly logger = new Logger(SolanaRpcService.name);

  public readonly primaryRpcUrl: string | null;

  public constructor(@Inject(SOLANA_RPC_CONFIG) config: SolanaRpcConfig) {
    super();
    this.primaryRpcUrl = config.primaryRpcUrl ?? null;
    if (this.primaryRpcUrl) {
      this.logger.log(
        `Solana RPC mode: keyed (primary host=${redactRpcHost(this.primaryRpcUrl)}, public fallback armed)`,
      );
    } else {
      this.logger.log(
        'Solana RPC mode: public-only (HELIUS_RPC_URL_MAINNET unset — set it to route via keyed Helius; Solana legs stay on the public RPC until then)',
      );
    }
  }

  /**
   * Total mint supply via `getTokenSupply` (uiAmount).
   * The RPC carries total only — no max / circulating leg exists
   * on-chain. Falls back to public RPC on transport errors.
   */
  public async getTokenSupply(
    mintAddress: string,
  ): Promise<GetTokenSupplyResult['value'] | null> {
    const rpcUrls = this.buildRpcUrls();
    for (const url of rpcUrls) {
      const result = await this.callRpc<GetTokenSupplyResult>(
        url,
        'getTokenSupply',
        [mintAddress],
      );
      if (result === null) continue;
      return result.value ?? null;
    }
    return null;
  }

  /**
   * Top-20 token holders via `getTokenLargestAccounts`.
   * Falls back to public RPC on transport errors.
   */
  public async getTokenLargestAccounts(
    mintAddress: string,
  ): Promise<ReadonlyArray<TokenAccountEntry> | null> {
    const rpcUrls = this.buildRpcUrls();
    for (const url of rpcUrls) {
      const result = await this.callRpc<GetTokenLargestAccountsResult>(
        url,
        'getTokenLargestAccounts',
        [mintAddress],
      );
      if (result === null) continue;
      return result.value ?? null;
    }
    return null;
  }

  /**
   * Account info via `getAccountInfo` for chain probing.
   * Returns null if the account does not exist or on transport errors.
   */
  public async getAccountInfo(
    address: string,
  ): Promise<AccountInfoResult['value'] | null> {
    const rpcUrls = this.buildRpcUrls();
    for (const url of rpcUrls) {
      const result = await this.callRpc<AccountInfoResult>(
        url,
        'getAccountInfo',
        [address, { encoding: 'base58', commitment: 'confirmed' }],
      );
      if (result === null) continue;
      return result.value ?? null;
    }
    return null;
  }

  /**
   * Batch account state via `getMultipleAccounts` (PDA-existence checks).
   * One entry per requested address IN ORDER; a missing account stays
   * an explicit `null` entry (callers map hits back to their candidates
   * by index). `base64` encoding: pool/curve accounts exceed the 128
   * decoded-byte ceiling the RPC enforces on `base58` data. Empty input
   * returns `[]` with no RPC call.
   *
   * CHUNKED (Lane T, todo 22): the RPC rejects batches > 100, so the
   * input is split into ≤100-address chunks fetched IN PARALLEL (one
   * round) and concatenated in order. Fail-open per chunk: a chunk
   * whose every URL fails resolves to `null`s for its slice — a dead
   * chunk NEVER fails the batch and this method NEVER throws (only
   * `[]` for empty input; no whole-batch `null` anymore — Lane S/E
   * build on the frozen `BatchAccountsClient.getMultiple` alias below).
   */
  public async getMultipleAccounts(
    addresses: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<SolanaAccountInfoValue | null>> {
    if (addresses.length === 0) return [];
    const chunks: string[][] = [];
    for (
      let i = 0;
      i < addresses.length;
      i += GET_MULTIPLE_ACCOUNTS_CHUNK_SIZE
    ) {
      chunks.push([
        ...addresses.slice(i, i + GET_MULTIPLE_ACCOUNTS_CHUNK_SIZE),
      ]);
    }
    const settled = await Promise.all(
      chunks.map((chunk) => this.fetchChunk(chunk)),
    );
    return settled.flat();
  }

  /**
   * Frozen Lane T alias of `getMultipleAccounts` (see
   * `BatchAccountsClient` in `solana-rpc.types.ts`). Lane S/E pool
   * readers depend on this name — do not rename.
   */
  public async getMultiple(
    addresses: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<SolanaAccountInfoValue | null>> {
    return this.getMultipleAccounts(addresses);
  }

  /**
   * One ≤100-address chunk against each URL in order (primary, then
   * public fallback). First URL with a well-formed array wins; every
   * URL failing (or answering a non-array) resolves to per-address
   * `null`s — never throws.
   */
  private async fetchChunk(
    chunk: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<SolanaAccountInfoValue | null>> {
    const rpcUrls = this.buildRpcUrls();
    for (const url of rpcUrls) {
      const result = await this.callRpc<GetMultipleAccountsResult>(
        url,
        'getMultipleAccounts',
        [[...chunk], { encoding: 'base64', commitment: 'confirmed' }],
      );
      if (result === null) continue;
      if (!Array.isArray(result.value)) continue;
      return chunk.map((_, i) => result.value?.[i] ?? null);
    }
    return chunk.map(() => null);
  }
  private async callRpc<T>(
    rpcUrl: string,
    method: string,
    params: ReadonlyArray<unknown>,
  ): Promise<T | null> {
    const tier = rpcUrl === this.primaryRpcUrl ? 'primary' : 'public';
    try {
      const { data } = await axios.post<JsonRpcResponse<T>>(
        rpcUrl,
        { jsonrpc: '2.0', id: 'solana-rpc', method, params },
        { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 },
      );
      if (data.error) {
        if (isKeyOrQuotaSignal(data.error.code, data.error.message)) {
          this.logger.warn(
            `solana-rpc ${method} key/quota signal on ${tier} [${String(data.error.code)}]: ${data.error.message} — ${SOLANA_KEY_RUNBOOK}`,
          );
        } else {
          this.logger.debug(`RPC ${method} error: ${data.error.message}`);
        }
        return null;
      }
      this.logger.debug(`solana-rpc ${method} served-by=${tier}`);
      return data.result ?? null;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 404) return null;
        if (isKeyOrQuotaSignal(status, (err as Error).message)) {
          this.logger.warn(
            `solana-rpc ${method} key/quota signal on ${tier} (http ${String(status ?? 'no-status')}): ${(err as Error).message} — ${SOLANA_KEY_RUNBOOK}`,
          );
          return null;
        }
      }
      this.logger.debug(`RPC ${method} failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Returns [primary, fallback] URLs, skipping any that are null.
   */
  private buildRpcUrls(): readonly string[] {
    const urls: string[] = [];
    if (this.primaryRpcUrl) urls.push(this.primaryRpcUrl);
    urls.push(PUBLIC_SOLANA_RPC);
    return urls;
  }
}
