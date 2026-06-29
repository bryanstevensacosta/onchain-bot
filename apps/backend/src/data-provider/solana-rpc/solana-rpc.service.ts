import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DataProviderPort } from 'data-provider/core/data-provider.port';
import type { SolanaRpcConfig } from './solana-rpc.config';
import { SOLANA_RPC_CONFIG } from './solana-rpc.config';
import type {
  AccountInfoResult,
  GetTokenLargestAccountsResult,
  JsonRpcResponse,
  TokenAccountEntry,
} from './solana-rpc.types';

const PUBLIC_SOLANA_RPC = 'https://api.mainnet.solana.com';

/**
 * Solana JSON-RPC provider.
 *
 * Primary: Helius RPC URL from config. Fallback: public Solana RPC
 * on transport errors only (404 / protocol errors short-circuit to null).
 *
 * Exposes `getTokenLargestAccounts` (holders data) and `getAccountInfo`
 * (chain probing) as lightweight JSON-RPC 2.0 calls.
 */
@Injectable()
export class SolanaRpcService extends DataProviderPort {
  public readonly name = 'solana-rpc';
  protected readonly logger = new Logger(SolanaRpcService.name);

  public readonly primaryRpcUrl: string | null;

  public constructor(@Inject(SOLANA_RPC_CONFIG) config: SolanaRpcConfig) {
    super();
    this.primaryRpcUrl = config.primaryRpcUrl ?? null;
    if (!this.primaryRpcUrl) {
      this.logger.debug(
        'No primary RPC URL configured — will use public Solana RPC',
      );
    }
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

  private async callRpc<T>(
    rpcUrl: string,
    method: string,
    params: ReadonlyArray<unknown>,
  ): Promise<T | null> {
    try {
      const { data } = await axios.post<JsonRpcResponse<T>>(
        rpcUrl,
        { jsonrpc: '2.0', id: 'solana-rpc', method, params },
        { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 },
      );
      if (data.error) {
        this.logger.debug(`RPC ${method} error: ${data.error.message}`);
        return null;
      }
      return data.result ?? null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
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
