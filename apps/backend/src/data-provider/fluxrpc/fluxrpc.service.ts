import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DataProviderPort } from 'data-provider/core/data-provider.port';
import type { FluxRpcConfig } from './fluxrpc.config';
import { FLUXRPC_CONFIG } from './fluxrpc.config';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  SolanaBalanceResponse,
  SolanaTransactionResponse,
} from './fluxrpc.types';

/**
 * FluxRPC Solana RPC provider.
 *
 * Wraps standard Solana JSON-RPC methods via FluxRPC's HTTP endpoint.
 * Supports mainnet Solana only (devnet may be available on request).
 *
 * @see https://fluxrpc.com/docs
 */
@Injectable()
export class FluxRpcService extends DataProviderPort {
  public readonly name = 'fluxrpc';
  protected readonly logger = new Logger(FluxRpcService.name);

  private readonly apiKey: string;
  private readonly rpcUrl: string;

  public constructor(@Inject(FLUXRPC_CONFIG) config: FluxRpcConfig) {
    super();
    this.apiKey = config.apiKey;
    this.rpcUrl = config.rpcUrl;
    if (!config.apiKey || !config.rpcUrl) {
      this.logger.warn(
        'FLUXRPC_API_KEY or FLUXRPC_RPC missing — FluxRPC provider will return null',
      );
    }
  }

  public async onModuleInit(): Promise<void> {
    if (this.apiKey && this.rpcUrl) {
      this.logger.log('FluxRPC provider initialized');
    }
  }

  // ─────────────────────────────────────────────
  //  JSON-RPC (shared by all methods)
  // ─────────────────────────────────────────────

  /**
   * Generic JSON-RPC call. Helper is justified for Solana JSON-RPC protocol.
   *
   * @param method - JSON-RPC method (e.g. getBalance, getSlot)
   * @param params - Method parameters
   * @see https://solana.com/docs/rpc
   */
  public async rpcCall<T>(
    method: string,
    params?: unknown[],
  ): Promise<T | null> {
    if (!this.apiKey || !this.rpcUrl) return null;
    try {
      const body: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: `flux-${Date.now()}`,
        method,
        params,
      };
      const rpcEndpoint = `${this.rpcUrl}${this.rpcUrl.includes('?') ? '&' : '?'}key=${this.apiKey}`;
      const { data } = await axios.post<JsonRpcResponse<T>>(rpcEndpoint, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 8_000,
      });
      if (data.error) {
        this.logger.debug(
          `FluxRPC ${method} error [${data.error.code}]: ${data.error.message}`,
        );
        return null;
      }
      return data.result ?? null;
    } catch (err) {
      this.logger.debug(`FluxRPC ${method} failed: ${(err as Error).message}`);
      return null;
    }
  }

  // ─────────────────────────────────────────────
  //  Account data
  // ─────────────────────────────────────────────

  /**
   * SOL balance for an address (in lamports).
   *
   * @param address - Solana wallet address
   */
  public async getBalance(address: string): Promise<number | null> {
    return this.rpcCall<SolanaBalanceResponse>('getBalance', [address]).then(
      (r) => r?.value ?? null,
    );
  }

  /**
   * Token accounts by owner (SPL tokens).
   *
   * @param owner - Solana wallet address
   */
  public async getTokenAccountsByOwner(owner: string): Promise<unknown> {
    return this.rpcCall('getTokenAccountsByOwner', [
      owner,
      { encoding: 'jsonParsed' },
    ]);
  }

  /**
   * Get multiple accounts at once.
   *
   * @param addresses - Array of Solana addresses
   */
  public async getMultipleAccounts(
    addresses: readonly string[],
  ): Promise<unknown> {
    return this.rpcCall('getMultipleAccounts', [
      [...addresses],
      { encoding: 'jsonParsed' },
    ]);
  }

  // ─────────────────────────────────────────────
  //  Transactions & blocks
  // ─────────────────────────────────────────────

  /**
   * Transaction details by signature.
   *
   * @param signature - Transaction signature
   */
  public async getTransaction(
    signature: string,
  ): Promise<SolanaTransactionResponse | null> {
    return this.rpcCall<SolanaTransactionResponse>('getTransaction', [
      signature,
      { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
    ]);
  }

  /**
   * Current slot number.
   */
  public async getSlot(): Promise<number | null> {
    return this.rpcCall<number>('getSlot');
  }

  /**
   * Latest blockhash (for building transactions).
   */
  public async getLatestBlockhash(): Promise<{
    blockhash: string;
    lastValidBlockHeight: number;
  } | null> {
    const result = await this.rpcCall<{
      context: { slot: number };
      value: { blockhash: string; lastValidBlockHeight: number };
    }>('getLatestBlockhash');
    return result?.value ?? null;
  }
}
