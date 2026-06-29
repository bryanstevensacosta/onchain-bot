import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DataProviderPort } from 'data-provider/core/data-provider.port';
import type { AlchemyConfig } from './alchemy.config';
import { ALCHEMY_CONFIG } from './alchemy.config';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  TokenBalancesResponse,
  TransactionReceipt,
  LogEntry,
} from './alchemy.types';

const BASE = 'https://eth-mainnet.g.alchemy.com/v2';

/**
 * Alchemy blockchain data provider — EVM mainnet.
 *
 * Exposes standard JSON-RPC methods and Alchemy Enhanced APIs:
 * - Core: eth_getBalance, eth_getCode, eth_call, eth_chainId
 * - Tokens: alchemy_getTokenBalances
 * - Logs: eth_getLogs
 * - Transactions: eth_getTransactionReceipt
 *
 * @see https://docs.alchemy.com/
 */
@Injectable()
export class AlchemyService extends DataProviderPort {
  public readonly name = 'alchemy';
  protected readonly logger = new Logger(AlchemyService.name);

  public readonly apiKey: string;
  private readonly rpcUrl: string;

  public constructor(@Inject(ALCHEMY_CONFIG) config: AlchemyConfig) {
    super();
    this.apiKey = config.apiKey;
    this.rpcUrl = `${BASE}/${config.apiKey}`;
    if (!config.apiKey) {
      this.logger.warn(
        'ALCHEMY_API_KEY missing — Alchemy provider will return null',
      );
    }
  }

  public async onModuleInit(): Promise<void> {
    if (this.apiKey) {
      this.logger.log('Alchemy provider initialized');
    }
  }

  // ─────────────────────────────────────────────
  //  JSON-RPC (shared by all methods)
  // ─────────────────────────────────────────────

  /**
   * Generic JSON-RPC call.
   *
   * Used internally by all public methods. JSON-RPC is the standard
   * Ethereum protocol — the helper is justified here unlike REST providers.
   *
   * @param method - JSON-RPC method (e.g. eth_getBalance)
   * @param params - Method parameters
   * @see https://docs.alchemy.com/reference/eth-call-rpc
   */
  public async rpcCall<T>(
    method: string,
    params?: unknown[],
  ): Promise<T | null> {
    if (!this.apiKey) return null;
    try {
      const body: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: `alc-${Date.now()}`,
        method,
        params,
      };
      const { data } = await axios.post<JsonRpcResponse<T>>(this.rpcUrl, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 8_000,
      });
      if (data.error) {
        this.logger.debug(
          `Alchemy ${method} error [${data.error.code}]: ${data.error.message}`,
        );
        return null;
      }
      return data.result ?? null;
    } catch (err) {
      this.logger.debug(`Alchemy ${method} failed: ${(err as Error).message}`);
      return null;
    }
  }

  // ─────────────────────────────────────────────
  //  Account & chain data
  // ─────────────────────────────────────────────

  /**
   * ETH balance for an address (in wei, hex string).
   *
   * @param address - Ethereum address
   * @see https://docs.alchemy.com/reference/eth-getbalance
   */
  public async getBalance(address: string): Promise<string | null> {
    return this.rpcCall<string>('eth_getBalance', [address, 'latest']);
  }

  /**
   * Contract bytecode — empty result means the address is an EOA.
   *
   * @param address - Ethereum address
   * @see https://docs.alchemy.com/reference/eth-getcode
   */
  public async getCode(address: string): Promise<string | null> {
    return this.rpcCall<string>('eth_getCode', [address, 'latest']);
  }

  /**
   * Execute an eth_call (read-only contract invocation).
   *
   * @param to    - Target contract address
   * @param data  - Encoded calldata (ABI-encoded function + args)
   * @param block - Block tag (default: latest)
   * @see https://docs.alchemy.com/reference/eth-call-rpc
   */
  public async ethCall(
    to: string,
    data: string,
    block: string = 'latest',
  ): Promise<string | null> {
    return this.rpcCall<string>('eth_call', [{ to, data }, block]);
  }

  /**
   * Chain ID (e.g. 1 = Ethereum mainnet, 137 = Polygon).
   *
   * @see https://docs.alchemy.com/reference/eth-chainid
   */
  public async getChainId(): Promise<number | null> {
    return this.rpcCall<string>('eth_chainId').then((hex) =>
      hex ? Number.parseInt(hex, 16) : null,
    );
  }

  // ─────────────────────────────────────────────
  //  Tokens & balances
  // ─────────────────────────────────────────────

  /**
   * Token balances for an address (Alchemy Enhanced API).
   *
   * @param address           - Owner address
   * @param contractAddresses - Optional filter (default: DEFAULT_TOKENS)
   * @see https://docs.alchemy.com/reference/alchemy-gettokenbalances
   */
  public async getTokenBalances(
    address: string,
    contractAddresses?: readonly string[],
  ): Promise<TokenBalancesResponse | null> {
    const params: unknown[] = contractAddresses
      ? [address, [...contractAddresses]]
      : [address, 'DEFAULT_TOKENS'];
    return this.rpcCall<TokenBalancesResponse>(
      'alchemy_getTokenBalances',
      params,
    );
  }

  // ─────────────────────────────────────────────
  //  Logs & transactions
  // ─────────────────────────────────────────────

  /**
   * Logs matching a filter (event logs, e.g. Swap events).
   *
   * @param filter - Address, block range, and topics
   * @see https://docs.alchemy.com/reference/eth-getlogs
   */
  public async getLogs(filter: {
    address?: string;
    fromBlock?: string;
    toBlock?: string;
    topics?: ReadonlyArray<string | null>;
  }): Promise<ReadonlyArray<LogEntry> | null> {
    return this.rpcCall<{ readonly logs: ReadonlyArray<LogEntry> }>(
      'eth_getLogs',
      [filter],
    ).then((r) => r?.logs ?? null);
  }

  /**
   * Transaction receipt by hash.
   *
   * @param txHash - Transaction hash
   * @see https://docs.alchemy.com/reference/eth-gettransactionreceipt
   */
  public async getTransactionReceipt(
    txHash: string,
  ): Promise<TransactionReceipt | null> {
    return this.rpcCall<TransactionReceipt>('eth_getTransactionReceipt', [
      txHash,
    ]);
  }

  /**
   * Latest block number.
   *
   * @see https://docs.alchemy.com/reference/eth-blocknumber
   */
  public async getBlockNumber(): Promise<number | null> {
    return this.rpcCall<string>('eth_blockNumber').then((hex) =>
      hex ? Number.parseInt(hex, 16) : null,
    );
  }
}
