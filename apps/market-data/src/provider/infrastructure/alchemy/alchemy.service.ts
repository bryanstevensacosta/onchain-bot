import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DataProviderPort } from '../../domain/data-provider.port';
import type { AlchemyConfig } from './alchemy.config';
import { ALCHEMY_CONFIG } from './alchemy.config';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  TokenBalancesResponse,
  TransactionReceipt,
  LogEntry,
} from './alchemy.types';
import { chainRpcUrl, isChainSupported, type ChainRpc } from './alchemy.chains';

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
/**
 * Alchemy blockchain data provider — multi-chain EVM (Lane T, todo 22).
 *
 * Legacy single-chain methods (`getBalance`, `getChainId`,
 * `getTokenBalances`, `getLogs`, `getTransactionReceipt`,
 * `getBlockNumber`) stay eth-mainnet-only. The on-chain transport
 * surface (`getCode`, `getTransactionCount`, `ethCall`) is per-chain
 * via `EVM_CHAIN_TRANSPORTS` (`alchemy.chains.ts`) and satisfies the
 * frozen `ChainRpc` contract Lane S/E readers build against.
 */
export class AlchemyService extends DataProviderPort implements ChainRpc {
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
  //  Chain-routed transport (Lane T: ChainRpc surface)
  // ─────────────────────────────────────────────

  /**
   * Per-chain JSON-RPC call. Unknown chain ⇒ `null` (never throws);
   * supports `AbortSignal` so multicall timeouts cancel in-flight
   * HTTP instead of merely ignoring late winners.
   */
  public async rpcCallForChain<T>(
    chain: string,
    method: string,
    params?: unknown[],
    options?: { readonly signal?: AbortSignal },
  ): Promise<T | null> {
    if (!this.apiKey) return null;
    const url = chainRpcUrl(chain, this.apiKey);
    if (url === null) {
      this.logger.debug(`Alchemy ${method}: unsupported chain ${chain}`);
      return null;
    }
    try {
      const body: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: `alc-${chain}-${Date.now()}`,
        method,
        params,
      };
      const { data } = await axios.post<JsonRpcResponse<T>>(url, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 8_000,
        signal: options?.signal,
      });
      if (data.error) {
        this.logger.debug(
          `Alchemy ${chain} ${method} error [${data.error.code}]: ${data.error.message}`,
        );
        return null;
      }
      return data.result ?? null;
    } catch (err) {
      this.logger.debug(
        `Alchemy ${chain} ${method} failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  public isChainSupported(chain: string): boolean {
    return isChainSupported(chain);
  }

  // ─────────────────────────────────────────────
  //  Account & chain data (mainnet-only legacy)
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
   * Single-arg form stays eth-mainnet (backend `evm-chain-prober`
   * calls it); the two-arg form is the frozen `ChainRpc.getCode`.
   *
   * @see https://docs.alchemy.com/reference/eth-getcode
   */
  public async getCode(address: string): Promise<string | null>;
  public async getCode(chain: string, address: string): Promise<string | null>;
  public async getCode(first: string, second?: string): Promise<string | null> {
    if (second === undefined) {
      return this.rpcCall<string>('eth_getCode', [first, 'latest']);
    }
    return this.rpcCallForChain<string>(first, 'eth_getCode', [
      second,
      'latest',
    ]);
  }

  /**
   * Transaction count (hex nonce) — EOA-vs-dead signal for Lane T
   * existence checks. Frozen `ChainRpc.getTransactionCount`.
   *
   * @see https://docs.alchemy.com/reference/eth-gettransactioncount
   */
  public async getTransactionCount(
    chain: string,
    address: string,
  ): Promise<string | null> {
    return this.rpcCallForChain<string>(chain, 'eth_getTransactionCount', [
      address,
      'latest',
    ]);
  }

  /**
   * Raw read-only contract invocation on any supported chain.
   * Frozen `ChainRpc.ethCall` — returns raw hex return-data,
   * `null` on revert/transport failure (never throws).
   *
   * NOTE (Lane T breaking change): the old mainnet-only
   * `ethCall(to, data, block?)` is now `ethCall(chain, to, data,
   * block?)`. No in-repo callers existed (verified 2026-10-05);
   * the backend `evm-chain-prober` only uses `getCode(address)`,
   * which keeps its single-arg form.
   *
   * @see https://docs.alchemy.com/reference/eth-call-rpc
   */
  public async ethCall(
    chain: string,
    to: string,
    data: string,
    block: string = 'latest',
    options?: { readonly signal?: AbortSignal },
  ): Promise<string | null> {
    return this.rpcCallForChain<string>(
      chain,
      'eth_call',
      [{ to, data }, block],
      options,
    );
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
