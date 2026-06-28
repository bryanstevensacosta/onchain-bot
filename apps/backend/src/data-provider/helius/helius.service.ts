import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DataProviderPort } from 'data-provider/core/data-provider.port';
import type { HeliusConfig } from './helius.config';
import { HELIUS_CONFIG } from './helius.config';
import type {
  HeliusGetTokenAccountsResponse,
  HeliusDasResponse,
  HeliusParsedTransaction,
} from './helius.types';

const RPC_BASE = 'https://mainnet.helius-rpc.com';

/**
 * Helius Solana data provider — unified service.
 *
 * Combines RPC (standard + DAS) and Enhanced Transactions API
 * for Solana token metadata, holder counts, and parsed transactions.
 *
 * @see https://docs.helius.dev/
 */
@Injectable()
export class HeliusService extends DataProviderPort {
  public readonly name = 'helius';
  protected readonly logger = new Logger(HeliusService.name);

  private readonly apiKey: string;
  private readonly rpcUrl: string | null;
  private readonly dasUrl: string | null;

  public constructor(@Inject(HELIUS_CONFIG) config: HeliusConfig) {
    super();
    this.apiKey = config.apiKey;
    if (config.apiKey && config.mainnet?.rpcUrl) {
      this.rpcUrl = config.mainnet.rpcUrl;
      this.dasUrl = `${RPC_BASE}/?api-key=${config.apiKey}`;
    } else {
      this.logger.warn(
        'HELIUS_API_KEY or HELIUS_RPC_URL_MAINNET missing — Helius provider will return null',
      );
      this.rpcUrl = null;
      this.dasUrl = null;
    }
  }

  public async onModuleInit(): Promise<void> {
    if (this.apiKey && this.rpcUrl) {
      this.logger.log('Helius provider initialized');
    }
  }

  // ─────────────────────────────────────────────
  //  JSON-RPC (RPC + DAS)
  // ─────────────────────────────────────────────

  /**
   * Generic JSON-RPC call — used for both standard RPC and DAS API.
   *
   * @param url    - Target endpoint (rpcUrl or dasUrl)
   * @param method - JSON-RPC method (e.g. getTokenAccounts, getAsset)
   * @param params - Method parameters
   */
  private async jsonRpc<T>(
    url: string,
    method: string,
    params: unknown,
  ): Promise<T | null> {
    try {
      const { data } = await axios.post<{
        result?: T;
        error?: { code: number; message: string };
      }>(
        url,
        { jsonrpc: '2.0', id: `hel-${Date.now()}`, method, params },
        { headers: { 'Content-Type': 'application/json' }, timeout: 8_000 },
      );
      if (data.error) {
        this.logger.debug(`Helius ${method} error: ${data.error.message}`);
        return null;
      }
      return data.result ?? null;
    } catch (err) {
      this.logger.debug(`Helius ${method} failed: ${(err as Error).message}`);
      return null;
    }
  }

  // ─────────────────────────────────────────────
  //  Token holders & asset data
  // ─────────────────────────────────────────────

  /**
   * SPL token accounts by mint (holder count).
   *
   * @param mint - SPL token mint address
   */
  public async getTokenAccounts(mint: string): Promise<{
    readonly total: number;
    readonly distinctOwners: number;
    readonly holders: number | null;
  } | null> {
    if (!this.rpcUrl) return null;
    const result = await this.jsonRpc<HeliusGetTokenAccountsResponse['result']>(
      this.rpcUrl,
      'getTokenAccounts',
      { mint, page: 1, limit: 1000 },
    );
    if (!result) return null;
    const total =
      typeof result.total === 'number' && Number.isFinite(result.total)
        ? result.total
        : 0;
    const owners = new Set<string>();
    for (const acc of result.token_accounts ?? []) {
      if (typeof acc.owner === 'string' && acc.owner.length > 0) {
        owners.add(acc.owner);
      }
    }
    const distinctOwners = owners.size;
    const holders =
      total > 0 || distinctOwners > 0 ? Math.max(total, distinctOwners) : null;
    return { total, distinctOwners, holders };
  }

  /**
   * Asset metadata via DAS API — name, symbol, image, supply, price.
   *
   * @param id - Asset ID (mint address)
   * @see https://docs.helius.dev/digital-asset-standard-das-api
   */
  public async getAsset(
    id: string,
  ): Promise<HeliusDasResponse['result'] | null> {
    if (!this.dasUrl) return null;
    return this.jsonRpc<HeliusDasResponse['result']>(this.dasUrl, 'getAsset', {
      id,
      displayOptions: { showFungible: true },
    });
  }

  // ─────────────────────────────────────────────
  //  Enhanced Transactions API
  // ─────────────────────────────────────────────

  /**
   * Parse a transaction by signature (Helius Enhanced Transactions API).
   *
   * @param signature - Transaction signature
   * @see https://docs.helius.dev/enhanced-transactions-api
   */
  public async parseTransaction(
    signature: string,
  ): Promise<HeliusParsedTransaction | null> {
    if (!this.apiKey) return null;
    try {
      const url = `https://api.helius.xyz/v0/transactions/?api-key=${this.apiKey}`;
      const { data } = await axios.post<ReadonlyArray<HeliusParsedTransaction>>(
        url,
        { transactions: [signature] },
        { timeout: 8_000 },
      );
      return (
        Array.isArray(data) ? (data[0] ?? null) : null
      ) as HeliusParsedTransaction | null;
    } catch (err) {
      this.logger.debug(
        `Helius parseTransaction failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Address history — parsed transactions for a wallet or mint.
   *
   * @param address - Wallet or mint address
   * @param limit   - Max results (default: 100)
   * @see https://docs.helius.dev/enhanced-transactions-api/address-history
   */
  public async getAddressHistory(
    address: string,
    limit: number = 100,
  ): Promise<ReadonlyArray<HeliusParsedTransaction> | null> {
    if (!this.apiKey) return null;
    try {
      const url = `https://api.helius.xyz/v0/addresses/${address}/transactions`;
      const { data } = await axios.get<ReadonlyArray<HeliusParsedTransaction>>(
        url,
        { params: { apiKey: this.apiKey, limit }, timeout: 8_000 },
      );
      return Array.isArray(data) ? data : null;
    } catch (err) {
      this.logger.debug(
        `Helius getAddressHistory failed: ${(err as Error).message}`,
      );
      return null;
    }
  }
}
